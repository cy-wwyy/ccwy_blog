import hashlib
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.blog.models import Post
from app.core.config import settings
from app.stats.models import (
    DailyStat,
    HourlyStat,
    PageView,
    PostViewStat,
)

_SLOT_SECONDS = 1800  # 半小时去重窗口


def visitor_key(ip: str, ua: str) -> str:
    """无 cookie 时的兜底标识：IP+UA。掺入 SECRET_KEY，不落原始 IP。"""
    return _hash(f"ip:{ip}:{ua}")


def visitor_key_cookie(vid: str) -> str:
    """有 cookie 时的主标识：更稳定，跨网络/跨天不变。"""
    return _hash(f"cookie:{vid}")


def _hash(seed: str) -> str:
    return hashlib.sha256(f"{settings.SECRET_KEY}:{seed}".encode()).hexdigest()


def _dedup_key(kind: str, target_id: str | None, vkey: str, slot: int) -> str:
    raw = f"{kind}:{target_id or 'site'}:{vkey}:{slot}".encode()
    return hashlib.sha256(raw).hexdigest()


async def record_view(
    *,
    session: AsyncSession,
    kind: str,
    vkey: str,
    post_id: str | None = None,
    album_id: str | None = None,
    now: datetime | None = None,
) -> bool:
    """记一次访问；半小时内同一人同一目标重复则忽略。返回是否真正新增。"""
    now = now or datetime.now(UTC)
    slot = int(now.timestamp()) // _SLOT_SECONDS
    dedup = _dedup_key(kind, post_id or album_id, vkey, slot)
    view = PageView(
        kind=kind,
        post_id=post_id,
        album_id=album_id,
        visitor_key=vkey,
        dedup_key=dedup,
        created_at=now,
    )
    session.add(view)
    try:
        await session.commit()
        return True
    except IntegrityError:
        await session.rollback()  # 命中唯一约束 = 半小时内重复
        return False


# ── 浏览量（内容维度）────────────────────────────────


async def views_by_posts(
    *, session: AsyncSession, post_ids: list[str]
) -> dict[str, int]:
    if not post_ids:
        return {}
    stmt = (
        select(PageView.post_id, func.count())
        .where(PageView.kind == "post", col(PageView.post_id).in_(post_ids))
        .group_by(PageView.post_id)
    )
    return {pid: n for pid, n in (await session.exec(stmt)).all() if pid}


async def views_by_albums(
    *, session: AsyncSession, album_ids: list[str]
) -> dict[str, int]:
    if not album_ids:
        return {}
    stmt = (
        select(PageView.album_id, func.count())
        .where(PageView.kind == "album", col(PageView.album_id).in_(album_ids))
        .group_by(PageView.album_id)
    )
    return {aid: n for aid, n in (await session.exec(stmt)).all() if aid}


async def count_post_views(*, session: AsyncSession, post_id: str) -> int:
    stmt = select(func.count()).where(
        PageView.kind == "post", PageView.post_id == post_id
    )
    return (await session.exec(stmt)).one()


async def count_album_views(*, session: AsyncSession, album_id: str) -> int:
    stmt = select(func.count()).where(
        PageView.kind == "album", PageView.album_id == album_id
    )
    return (await session.exec(stmt)).one()


# ── 访客量（站点维度，UV）────────────────────────────


async def visitors_total(*, session: AsyncSession) -> int:
    stmt = select(func.count(func.distinct(PageView.visitor_key))).where(
        PageView.kind == "site"
    )
    return (await session.exec(stmt)).one()


def local_day_start_utc(now: datetime | None = None) -> datetime:
    """当前**本地日**零点对应的 UTC 时刻。

    SQLite 存的是 UTC 裸时间，直接 `now.replace(hour=0)` 截的是 UTC 零点，
    在东八区会把 00:00–08:00 的访问算进"昨天"。这里统一按
    STATS_TZ_OFFSET_HOURS 折算，与 daily_stats 的按日分桶口径保持一致。
    """
    now = now or datetime.now(UTC)
    offset = timedelta(hours=settings.STATS_TZ_OFFSET_HOURS)
    local_midnight = (now + offset).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return local_midnight - offset


