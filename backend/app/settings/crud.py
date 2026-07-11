from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.models import User
from app.core.utils import get_datetime_utc
from app.settings.models import SiteSetting

# ── 站点设置（KV）────────────────────────────────────


def site_defaults() -> dict[str, str]:
    return {
        "site_title": settings.PROJECT_NAME,
        "site_subtitle": "",
        "footer_text": "",
        "icp": "",
    }


async def get_site_settings(*, session: AsyncSession) -> dict[str, str]:
    """已知键的最终值 = 默认值叠加库中存量（忽略未知遗留键）。"""
    merged = site_defaults()
    rows = (await session.exec(select(SiteSetting))).all()
    stored = {r.key: r.value for r in rows}
    for key in merged:
        if key in stored:
            merged[key] = stored[key]
    return merged


async def upsert_site_settings(
    *, session: AsyncSession, values: dict[str, str]
) -> None:
    now = get_datetime_utc()
    for key, value in values.items():
        row = await session.get(SiteSetting, key)
        if row:
            row.value = value
            row.updated_at = now
            session.add(row)
        else:
            session.add(SiteSetting(key=key, value=value))
    await session.commit()


# ── 博主（站点所有者）─────────────────────────────────


async def get_owner(*, session: AsyncSession) -> User | None:
    """站点博主：优先取标记 is_owner 的用户，否则回退初始管理员/第一个用户。"""
    user = (
        await session.exec(select(User).where(col(User.is_owner).is_(True)))
    ).first()
    if not user:
        user = (
            await session.exec(
                select(User).where(User.email == settings.FIRST_SUPERUSER)
            )
        ).first()
    if not user:
        user = (await session.exec(select(User))).first()
    return user
