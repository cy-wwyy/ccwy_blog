from datetime import UTC, datetime

from sqlmodel import col, func, or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.trip.helpers import (
    fill_location_auto,
    handle_point_deleted,
    update_point_polylines,
)
from app.trip.models import (
    Trip,
    TripCreate,
    TripPoint,
    TripPointCreate,
    TripPointUpdate,
    TripUpdate,
)

_ALLOWED_SORT_COLUMNS = {"created_at", "updated_at", "title"}


# ── Trip ────────────────────────────────────────────────


async def create_trip(
    *, session: AsyncSession, trip_in: TripCreate
) -> Trip:
    trip = Trip.model_validate(trip_in)
    session.add(trip)
    await session.commit()
    await session.refresh(trip)
    return trip


async def get_trip(
    *, session: AsyncSession, trip_id: str
) -> Trip | None:
    return await session.get(Trip, trip_id)


async def get_trip_by_slug(
    *, session: AsyncSession, slug: str
) -> Trip | None:
    return (await session.exec(select(Trip).where(Trip.slug == slug))).first()


async def list_trips(
    *,
    session: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    status: str | None = None,
    is_public: bool | None = None,
    search: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[Trip], int]:
    items_stmt = select(Trip)
    count_stmt = select(func.count()).select_from(Trip)

    if status:
        count_stmt = count_stmt.where(Trip.status == status)
        items_stmt = items_stmt.where(Trip.status == status)
    if is_public is not None:
        count_stmt = count_stmt.where(Trip.is_public == is_public)
        items_stmt = items_stmt.where(Trip.is_public == is_public)
    if search:
        like = f"%{search}%"
        cond = or_(col(Trip.title).like(like), col(Trip.slug).like(like))
        count_stmt = count_stmt.where(cond)
        items_stmt = items_stmt.where(cond)

    sort_by = sort_by if sort_by in _ALLOWED_SORT_COLUMNS else "created_at"
    sort_col = getattr(Trip, sort_by)
    if sort_order == "asc":
        items_stmt = items_stmt.order_by(col(sort_col).asc())
    else:
        items_stmt = items_stmt.order_by(col(sort_col).desc())

    count = (await session.exec(count_stmt)).one()
    items = (await session.exec(items_stmt.offset(skip).limit(limit))).all()
    return list(items), count


async def update_trip(
    *, session: AsyncSession, db_trip: Trip, trip_in: TripUpdate
) -> Trip:
    data = trip_in.model_dump(exclude_unset=True)
    if data:
        data["updated_at"] = datetime.now(UTC)
        db_trip.sqlmodel_update(data)
        session.add(db_trip)
        await session.commit()
        await session.refresh(db_trip)
    return db_trip


async def delete_trip(*, session: AsyncSession, trip: Trip) -> None:
    await session.delete(trip)
    await session.commit()


# ── TripPoint ───────────────────────────────────────────


async def create_point(
    *, session: AsyncSession, point_in: TripPointCreate
) -> TripPoint:
    point = TripPoint.model_validate(point_in)

    # 自动补全位置
    await fill_location_auto(point)

    # 途经点：只要求坐标，标题/地名由后端自动补全
    if point.point_type == "waypoint":
        if not (point.title or "").strip():
            point.title = point.location_name or "途经点"
        if not point.arrived_at:
            point.arrived_at = datetime.now(UTC)
    else:
        # 非途经点：置待生成状态，由后台任务异步生成推荐
        point.ai_rec_status = "pending"

    session.add(point)
    await session.flush()

    # 更新前后点的 polyline 缓存
    await update_point_polylines(point, session)

    await session.commit()
    await session.refresh(point)
    return point


async def get_point(
    *, session: AsyncSession, point_id: str
) -> TripPoint | None:
    return await session.get(TripPoint, point_id)


async def list_points_by_trip(
    *, session: AsyncSession, trip_id: str
) -> list[TripPoint]:
    return list(
        (
            await session.exec(
                select(TripPoint)
                .where(TripPoint.trip_id == trip_id)
                .order_by(TripPoint.sort_order, TripPoint.arrived_at)
            )
        ).all()
    )


async def update_point(
    *, session: AsyncSession, db_point: TripPoint, point_in: TripPointUpdate
) -> TripPoint:
    data = point_in.model_dump(exclude_unset=True)
    loc_changed = (
        "latitude" in data
        or "longitude" in data
        or "location_name" in data
    )

    if data:
        data["updated_at"] = datetime.now(UTC)
        db_point.sqlmodel_update(data)

        # 自动补全（仅当位置字段有变化时）
        if loc_changed:
            await fill_location_auto(db_point)

        # 途经点标题为空时自动补全（用逆地理编码后的地名或默认值）
        if db_point.point_type == "waypoint" and not (db_point.title or "").strip():
            db_point.title = db_point.location_name or "途经点"

        session.add(db_point)

    # 位置变了 → 刷新相邻 polyline
    if loc_changed:
        await update_point_polylines(db_point, session)

    await session.commit()
    await session.refresh(db_point)
    return db_point


async def delete_point(
    *, session: AsyncSession, point: TripPoint
) -> None:
    trip_id = point.trip_id
    # 找到删除前的排序位置
    all_points = list(
        (
            await session.exec(
                select(TripPoint)
                .where(TripPoint.trip_id == trip_id)
                .order_by(TripPoint.sort_order, TripPoint.arrived_at)
            )
        ).all()
    )
    deleted_idx = next(
        (i for i, p in enumerate(all_points) if p.id == point.id), -1
    )

    await session.delete(point)
    await session.flush()

    # 重新连接被断开的相邻点
    await handle_point_deleted(trip_id, deleted_idx, session)

    await session.commit()


# ── Validators ──────────────────────────────────────────


async def trip_slug_exists(
    *, session: AsyncSession, slug: str, exclude_id: str | None = None
) -> bool:
    """检查行程 slug 是否已存在（可选排除自身）。"""
    stmt = select(Trip.id).where(Trip.slug == slug)
    if exclude_id:
        stmt = stmt.where(Trip.id != exclude_id)
    return (await session.exec(stmt)).first() is not None
