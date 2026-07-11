from fastapi import APIRouter, Depends

from app.core.deps import SessionDep, require_permission
from app.core.models import User
from app.settings import crud
from app.settings.models import (
    ProfileRead,
    ProfileUpdate,
    SiteSettingsRead,
    SiteSettingsUpdate,
)

router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])


def _profile_read(user: User) -> ProfileRead:
    return ProfileRead(
        display_name=user.display_name or "",
        avatar=user.avatar,
        bio=user.bio,
        github=user.github,
        website=user.website,
        is_owner=user.is_owner,
    )


@router.get("/profile", response_model=ProfileRead)
async def read_profile(
    current_user: User = Depends(require_permission("settings:manage")),
) -> ProfileRead:
    return _profile_read(current_user)


@router.patch("/profile", response_model=ProfileRead)
async def update_profile(
    session: SessionDep,
    data: ProfileUpdate,
    current_user: User = Depends(require_permission("settings:manage")),
) -> ProfileRead:
    # 博主资料现全部并入 User 表，逐字段赋值即可
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return _profile_read(current_user)


@router.get("/site", response_model=SiteSettingsRead)
async def read_site(
    session: SessionDep,
    _: User = Depends(require_permission("settings:manage")),
) -> SiteSettingsRead:
    return SiteSettingsRead(**await crud.get_site_settings(session=session))


@router.patch("/site", response_model=SiteSettingsRead)
async def update_site(
    session: SessionDep,
    data: SiteSettingsUpdate,
    _: User = Depends(require_permission("settings:manage")),
) -> SiteSettingsRead:
    # None 表示未提交；空串是合法的“清空”，统一落库为字符串
    values = {k: (v or "") for k, v in data.model_dump(exclude_unset=True).items()}
    if values:
        await crud.upsert_site_settings(session=session, values=values)
    return SiteSettingsRead(**await crud.get_site_settings(session=session))
