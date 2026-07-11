from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.blog import crud
from app.blog.helpers import tag_to_public
from app.blog.models import PostTag, Tag, TagCreate, TagPublic, TagUpdate
from app.core.deps import SessionDep, require_permission
from app.core.models import Message

router = APIRouter(prefix="/admin/tags", tags=["admin-tags"])


@router.get("", response_model=list[TagPublic])
async def list_tags(
    session: SessionDep,
    _=Depends(require_permission("posts:read")),
) -> list[TagPublic]:
    result = (await session.exec(select(Tag).order_by(Tag.name))).all()
    return [tag_to_public(t) for t in result]


@router.post("", response_model=TagPublic)
async def create_tag(
    session: SessionDep,
    tag_in: TagCreate,
    _=Depends(require_permission("posts:create")),
) -> TagPublic:
    existing = await crud.get_tag_by_slug(session=session, slug=tag_in.slug)
    if existing:
        raise HTTPException(status_code=400, detail="slug 已存在")
    tag = Tag.model_validate(tag_in)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag_to_public(tag)


@router.patch("/{tag_id}", response_model=TagPublic)
async def update_tag(
    session: SessionDep,
    tag_id: str,
    tag_in: TagUpdate,
    _=Depends(require_permission("posts:update")),
) -> TagPublic:
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    data = tag_in.model_dump(exclude_unset=True)
    if "slug" in data:
        existing = await crud.get_tag_by_slug(session=session, slug=data["slug"])
        if existing and existing.id != tag_id:
            raise HTTPException(status_code=400, detail="slug 已存在")
    tag.sqlmodel_update(data)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag_to_public(tag)


@router.delete("/{tag_id}", response_model=Message)
async def delete_tag(
    session: SessionDep,
    tag_id: str,
    _=Depends(require_permission("posts:delete")),
) -> Message:
    tag = await session.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    # 清除文章关联
    for pt in (
        await session.exec(select(PostTag).where(PostTag.tag_id == tag_id))
    ).all():
        await session.delete(pt)
    await session.delete(tag)
    await session.commit()
    return Message(message="已删除")
