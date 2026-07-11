"""blog 模块共享辅助函数"""

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.blog.models import (
    Category,
    CategoryPublic,
    Post,
    PostDetail,
    PostPublic,
    PostTag,
    Tag,
    TagPublic,
)


def post_to_public(post: Post) -> PostPublic:
    return PostPublic.model_validate(post.model_dump())


async def get_post_tags(session: AsyncSession, post_id: str) -> list[Tag]:
    return list(
        (
            await session.exec(
                select(Tag).join(PostTag).where(PostTag.post_id == post_id)
            )
        ).all()
    )


def category_to_public(category: Category) -> CategoryPublic:
    return CategoryPublic.model_validate(category.model_dump())


def tag_to_public(tag: Tag) -> TagPublic:
    return TagPublic.model_validate(tag.model_dump())


async def post_to_detail(session: AsyncSession, post: Post) -> PostDetail:
    """将 Post 转为完整详情（含标签和分类）"""
    tags = await get_post_tags(session, post.id)
    cat = (
        await session.get(Category, post.category_id)
        if post.category_id
        else None
    )
    detail = PostDetail.model_validate(post.model_dump())
    detail.tags = [tag_to_public(t) for t in tags]
    detail.category = category_to_public(cat) if cat else None
    return detail
