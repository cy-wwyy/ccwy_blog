from datetime import datetime
from typing import Literal, Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, Relationship, SQLModel

from app.core.utils import generate_ulid, get_datetime_utc

# 文章发布状态 — 收敛为有限取值，避免拼写错误导致 public 层静默隐藏
PostStatus = Literal["draft", "published"]


# ── Category 表 ───────────────────────────────────────


class Category(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    name: str = Field(max_length=64)
    slug: str = Field(unique=True, max_length=64)
    description: str | None = Field(default=None, max_length=256)
    parent_id: str | None = Field(
        default=None, foreign_key="category.id", ondelete="SET NULL"
    )
    sort_order: int = 0

    # 自引用
    parent: Optional["Category"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={"remote_side": "category.c.id"},
    )
    children: list["Category"] = Relationship(back_populates="parent")

    # 文章
    posts: list["Post"] = Relationship(back_populates="category")


# ── Tag 表 ────────────────────────────────────────────


class Tag(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    name: str = Field(unique=True, max_length=64)
    slug: str = Field(unique=True, max_length=64)

    post_tags: list["PostTag"] = Relationship(back_populates="tag")


# ── Post 表 ───────────────────────────────────────────


class Post(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    title: str = Field(max_length=256)
    slug: str = Field(unique=True, max_length=256)
    content: str = Field(sa_type=Text)
    excerpt: str | None = Field(default=None, max_length=512)
    cover: str | None = Field(default=None, max_length=512)
    status: str = Field(default="draft", max_length=16, index=True)
    is_public: bool = True
    allow_comments: bool = True
    author_id: str = Field(foreign_key="user.id")
    category_id: str | None = Field(
        default=None, foreign_key="category.id", ondelete="SET NULL", index=True
    )
    published_at: datetime | None = Field(
        default=None, sa_type=DateTime(timezone=True), index=True
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    # 关系
    category: Optional["Category"] = Relationship(back_populates="posts")
    post_tags: list["PostTag"] = Relationship(back_populates="post")


# ── PostTag 关联表 ────────────────────────────────────


class PostTag(SQLModel, table=True):
    post_id: str = Field(
        foreign_key="post.id", primary_key=True, ondelete="CASCADE"
    )
    tag_id: str = Field(
        foreign_key="tag.id", primary_key=True, ondelete="CASCADE"
    )

    post: Post = Relationship(back_populates="post_tags")
    tag: Tag = Relationship(back_populates="post_tags")


# ── Schemas ───────────────────────────────────────────


class CategoryBase(SQLModel):
    name: str
    slug: str
    description: str | None = None
    parent_id: str | None = None
    sort_order: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(SQLModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    parent_id: str | None = None
    sort_order: int | None = None


class CategoryPublic(CategoryBase):
    id: str


class AffectedPost(SQLModel):
    id: str
    title: str


class CategoryDeletionImpact(SQLModel):
    """删除分类前的影响预览"""
    affected_posts: list[AffectedPost] = []
    category_count: int  # 将被删除的分类数（含子分类）


class TagBase(SQLModel):
    name: str
    slug: str


class TagCreate(TagBase):
    pass


class TagUpdate(SQLModel):
    name: str | None = None
    slug: str | None = None


class TagPublic(TagBase):
    id: str


class PostCreate(SQLModel):
    title: str = Field(max_length=256)
    slug: str = Field(max_length=256)
    content: str
    excerpt: str | None = None
    cover: str | None = None
    status: PostStatus = "draft"
    is_public: bool = True
    allow_comments: bool = True
    category_id: str | None = None
    tag_ids: list[str] = []


class PostUpdate(SQLModel):
    title: str | None = None
    slug: str | None = None
    content: str | None = None
    excerpt: str | None = None
    cover: str | None = None
    status: PostStatus | None = None
    is_public: bool | None = None
    allow_comments: bool | None = None
    category_id: str | None = None
    tag_ids: list[str] | None = None


class PostPublic(SQLModel):
    id: str
    title: str
    slug: str
    excerpt: str | None = None
    cover: str | None = None
    status: str
    is_public: bool
    allow_comments: bool
    author_id: str
    category_id: str | None = None
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PostDetail(PostPublic):
    content: str
    tags: list[TagPublic] = []
    category: CategoryPublic | None = None


class PostsPublic(SQLModel):
    data: list[PostPublic]
    count: int
