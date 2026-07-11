from datetime import datetime
from typing import Literal

from sqlalchemy import DateTime, Index
from sqlmodel import Field, SQLModel

from app.core.utils import generate_ulid, get_datetime_utc

# ── PageView 事件表（访问埋点）────────────────────────
# 每次“有效访问”记一行；靠 dedup_key 唯一约束做半小时去重（同一人同一目标同
# 半小时槽只进一行）。浏览量=行数，访客量=DISTINCT visitor_key。


class PageView(SQLModel, table=True):
    __table_args__ = (
        Index("ix_pageview_post", "post_id"),
        Index("ix_pageview_album", "album_id"),
        Index("ix_pageview_kind_created", "kind", "created_at"),
    )

    id: str = Field(default_factory=generate_ulid, primary_key=True)
    kind: str = Field(max_length=16)  # site | post | album
    post_id: str | None = Field(
        default=None, foreign_key="post.id", ondelete="CASCADE"
    )
    album_id: str | None = Field(
        default=None, foreign_key="album.id", ondelete="CASCADE"
    )
    # hash(SECRET_KEY + IP + UA)，不存原始 IP；跨天稳定 → 可算累计独立访客
    visitor_key: str = Field(max_length=64, index=True)
    # hash(kind + target + visitor_key + 半小时槽)，唯一约束天然去重
    dedup_key: str = Field(unique=True, max_length=64)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# ── Schemas ──────────────────────────────────────────


class TrackIn(SQLModel):
    kind: Literal["site", "post", "album"]
    slug: str | None = None


class StatsOverview(SQLModel):
    visitors_today: int
    visitors_total: int


class PostViewStat(SQLModel):
    id: str
    title: str
    slug: str
    views: int


class PostViewStats(SQLModel):
    data: list[PostViewStat]
