from fastapi import APIRouter, Depends, HTTPException

from app.blog import crud
from app.blog.helpers import category_to_public
from app.blog.models import (
    AffectedPost,
    Category,
    CategoryCreate,
    CategoryDeletionImpact,
    CategoryPublic,
    CategoryUpdate,
)
from app.core.deps import SessionDep, require_permission
from app.core.models import Message

router = APIRouter(prefix="/admin/categories", tags=["admin-categories"])


@router.get("", response_model=list[CategoryPublic])
async def list_categories(
    session: SessionDep,
    _=Depends(require_permission("posts:read")),
) -> list[CategoryPublic]:
    cats = await crud.list_categories(session=session)
    return [category_to_public(c) for c in cats]


@router.post("", response_model=CategoryPublic)
async def create_category(
    session: SessionDep,
    cat_in: CategoryCreate,
    _=Depends(require_permission("posts:create")),
) -> CategoryPublic:
    existing = await crud.get_category_by_slug(session=session, slug=cat_in.slug)
    if existing:
        raise HTTPException(status_code=400, detail="slug 已存在")
    if cat_in.parent_id is not None:
        if not await session.get(Category, cat_in.parent_id):
            raise HTTPException(status_code=400, detail="父分类不存在")
        # R3：新子级深度 = 父级深度 + 1，不得超过三层
        depth = await crud.get_category_depth(
            session=session, cat_id=cat_in.parent_id
        )
        if depth + 1 > crud.MAX_CATEGORY_DEPTH:
            raise HTTPException(status_code=400, detail="分类层级最多三层")
    cat = Category.model_validate(cat_in)
    session.add(cat)
    await session.flush()  # 先落库拿到 cat.id，供文章迁移引用
    # R2：父级若已有直接归属的文章，全部迁到新建的子级下（父级变纯容器）
    if cat_in.parent_id is not None:
        await crud.reassign_category_posts(
            session=session, from_cat_id=cat_in.parent_id, to_cat_id=cat.id
        )
    await session.commit()
    await session.refresh(cat)
    return category_to_public(cat)


@router.patch("/{cat_id}", response_model=CategoryPublic)
async def update_category(
    session: SessionDep,
    cat_id: str,
    cat_in: CategoryUpdate,
    _=Depends(require_permission("posts:update")),
) -> CategoryPublic:
    cat = await session.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    data = cat_in.model_dump(exclude_unset=True)
    if "slug" in data:
        existing = await crud.get_category_by_slug(session=session, slug=data["slug"])
        if existing and existing.id != cat_id:
            raise HTTPException(status_code=400, detail="slug 已存在")
    if "parent_id" in data and data["parent_id"] is not None:
        new_parent_id = data["parent_id"]
        if new_parent_id == cat_id:
            raise HTTPException(status_code=400, detail="父分类不能是自身")
        if not await session.get(Category, new_parent_id):
            raise HTTPException(status_code=400, detail="父分类不存在")
        # 防止成环：新父分类不能是自身的子孙
        descendant_ids = await crud.get_category_descendant_ids(
            session=session, cat_id=cat_id
        )
        if new_parent_id in descendant_ids:
            raise HTTPException(
                status_code=400, detail="父分类不能是自身的子孙分类"
            )
        # 边界(a)：目标父级已有直接归属文章 → 拒绝（避免父级同时有文章和子级）
        if await crud.category_has_posts(session=session, cat_id=new_parent_id):
            raise HTTPException(
                status_code=400, detail="目标父分类下已有文章，请先整理后再移动"
            )
        # R3：移动后总层级 = 父级深度 + 被移动子树高度，不得超过三层
        depth_p = await crud.get_category_depth(
            session=session, cat_id=new_parent_id
        )
        height_x = await crud.get_category_subtree_height(
            session=session, cat_id=cat_id
        )
        if depth_p + height_x > crud.MAX_CATEGORY_DEPTH:
            raise HTTPException(status_code=400, detail="分类层级最多三层")
    cat.sqlmodel_update(data)
    session.add(cat)
    await session.commit()
    await session.refresh(cat)
    return category_to_public(cat)


@router.get("/{cat_id}/deletion-impact", response_model=CategoryDeletionImpact)
async def category_deletion_impact(
    session: SessionDep,
    cat_id: str,
    _=Depends(require_permission("posts:delete")),
) -> CategoryDeletionImpact:
    """预览删除该分类的影响：受影响文章 + 将被删除的分类数（含子分类）"""
    cat = await session.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    ids = await crud.get_category_descendant_ids(session=session, cat_id=cat_id)
    posts = await crud.get_category_affected_posts(session=session, cat_id=cat_id)
    return CategoryDeletionImpact(
        affected_posts=[AffectedPost(id=p.id, title=p.title) for p in posts],
        category_count=len(ids),
    )


@router.delete("/{cat_id}", response_model=Message)
async def delete_category(
    session: SessionDep,
    cat_id: str,
    _=Depends(require_permission("posts:delete")),
) -> Message:
    cat = await session.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    # 级联删除子分类，并将归属文章的分类置空
    await crud.delete_category(session=session, cat_id=cat_id)
    return Message(message="已删除")
