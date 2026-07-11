from datetime import UTC, datetime

from sqlmodel import col, func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.blog.models import (
    Category,
    Post,
    PostCreate,
    PostTag,
    PostUpdate,
    Tag,
)

# 排序白名单 — 模块级常量，避免每次调用重复创建
_ALLOWED_SORT_COLUMNS = {"created_at", "updated_at", "title"}

# 分类层级上限（根=1，最多三层）
MAX_CATEGORY_DEPTH = 3

# ── Post ─────────────────────────────────────────────


async def create_post(
    *, session: AsyncSession, post_in: PostCreate, author_id: str
) -> Post:
    post = Post.model_validate(post_in, update={"author_id": author_id})
    # 发布态文章自动记录发布时间
    if post.status == "published" and post.published_at is None:
        post.published_at = datetime.now(UTC)
    session.add(post)
    await session.flush()

    # 处理标签
    await _sync_tags(session, post, post_in.tag_ids)

    await session.commit()
    await session.refresh(post)
    return post


async def get_post(*, session: AsyncSession, post_id: str) -> Post | None:
    return await session.get(Post, post_id)


async def get_post_by_slug(*, session: AsyncSession, slug: str) -> Post | None:
    return (await session.exec(select(Post).where(Post.slug == slug))).first()


async def list_posts(
    *,
    session: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    status: str | None = None,
    category_id: str | None = None,
    is_public: bool | None = None,
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[Post], int]:
    items_stmt = select(Post)
    count_stmt = select(func.count()).select_from(Post)

    if status:
        count_stmt = count_stmt.where(Post.status == status)
        items_stmt = items_stmt.where(Post.status == status)
    if category_id:
        count_stmt = count_stmt.where(Post.category_id == category_id)
        items_stmt = items_stmt.where(Post.category_id == category_id)
    if is_public is not None:
        count_stmt = count_stmt.where(Post.is_public == is_public)
        items_stmt = items_stmt.where(Post.is_public == is_public)
    if search:
        like = f"%{search}%"
        cond = or_(col(Post.title).like(like), col(Post.excerpt).like(like))
        count_stmt = count_stmt.where(cond)
        items_stmt = items_stmt.where(cond)

    # 排序 — 白名单校验，防止注入任意列名
    sort_by = sort_by if sort_by in _ALLOWED_SORT_COLUMNS else "created_at"
    sort_col = getattr(Post, sort_by)
    if sort_order == "asc":
        items_stmt = items_stmt.order_by(col(sort_col).asc())
    else:
        items_stmt = items_stmt.order_by(col(sort_col).desc())

    count = (await session.exec(count_stmt)).one()
    items = (await session.exec(items_stmt.offset(skip).limit(limit))).all()
    return list(items), count


async def update_post(
    *, session: AsyncSession, db_post: Post, post_in: PostUpdate
) -> Post:
    data = post_in.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)

    # 发布状态流转 → 维护 published_at：
    # 首次转为 published 记录发布时间；退回非 published（撤稿）清空。
    if "status" in data and data["status"] != db_post.status:
        if data["status"] == "published" and db_post.published_at is None:
            data["published_at"] = datetime.now(UTC)
        elif data["status"] != "published":
            data["published_at"] = None

    # 自动更新 updated_at — 只要有任何字段变更（含标签）就更新时间戳
    if data or tag_ids is not None:
        data["updated_at"] = datetime.now(UTC)
    if data:
        db_post.sqlmodel_update(data)
        session.add(db_post)

    if tag_ids is not None:
        await _sync_tags(session, db_post, tag_ids)

    await session.commit()
    await session.refresh(db_post)
    return db_post


async def delete_post(*, session: AsyncSession, post: Post) -> None:
    # 先清关联标签
    stmt = select(PostTag).where(PostTag.post_id == post.id)
    for pt in (await session.exec(stmt)).all():
        await session.delete(pt)
    await session.delete(post)
    await session.commit()


# ── Tags ─────────────────────────────────────────────


async def get_tag_by_slug(*, session: AsyncSession, slug: str) -> Tag | None:
    return (await session.exec(select(Tag).where(Tag.slug == slug))).first()


async def get_missing_tag_ids(
    *, session: AsyncSession, tag_ids: list[str]
) -> list[str]:
    """返回入参中在库里不存在的 tag id — 用于写入前校验，避免悬挂关联行"""
    if not tag_ids:
        return []
    unique_ids = set(tag_ids)
    found = set(
        (await session.exec(select(Tag.id).where(col(Tag.id).in_(unique_ids)))).all()
    )
    return [tid for tid in unique_ids if tid not in found]


