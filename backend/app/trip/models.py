from datetime import UTC, date, datetime
from typing import Annotated, Literal, Optional

from pydantic import BeforeValidator, model_validator
from sqlalchemy import DateTime, Text


def _ensure_utc(v: object) -> datetime | None:
    """将 naive datetime 强制设为 UTC，确保 JSON 序列化带 Z 后缀。"""
    if v is None:
        return None
    if isinstance(v, datetime) and v.tzinfo is None:
        return v.replace(tzinfo=UTC)
    return v  # type: ignore[return-value]


# 响应 schema 中所有 datetime 字段统一使用此类型，避免 SQLite 丢失时区
UtcDateTime = Annotated[datetime | None, BeforeValidator(_ensure_utc)]
from sqlmodel import Field, Relationship, SQLModel

from app.core.utils import generate_ulid, get_datetime_utc

# 记录点类型 —— 收敛为有限取值
PointType = Literal[
    "accommodation", "camping", "rest", "viewpoint", "lunch", "gas", "repair",
    "pass", "ancient_town", "other",
]
# 行程状态
TripStatus = Literal["draft", "published"]


# ── Trip 表 ──────────────────────────────────────────


class Trip(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    title: str = Field(max_length=256)
    slug: str = Field(unique=True, max_length=256)
    description: str | None = Field(default=None, sa_type=Text)
    cover_media_id: str | None = Field(
        default=None, foreign_key="media.id", ondelete="SET NULL"
    )
    start_date: date | None = Field(default=None)
    end_date: date | None = Field(default=None)
    is_public: bool = True
    status: str = Field(default="draft", max_length=16)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    # 一对多：删行程级联删除记录点
    points: list["TripPoint"] = Relationship(
        back_populates="trip",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ── TripPoint 表（记录点）─────────────────────────────


class TripPoint(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    trip_id: str = Field(
        foreign_key="trip.id", ondelete="CASCADE", index=True
    )
    title: str = Field(max_length=256)
    description: str | None = Field(default=None, sa_type=Text)
    point_type: str = Field(default="other", max_length=16)
    # 位置：地名和经纬度不能同时为空（Pydantic 层校验，见 TripPointBase）
    location_name: str | None = Field(default=None, max_length=256)
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    arrived_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    sort_order: int = 0
    # 高德路径规划缓存：到下一个记录点的路线 polyline
    polyline_to_next: str | None = Field(default=None, sa_type=Text)
    distance_to_next: int | None = Field(default=None)  # 米
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    trip: Optional["Trip"] = Relationship(back_populates="points")
    photos: list["TripPointMedia"] = Relationship(
        back_populates="point",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ── TripPointMedia 表（记录点关联照片）───────────────────


class TripPointMedia(SQLModel, table=True):
    point_id: str = Field(
        foreign_key="trippoint.id", ondelete="CASCADE", primary_key=True
    )
    media_id: str = Field(
        foreign_key="media.id", ondelete="CASCADE", primary_key=True
    )
    sort_order: int = 0

    point: Optional["TripPoint"] = Relationship(back_populates="photos")


# ── Schemas: Trip ─────────────────────────────────────


class TripBase(SQLModel):
    title: str = Field(max_length=256)
    slug: str = Field(max_length=256)
    description: str | None = None
    cover_media_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_public: bool = True
    status: TripStatus = "draft"


class TripCreate(TripBase):
    pass


class TripUpdate(SQLModel):
    title: str | None = Field(default=None, max_length=256)
    slug: str | None = Field(default=None, max_length=256)
    description: str | None = None
    cover_media_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_public: bool | None = None
    status: TripStatus | None = None


class TripPublic(SQLModel):
    id: str
    title: str
    slug: str
    description: str | None = None
    cover_url: str | None = None  # 由 router 填充
    start_date: date | None = None
    end_date: date | None = None
    is_public: bool
    status: str
    point_count: int = 0
    total_distance: int | None = None  # 米
    created_at: UtcDateTime = None
    updated_at: UtcDateTime = None


class TripDetail(TripPublic):
    points: list["TripPointPublic"] = []


class TripsPublic(SQLModel):
    data: list[TripPublic]
    count: int


# ── Schemas: TripPoint ────────────────────────────────


class TripPointBase(SQLModel):
    title: str = Field(max_length=256)
    description: str | None = None
    point_type: PointType = "other"
    location_name: str | None = Field(default=None, max_length=256)
    latitude: float | None = None
    longitude: float | None = None
    arrived_at: datetime | None = None
    sort_order: int = 0

    @model_validator(mode="after")
    def _check_location(self) -> "TripPointBase":
        """位置约束：location_name 和 (latitude, longitude) 不能同时为空。"""
        if self.location_name is None and (
            self.latitude is None or self.longitude is None
        ):
            raise ValueError("地名和经纬度不能同时为空")
        return self


class TripPointCreate(TripPointBase):
    trip_id: str
    media_ids: list[str] = []  # 关联已有媒体


class TripPointUpdate(SQLModel):
    title: str | None = Field(default=None, max_length=256)
    description: str | None = None
    point_type: PointType | None = None
    location_name: str | None = Field(default=None, max_length=256)
    latitude: float | None = None
    longitude: float | None = None
    arrived_at: datetime | None = None
    sort_order: int | None = None
    media_ids: list[str] | None = None  # 覆盖式更新关联照片


class TripPointPublic(SQLModel):
    id: str
    trip_id: str
    title: str
    description: str | None = None
    point_type: str
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    arrived_at: UtcDateTime = None
    sort_order: int
    polyline_to_next: str | None = None
    distance_to_next: int | None = None
    photos: list[str] = []  # 照片 URL 列表，由 router 填充
    created_at: UtcDateTime = None


# ── Schemas: TripPointMedia ───────────────────────────


class TripPointMediaCreate(SQLModel):
    media_id: str
    sort_order: int = 0


# ── 前台公开视图 ──────────────────────────────────────


class TripCard(SQLModel):
    """行程列表卡片（收敛字段，不暴露 is_public/status 等管理字段）"""
    id: str
    title: str
    slug: str
    description: str | None = None
    cover_url: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    point_count: int = 0
    total_distance: int | None = None
    created_at: UtcDateTime = None
    updated_at: UtcDateTime = None


class TripPointView(SQLModel):
    """前台记录点视图（收敛字段，不暴露 trip_id）"""
    id: str
    title: str
    description: str | None = None
    point_type: str
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    arrived_at: UtcDateTime = None
    sort_order: int
    polyline_to_next: str | None = None  # 高德编码 polyline，前端可直接渲染
    distance_to_next: int | None = None
    photos: list[str] = []  # URL 列表


class TripView(TripCard):
    """前台行程详情视图"""
    points: list[TripPointView] = []


class TripsView(SQLModel):
    data: list[TripCard]
    count: int
