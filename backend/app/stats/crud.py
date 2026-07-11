import hashlib
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.blog.models import Post
from app.core.config import settings
from app.stats.models import PageView, PostViewStat

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


async def visitors_today(
    *, session: AsyncSession, now: datetime | None = None
) -> int:
    now = now or datetime.now(UTC)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
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
