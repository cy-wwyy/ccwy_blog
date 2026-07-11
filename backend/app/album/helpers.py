"""album 模块共享辅助函数：把模型转为对外 schema，并填充 url/封面/计数。"""

from sqlmodel import col, select
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

# (原图 url, 缩略图 url|None)
_Urls = tuple[str | None, str | None]


def _urls_of(media: Media | None) -> _Urls:
    if not media:
        return None, None
    thumb = storage.url(media.thumb_path) if media.thumb_path else None
    return storage.url(media.path), thumb


async def _media_urls(session: AsyncSession, media_id: str | None) -> _Urls:
    """单个 media 的 (原图 url, 缩略图 url)。"""
    if not media_id:
        return None, None
    return _urls_of(await session.get(Media, media_id))


async def _media_url_map(
    session: AsyncSession, media_ids: list[str | None]
) -> dict[str, _Urls]:
    """一条 IN 查询批量取多个 media 的 url，避免逐个 session.get 的 N+1。"""
    ids = {m for m in media_ids if m}
    if not ids:
        return {}
    medias = (
        await session.exec(select(Media).where(col(Media.id).in_(ids)))
    ).all()
    return {m.id: _urls_of(m) for m in medias}


def _photo_public(photo: AlbumPhoto, urls: _Urls) -> AlbumPhotoPublic:
    url, thumb_url = urls
    return AlbumPhotoPublic(
        id=photo.id,
        media_id=photo.media_id,
        url=url or "",
        thumb_url=thumb_url,
        caption=photo.caption,
        sort_order=photo.sort_order,
    )


def _album_public(album: Album, cover: _Urls, photo_count: int) -> AlbumPublic:
    pub = AlbumPublic.model_validate(album.model_dump())
    url, thumb_url = cover
    pub.cover_url = thumb_url or url  # 列表卡片优先用缩略图更轻
    pub.photo_count = photo_count
    return pub


async def photo_to_public(
    session: AsyncSession, photo: AlbumPhoto
) -> AlbumPhotoPublic:
    return _photo_public(photo, await _media_urls(session, photo.media_id))


async def album_to_public(
    session: AsyncSession, album: Album
) -> AlbumPublic:
    cover = await _media_urls(session, album.cover_media_id)
    count = await crud.count_album_photos(session=session, album_id=album.id)
    return _album_public(album, cover, count)


async def albums_to_public(
    session: AsyncSession, albums: list[Album]
) -> list[AlbumPublic]:
    """批量转换：一条聚合查计数 + 一条 IN 查封面，避免列表逐相册 N+1。"""
    counts = await crud.count_photos_by_album(
        session=session, album_ids=[a.id for a in albums]
    )
    url_map = await _media_url_map(session, [a.cover_media_id for a in albums])
    return [
        _album_public(
            a,
            url_map.get(a.cover_media_id or "", (None, None)),
            counts.get(a.id, 0),
        )
        for a in albums
    ]


async def album_to_detail(
    session: AsyncSession, album: Album
) -> AlbumDetail:
    photos = await crud.list_album_photos(session=session, album_id=album.id)
    url_map = await _media_url_map(session, [p.media_id for p in photos])
    detail = AlbumDetail.model_validate(await album_to_public(session, album))
    detail.photos = [
        _photo_public(p, url_map.get(p.media_id, (None, None))) for p in photos
    ]
    return detail
