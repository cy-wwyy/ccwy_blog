from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.album import crud
from app.album.helpers import album_to_detail, album_to_public, photo_to_public
from app.album.models import (
    AlbumCreate,
    AlbumDetail,
    AlbumPhotoCreate,
    AlbumPhotoPublic,
    AlbumPhotoUpdate,
    AlbumsPublic,
    AlbumUpdate,
)
from app.core.deps import SessionDep, require_permission
from app.core.models import Media, Message

router = APIRouter(prefix="/admin/albums", tags=["admin-albums"])


async def _validate_album_refs(
    session: AsyncSession,
    *,
    slug: str | None,
    cover_media_id: str | None,
    exclude_id: str | None = None,
) -> None:
    """写入前校验相册引用完整性：slug 唯一、封面 media 存在。

    可预期的输入错误统一返回 400，避免冒泡成数据库 IntegrityError（500）。
    """
    if slug is not None:
        existing = await crud.get_album_by_slug(session=session, slug=slug)
        if existing and existing.id != exclude_id:
            raise HTTPException(status_code=400, detail="slug 已存在")
    if cover_media_id is not None and not await session.get(
        Media, cover_media_id
    ):
        raise HTTPException(status_code=400, detail="封面文件不存在")


async def _get_album_or_404(session: AsyncSession, album_id: str):
    album = await crud.get_album(session=session, album_id=album_id)
    if not album:
        raise HTTPException(status_code=404, detail="相册不存在")
    return album


# ── 相册 ──────────────────────────────────────────────


@router.get("", response_model=AlbumsPublic)
async def admin_list_albums(
    session: SessionDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    is_public: bool | None = None,
    search: str | None = None,
    sort_order: str = "desc",
    _=Depends(require_permission("album:manage")),
) -> AlbumsPublic:
    items, count = await crud.list_albums(
        session=session, skip=skip, limit=limit,
        is_public=is_public, search=search, sort_order=sort_order,
    )
    data = [await album_to_public(session, a) for a in items]
    return AlbumsPublic(data=data, count=count)


@router.get("/{album_id}", response_model=AlbumDetail)
async def admin_get_album(
    session: SessionDep,
    album_id: str,
    _=Depends(require_permission("album:manage")),
) -> AlbumDetail:
    album = await _get_album_or_404(session, album_id)
    return await album_to_detail(session, album)


@router.get("/by-slug/{slug}", response_model=AlbumDetail)
async def admin_get_album_by_slug(
    session: SessionDep,
    slug: str,
    _=Depends(require_permission("album:manage")),
) -> AlbumDetail:
    album = await crud.get_album_by_slug(session=session, slug=slug)
    if not album:
        raise HTTPException(status_code=404, detail="相册不存在")
    return await album_to_detail(session, album)


@router.post("", response_model=AlbumDetail)
async def admin_create_album(
    session: SessionDep,
    album_in: AlbumCreate,
    _=Depends(require_permission("album:manage")),
) -> AlbumDetail:
    await _validate_album_refs(
        session, slug=album_in.slug, cover_media_id=album_in.cover_media_id
    )
    album = await crud.create_album(session=session, album_in=album_in)
    return await album_to_detail(session, album)


@router.patch("/{album_id}", response_model=AlbumDetail)
async def admin_update_album(
    session: SessionDep,
    album_id: str,
    album_in: AlbumUpdate,
    _=Depends(require_permission("album:manage")),
) -> AlbumDetail:
    album = await _get_album_or_404(session, album_id)
    await _validate_album_refs(
        session,
        slug=album_in.slug,
        cover_media_id=album_in.cover_media_id,
        exclude_id=album_id,
    )
    album = await crud.update_album(
        session=session, db_album=album, album_in=album_in
    )
    return await album_to_detail(session, album)


@router.delete("/{album_id}", response_model=Message)
async def admin_delete_album(
    session: SessionDep,
    album_id: str,
    _=Depends(require_permission("album:manage")),
) -> Message:
    album = await _get_album_or_404(session, album_id)
    await crud.delete_album(session=session, album=album)
    return Message(message="已删除")


# ── 相册内照片 ─────────────────────────────────────────


@router.post("/{album_id}/photos", response_model=AlbumPhotoPublic)
async def admin_add_photo(
    session: SessionDep,
    album_id: str,
    photo_in: AlbumPhotoCreate,
    _=Depends(require_permission("album:manage")),
) -> AlbumPhotoPublic:
    """将媒体库已上传的文件挂载到相册（先经 /admin/media 上传拿 media_id）。"""
    await _get_album_or_404(session, album_id)
    if not await session.get(Media, photo_in.media_id):
        raise HTTPException(status_code=400, detail="媒体文件不存在")
    photo = await crud.add_photo(
        session=session, album_id=album_id, photo_in=photo_in
    )
    return await photo_to_public(session, photo)


@router.patch(
    "/{album_id}/photos/{photo_id}", response_model=AlbumPhotoPublic
)
async def admin_update_photo(
    session: SessionDep,
    album_id: str,
    photo_id: str,
    photo_in: AlbumPhotoUpdate,
    _=Depends(require_permission("album:manage")),
) -> AlbumPhotoPublic:
    """修改图注 / 排序。"""
    photo = await crud.get_photo(session=session, photo_id=photo_id)
    if not photo or photo.album_id != album_id:
        raise HTTPException(status_code=404, detail="照片不存在")
    photo = await crud.update_photo(
        session=session, db_photo=photo, photo_in=photo_in
    )
    return await photo_to_public(session, photo)


@router.delete("/{album_id}/photos/{photo_id}", response_model=Message)
async def admin_delete_photo(
    session: SessionDep,
    album_id: str,
    photo_id: str,
    _=Depends(require_permission("album:manage")),
) -> Message:
    photo = await crud.get_photo(session=session, photo_id=photo_id)
    if not photo or photo.album_id != album_id:
        raise HTTPException(status_code=404, detail="照片不存在")
    await crud.delete_photo(session=session, photo=photo)
    return Message(message="已删除")
