from fastapi import APIRouter

from app.core.deps import SessionDep
from app.settings import crud
from app.settings.models import PublicAuthor, PublicSiteInfo

router = APIRouter(tags=["site"])


@router.get("/site-settings", response_model=PublicSiteInfo)
async def public_site_info(session: SessionDep) -> PublicSiteInfo:
    """前台消费：站点信息 + 博主公开信息（侧栏头像/名字/简介、页脚版权）。"""
    site = await crud.get_site_settings(session=session)
    owner = await crud.get_owner(session=session)
    if owner:
        author = PublicAuthor(
            display_name=owner.display_name or owner.username,
            bio=owner.bio,
            avatar=owner.avatar,
            github=owner.github,
            website=owner.website,
        )
    else:
        author = PublicAuthor()
    return PublicSiteInfo(**site, author=author)