async def visitors_today(
    *, session: AsyncSession, now: datetime | None = None
) -> int:
    start = local_day_start_utc(now)
    stmt = select(func.count(func.distinct(PageView.visitor_key))).where(
        PageView.kind == "site", PageView.created_at >= start
    )
    return (await session.exec(stmt)).one()


# ── 热门文章榜（后台）────────────────────────────────


async def post_view_stats(
    *, session: AsyncSession, limit: int = 10
) -> list[PostViewStat]:
    stmt = (
        select(Post.id, Post.title, Post.slug, func.count().label("views"))
        .join(PageView, PageView.post_id == Post.id)
        .where(PageView.kind == "post")
        .group_by(Post.id, Post.title, Post.slug)
        .order_by(func.count().desc())
        .limit(limit)
    )
    rows = (await session.exec(stmt)).all()
    return [
        PostViewStat(id=r.id, title=r.title, slug=r.slug, views=r.views)
        for r in rows
    ]


# ── 时序聚合（后台图表）─────────────────────────────────────
#
# 数据库当前是 SQLite，存的是 UTC 裸时间字符串。按「本地日/小时」分桶必须先
# 加时区偏移再截断，所以用 SQLite 的 date()/strftime() + modifier。
# 切 PostgreSQL 时把这两个 helper 换成 date_trunc / EXTRACT 即可，调用方不用动。


def _tz_modifier() -> str:
    """SQLite 修饰符，例如 '+8 hours'。"""
    offset = settings.STATS_TZ_OFFSET_HOURS
    return f"{offset:+d} hours"


def _local_today() -> date:
    return (datetime.now(UTC) + timedelta(hours=settings.STATS_TZ_OFFSET_HOURS)).date()


def _since_utc(days: int) -> datetime:
    """覆盖最近 days 个本地日的 UTC 起点（多取一天容错，Python 侧再裁剪）。"""
    local_start = datetime.combine(
        _local_today() - timedelta(days=days - 1), datetime.min.time()
    )
    return local_start - timedelta(hours=settings.STATS_TZ_OFFSET_HOURS)


async def daily_stats(
    *, session: AsyncSession, days: int = 30, kind: str = "site"
) -> list[DailyStat]:
    """按本地日聚合 PV/UV，缺失的日期补 0，保证前端拿到连续序列。"""
    day = func.date(PageView.created_at, _tz_modifier()).label("day")
    stmt = (
        select(
            day,
            func.count().label("views"),
            func.count(func.distinct(PageView.visitor_key)).label("visitors"),
        )
        .where(PageView.kind == kind, PageView.created_at >= _since_utc(days))
        .group_by(day)
        .order_by(day)
    )
    rows = (await session.exec(stmt)).all()
    bucket = {str(d): (int(v), int(u)) for d, v, u in rows}

    today = _local_today()
    out: list[DailyStat] = []
    for i in range(days - 1, -1, -1):
        key = (today - timedelta(days=i)).isoformat()
        views, visitors = bucket.get(key, (0, 0))
        out.append(DailyStat(date=key, views=views, visitors=visitors))
    return out


async def hourly_stats(
    *, session: AsyncSession, days: int = 7, kind: str = "site"
) -> list[HourlyStat]:
    """按「星期 × 小时」聚合，产出 7×24=168 格的热力数据（缺失补 0）。"""
    mod = _tz_modifier()
    wd = func.strftime("%w", PageView.created_at, mod).label("wd")  # 0=周日
    hr = func.strftime("%H", PageView.created_at, mod).label("hr")
    stmt = (
        select(wd, hr, func.count().label("views"))
        .where(PageView.kind == kind, PageView.created_at >= _since_utc(days))
        .group_by(wd, hr)
        .order_by(wd, hr)
    )
    rows = (await session.exec(stmt)).all()

    bucket: dict[tuple[int, int], int] = {}
    for w, h, n in rows:
        # SQLite 的 0=周日 → 转成 0=周一 的常规口径
        weekday = (int(w) + 6) % 7
        bucket[(weekday, int(h))] = int(n)

    return [
        HourlyStat(weekday=d, hour=h, views=bucket.get((d, h), 0))
        for d in range(7)
        for h in range(24)
    ]