async def _sync_tags(
    session: AsyncSession, post: Post, tag_ids: list[str]
) -> None:
    """同步文章标签 — 只增删发生变化的关联，避免全删全建的写放大"""
    existing = (
        await session.exec(select(PostTag).where(PostTag.post_id == post.id))
    ).all()
    current_ids = {pt.tag_id for pt in existing}
    target_ids = set(tag_ids)

    # 删除已移除的关联
    for pt in existing:
        if pt.tag_id not in target_ids:
            await session.delete(pt)
    # 新增缺失的关联
    for tag_id in target_ids - current_ids:
        session.add(PostTag(post_id=post.id, tag_id=tag_id))


# ── Category ─────────────────────────────────────────


async def get_category_by_slug(
    *, session: AsyncSession, slug: str
) -> Category | None:
    return (
        await session.exec(select(Category).where(Category.slug == slug))
    ).first()


async def category_has_children(*, session: AsyncSession, cat_id: str) -> bool:
    """该分类是否有子分类。"""
    child = (
        await session.exec(
            select(Category.id).where(Category.parent_id == cat_id)
        )
    ).first()
    return child is not None


async def category_has_posts(*, session: AsyncSession, cat_id: str) -> bool:
    """该分类是否有直接归属的文章。"""
    post = (
        await session.exec(
            select(Post.id).where(Post.category_id == cat_id)
        )
    ).first()
    return post is not None


async def get_category_depth(*, session: AsyncSession, cat_id: str) -> int:
    """分类深度（根=1）。沿 parent 链向上，seen 去重防环。"""
    depth = 1
    seen: set[str] = {cat_id}
    cat = await session.get(Category, cat_id)
    while cat and cat.parent_id and cat.parent_id not in seen:
        seen.add(cat.parent_id)
        depth += 1
        cat = await session.get(Category, cat.parent_id)
    return depth


async def get_category_subtree_height(
    *, session: AsyncSession, cat_id: str
) -> int:
    """以 cat_id 为根的子树层数（含自身，叶=1）。层序 BFS，seen 去重防环。"""
    frontier: list[str] = [cat_id]
    seen: set[str] = {cat_id}
    height = 0
    while frontier:
        height += 1
        nxt: list[str] = []
        for cid in frontier:
            child_ids = (
                await session.exec(
                    select(Category.id).where(Category.parent_id == cid)
                )
            ).all()
            for c in child_ids:
                if c not in seen:
                    seen.add(c)
                    nxt.append(c)
        frontier = nxt
    return height


async def reassign_category_posts(
    *, session: AsyncSession, from_cat_id: str, to_cat_id: str
) -> int:
    """把归属 from 分类的文章全部改到 to 分类。返回迁移数量。"""
    posts = (
        await session.exec(
            select(Post).where(Post.category_id == from_cat_id)
        )
    ).all()
    for p in posts:
        p.category_id = to_cat_id
        session.add(p)
    return len(posts)


async def list_categories(*, session: AsyncSession) -> list[Category]:
    return list(
        (
            await session.exec(
                select(Category).order_by(col(Category.sort_order))
            )
        ).all()
    )


async def get_category_descendant_ids(
    *, session: AsyncSession, cat_id: str
) -> list[str]:
    """返回该分类及其所有后代分类的 id（含自身），父在前、子在后。

    用 seen 集合去重：即使数据中意外存在环（A.parent=B, B.parent=A），
    也能安全终止，避免无限循环耗尽内存。
    """
    ids: list[str] = [cat_id]
    seen: set[str] = {cat_id}
    i = 0
    while i < len(ids):
        child_ids = (
            await session.exec(
                select(Category.id).where(Category.parent_id == ids[i])
            )
        ).all()
        for child_id in child_ids:
            if child_id not in seen:
                seen.add(child_id)
                ids.append(child_id)
        i += 1
    return ids


async def get_category_affected_posts(
    *, session: AsyncSession, cat_id: str
) -> list[Post]:
    """返回删除该分类（含子分类）后会被重置分类的文章"""
    ids = await get_category_descendant_ids(session=session, cat_id=cat_id)
    return list(
        (
            await session.exec(
                select(Post).where(col(Post.category_id).in_(ids))
            )
        ).all()
    )


async def delete_category(*, session: AsyncSession, cat_id: str) -> None:
    """删除分类及其所有子分类，并将归属文章的分类置空"""
    ids = await get_category_descendant_ids(session=session, cat_id=cat_id)
    # 归属文章分类置空
    for post in (
        await session.exec(select(Post).where(col(Post.category_id).in_(ids)))
    ).all():
        post.category_id = None
        session.add(post)
    # 先子后父删除，避免残留悬挂的 parent_id
    for cid in reversed(ids):
        cat = await session.get(Category, cid)
        if cat:
            await session.delete(cat)
    await session.commit()
