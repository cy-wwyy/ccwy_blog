from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Text
from sqlmodel import Field, Relationship, SQLModel

from app.core.utils import generate_ulid, get_datetime_utc

# ── Album 表 ──────────────────────────────────────────


class Album(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    title: str = Field(max_length=256)
    slug: str = Field(unique=True, max_length=256)
    description: str | None = Field(default=None, sa_type=Text)
    # 封面指向媒体库某张图；删图不删相册，仅置空
    cover_media_id: str | None = Field(
        default=None, foreign_key="media.id", ondelete="SET NULL"
    )
    is_public: bool = True
    sort_order: int = 0
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    # 一对多：删相册级联删照片挂载记录（Media 物理文件保留）
    photos: list["AlbumPhoto"] = Relationship(
        back_populates="album",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ── AlbumPhoto 表（相册下的照片，1:N 子表）──────────────────


class AlbumPhoto(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    album_id: str = Field(
        foreign_key="album.id", ondelete="CASCADE", index=True
    )
    # 指向媒体库真实文件，复用去重/OSS/回源；删文件连带删挂载
    media_id: str = Field(foreign_key="media.id", ondelete="CASCADE")
    caption: str | None = Field(default=None, max_length=512)
    sort_order: int = 0
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    album: Optional["Album"] = Relationship(back_populates="photos")


# ── Schemas ───────────────────────────────────────────


class AlbumBase(SQLModel):
    title: str
    slug: str
    description: str | None = None
    cover_media_id: str | None = None
    is_public: bool = True
    sort_order: int = 0


class AlbumCreate(AlbumBase):
    pass


class AlbumUpdate(SQLModel):
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    cover_media_id: str | None = None
    is_public: bool | None = None
    sort_order: int | None = None


class AlbumPhotoPublic(SQLModel):
    id: str
    media_id: str
    url: str  # 原图，由 storage 生成，router 填充
    thumb_url: str | None = None  # 缩略图，无则前端回退原图
    caption: str | None = None
    sort_order: int = 0


class AlbumPhotoCreate(SQLModel):
    media_id: str
    caption: str | None = None
    sort_order: int = 0


class AlbumPhotoUpdate(SQLModel):
    caption: str | None = None
    sort_order: int | None = None


class AlbumPublic(AlbumBase):
    id: str
    cover_url: str | None = None  # 封面 media 的 url，router 填充
    photo_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AlbumDetail(AlbumPublic):
    photos: list[AlbumPhotoPublic] = []


class AlbumsPublic(SQLModel):
    data: list[AlbumPublic]
    count: int


# ── 前台公开视图（收敛字段：不暴露 cover_media_id/is_public/sort_order/media_id）──


class AlbumPhotoView(SQLModel):
    id: str
    url: str
    thumb_url: str | None = None
    caption: str | None = None


class AlbumCard(SQLModel):
    id: str
    title: str
    slug: str
    description: str | None = None
    cover_url: str | None = None
    photo_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AlbumView(AlbumCard):
    photos: list[AlbumPhotoView] = []


class AlbumsView(SQLModel):
    data: list[AlbumCard]
    count: int
