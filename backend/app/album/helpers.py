"""album 模块共享辅助函数：把模型转为对外 schema，并填充 url/封面/计数。"""

from sqlmodel.ext.asyncio.session import AsyncSession

from app.album import crud
from app.album.models import (
    Album,
    AlbumDetail,
    AlbumPhoto,
    AlbumPhotoPublic,
    AlbumPublic,
)
from app.core.models import Media
from app.storage import storage


async def _media_url(session: AsyncSession, media_id: str | None) -> str | None:
    """由 media_id 取物理路径并生成访问 url，缺失/已删则返回 None。"""
    if not media_id:
        return None
    media = await session.get(Media, media_id)
    return storage.url(media.path) if media else None


async def photo_to_public(
    session: AsyncSession, photo: AlbumPhoto
) -> AlbumPhotoPublic:
    return AlbumPhotoPublic(
        id=photo.id,
        media_id=photo.media_id,
        url=await _media_url(session, photo.media_id) or "",
        caption=photo.caption,
        sort_order=photo.sort_order,
    )


async def album_to_public(
    session: AsyncSession, album: Album
) -> AlbumPublic:
    pub = AlbumPublic.model_validate(album.model_dump())
    pub.cover_url = await _media_url(session, album.cover_media_id)
    pub.photo_count = await crud.count_album_photos(
        session=session, album_id=album.id
    )
    return pub


async def album_to_detail(
    session: AsyncSession, album: Album
) -> AlbumDetail:
    photos = await crud.list_album_photos(session=session, album_id=album.id)
    detail = AlbumDetail.model_validate(await album_to_public(session, album))
    detail.photos = [await photo_to_public(session, p) for p in photos]
    return detail
