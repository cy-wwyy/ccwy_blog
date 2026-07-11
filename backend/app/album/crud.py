from datetime import UTC, datetime

from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.album.models import (
    Album,
    AlbumCreate,
    AlbumPhoto,
    AlbumPhotoCreate,
    AlbumPhotoUpdate,
    AlbumUpdate,
)

# ── Album ────────────────────────────────────────────


async def create_album(
    *, session: AsyncSession, album_in: AlbumCreate
) -> Album:
    album = Album.model_validate(album_in)
    session.add(album)
    await session.commit()
    await session.refresh(album)
    return album


async def get_album(*, session: AsyncSession, album_id: str) -> Album | None:
    return await session.get(Album, album_id)


async def get_album_by_slug(
    *, session: AsyncSession, slug: str
) -> Album | None:
    return (
        await session.exec(select(Album).where(Album.slug == slug))
    ).first()


async def list_albums(
    *,
    session: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    is_public: bool | None = None,
    search: str | None = None,
    sort_order: str = "desc",
) -> tuple[list[Album], int]:
    items_stmt = select(Album)
    count_stmt = select(func.count()).select_from(Album)

    if is_public is not None:
        count_stmt = count_stmt.where(Album.is_public == is_public)
        items_stmt = items_stmt.where(Album.is_public == is_public)
    if search:
        cond = col(Album.title).like(f"%{search}%")
        count_stmt = count_stmt.where(cond)
        items_stmt = items_stmt.where(cond)

    # 相册按 sort_order 优先、其次创建时间排序
    if sort_order == "asc":
        items_stmt = items_stmt.order_by(
            col(Album.sort_order).asc(), col(Album.created_at).asc()
        )
    else:
        items_stmt = items_stmt.order_by(
            col(Album.sort_order).asc(), col(Album.created_at).desc()
        )

    count = (await session.exec(count_stmt)).one()
    items = (await session.exec(items_stmt.offset(skip).limit(limit))).all()
    return list(items), count


async def update_album(
    *, session: AsyncSession, db_album: Album, album_in: AlbumUpdate
) -> Album:
    data = album_in.model_dump(exclude_unset=True)
    if data:
        data["updated_at"] = datetime.now(UTC)
        db_album.sqlmodel_update(data)
        session.add(db_album)
        await session.commit()
        await session.refresh(db_album)
    return db_album


async def delete_album(*, session: AsyncSession, album: Album) -> None:
    # 关系已配置 cascade delete-orphan，删相册连带删照片挂载记录
    await session.delete(album)
    await session.commit()


# ── AlbumPhoto ───────────────────────────────────────


async def list_album_photos(
    *, session: AsyncSession, album_id: str
) -> list[AlbumPhoto]:
    stmt = (
        select(AlbumPhoto)
        .where(AlbumPhoto.album_id == album_id)
        .order_by(
            col(AlbumPhoto.sort_order).asc(), col(AlbumPhoto.created_at).asc()
        )
    )
    return list((await session.exec(stmt)).all())


async def count_album_photos(
    *, session: AsyncSession, album_id: str
) -> int:
    stmt = (
        select(func.count())
        .select_from(AlbumPhoto)
        .where(AlbumPhoto.album_id == album_id)
    )
    return (await session.exec(stmt)).one()


async def count_photos_by_album(
    *, session: AsyncSession, album_ids: list[str]
) -> dict[str, int]:
    """一次聚合查询批量取各相册照片数，避免列表逐相册计数的 N+1。"""
    if not album_ids:
        return {}
    stmt = (
        select(AlbumPhoto.album_id, func.count())
        .where(col(AlbumPhoto.album_id).in_(album_ids))
        .group_by(col(AlbumPhoto.album_id))
    )
    rows = (await session.exec(stmt)).all()
    return dict(rows)


async def get_photo(
    *, session: AsyncSession, photo_id: str
) -> AlbumPhoto | None:
    return await session.get(AlbumPhoto, photo_id)


async def add_photo(
    *, session: AsyncSession, album_id: str, photo_in: AlbumPhotoCreate
) -> AlbumPhoto:
    photo = AlbumPhoto.model_validate(
        photo_in, update={"album_id": album_id}
    )
    session.add(photo)
    await session.commit()
    await session.refresh(photo)
    return photo


async def update_photo(
    *,
    session: AsyncSession,
    db_photo: AlbumPhoto,
    photo_in: AlbumPhotoUpdate,
) -> AlbumPhoto:
    data = photo_in.model_dump(exclude_unset=True)
    if data:
        db_photo.sqlmodel_update(data)
        session.add(db_photo)
        await session.commit()
        await session.refresh(db_photo)
    return db_photo


async def delete_photo(*, session: AsyncSession, photo: AlbumPhoto) -> None:
    await session.delete(photo)
    await session.commit()
