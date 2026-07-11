from fastapi import APIRouter, HTTPException, Query

from app.album import crud
from app.album.helpers import album_to_detail, albums_to_public
from app.album.models import AlbumDetail, AlbumsPublic, AlbumsView, AlbumView
from app.core.deps import SessionDep

router = APIRouter(prefix="/albums", tags=["albums"])


@router.get("", response_model=AlbumsView)
async def list_public_albums(
    session: SessionDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> AlbumsPublic:
    items, count = await crud.list_albums(
        session=session, skip=skip, limit=limit, is_public=True
    )
    # 返回完整对象，由 response_model=AlbumsView 序列化时收敛内部字段
    data = await albums_to_public(session, items)
    return AlbumsPublic(data=data, count=count)


@router.get("/{slug}", response_model=AlbumView)
async def get_public_album(session: SessionDep, slug: str) -> AlbumDetail:
    album = await crud.get_album_by_slug(session=session, slug=slug)
    if not album or not album.is_public:
        raise HTTPException(status_code=404, detail="相册不存在")
    return await album_to_detail(session, album)
