from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.blog import crud
from app.blog.helpers import post_to_detail, post_to_public
from app.blog.models import (
    Category,
    PostCreate,
    PostDetail,
    PostsPublic,
    PostUpdate,
)
from app.core.deps import CurrentUser, SessionDep, require_permission
from app.core.models import Message

router = APIRouter(prefix="/admin/posts", tags=["admin-posts"])


async def _validate_post_refs(
    session: AsyncSession,
    *,
    slug: str | None,
    category_id: str | None,
    tag_ids: list[str] | None,
    exclude_id: str | None = None,
) -> None:
    """写入前校验文章的引用完整性：slug 唯一、分类存在、标签存在。

    可预期的输入错误统一返回 400，避免冒泡成数据库 IntegrityError（500）
    或写入指向不存在实体的悬挂关联。
    """
    if slug is not None:
        existing = await crud.get_post_by_slug(session=session, slug=slug)
        if existing and existing.id != exclude_id:
            raise HTTPException(status_code=400, detail="slug 已存在")
    if category_id is not None:
        if not await session.get(Category, category_id):
            raise HTTPException(status_code=400, detail="分类不存在")
        # R1：文章只能挂末级分类（有子分类的父级作为纯分组容器，不直接挂文章）
        if await crud.category_has_children(session=session, cat_id=category_id):
            raise HTTPException(
                status_code=400, detail="该分类下有子分类，请选择末级分类"
            )
    if tag_ids:
        missing = await crud.get_missing_tag_ids(session=session, tag_ids=tag_ids)
        if missing:
            raise HTTPException(
                status_code=400, detail=f"标签不存在: {', '.join(missing)}"
            )


@router.get("", response_model=PostsPublic)
async def admin_list_posts(
    session: SessionDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
    category_id: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    _=Depends(require_permission("posts:read")),
) -> PostsPublic:
    items, count = await crud.list_posts(
        session=session, skip=skip, limit=limit,
        status=status, category_id=category_id,
        sort_by=sort_by, sort_order=sort_order,
    )
    return PostsPublic(data=[post_to_public(p) for p in items], count=count)


@router.get("/{post_id}", response_model=PostDetail)
async def admin_get_post(
    session: SessionDep,
    post_id: str,
    _=Depends(require_permission("posts:read")),
) -> PostDetail:
    post = await crud.get_post(session=session, post_id=post_id)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    return await post_to_detail(session, post)


@router.get("/by-slug/{slug}", response_model=PostDetail)
async def admin_get_post_by_slug(
    session: SessionDep,
    slug: str,
    _=Depends(require_permission("posts:read")),
) -> PostDetail:
    post = await crud.get_post_by_slug(session=session, slug=slug)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    return await post_to_detail(session, post)


@router.post("", response_model=PostDetail)
async def admin_create_post(
    session: SessionDep,
    current_user: CurrentUser,
    post_in: PostCreate,
    _=Depends(require_permission("posts:create")),
) -> PostDetail:
    await _validate_post_refs(
        session,
        slug=post_in.slug,
        category_id=post_in.category_id,
        tag_ids=post_in.tag_ids,
    )
    post = await crud.create_post(
        session=session, post_in=post_in, author_id=current_user.id
    )
    return await post_to_detail(session, post)


@router.patch("/{post_id}", response_model=PostDetail)
async def admin_update_post(
    session: SessionDep,
    post_id: str,
    post_in: PostUpdate,
    _=Depends(require_permission("posts:update")),
) -> PostDetail:
    post = await crud.get_post(session=session, post_id=post_id)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    await _validate_post_refs(
        session,
        slug=post_in.slug,
        category_id=post_in.category_id,
        tag_ids=post_in.tag_ids,
        exclude_id=post_id,
    )
    post = await crud.update_post(session=session, db_post=post, post_in=post_in)
    return await post_to_detail(session, post)


@router.delete("/{post_id}", response_model=Message)
async def admin_delete_post(
    session: SessionDep,
    post_id: str,
    _=Depends(require_permission("posts:delete")),
) -> Message:
    post = await crud.get_post(session=session, post_id=post_id)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    await crud.delete_post(session=session, post=post)
    return Message(message="已删除")
