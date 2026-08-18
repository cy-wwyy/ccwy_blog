from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.deps import SessionDep, require_permission
from app.core.models import Media, Message
from app.storage import storage
from app.trip import crud
from app.trip.ai_tasks import generate_recommendation_task
from app.trip.models import (
    Trip,
    TripCreate,
    TripDetail,
    TripPoint,
    TripPointCreate,
    TripPointPublic,
    TripPointUpdate,
    TripPublic,
    TripsPublic,
    TripUpdate,
)

router = APIRouter(prefix="/admin/trips", tags=["admin-trips"])


# ── helpers ───────────────────────────────────────────


def _media_url(path: str | None, thumb_path: str | None = None) -> str | None:
    """优先返回缩略图 URL，否则返回原图 URL。"""
    if thumb_path:
        return storage.url(thumb_path)
    if path:
        return storage.url(path)
    return None


async def _point_to_public(
    session: AsyncSession, point: TripPoint
) -> TripPointPublic:
    return TripPointPublic(
        id=point.id,
        trip_id=point.trip_id,
        title=point.title,
        description=point.description,
        point_type=point.point_type,
        location_name=point.location_name,
        latitude=point.latitude,
        longitude=point.longitude,
        arrived_at=point.arrived_at,
        sort_order=point.sort_order,
        distance_to_next=point.distance_to_next,
        ai_rec_status=point.ai_rec_status,
        ai_rec=point.ai_rec,
        created_at=point.created_at,
    )


async def _trip_to_public(
    session: AsyncSession, trip: Trip
) -> TripPublic:
    cover_url = None
    if trip.cover_media_id:
        media = await session.get(Media, trip.cover_media_id)
        if media:
            cover_url = _media_url(media.path, media.thumb_path)

    points = await crud.list_points_by_trip(session=session, trip_id=trip.id)
    total_dist = sum(
        p.distance_to_next for p in points if p.distance_to_next is not None
    )

    return TripPublic(
        id=trip.id,
        title=trip.title,
        slug=trip.slug,
        description=trip.description,
        cover_url=cover_url,
        start_date=trip.start_date,
        end_date=trip.end_date,
        is_public=trip.is_public,
        status=trip.status,
        trip_mode=trip.trip_mode,
        route_plan=trip.route_plan,
        interest_tags=trip.interest_tags,
        preferences=trip.preferences,
        point_count=len(points),
        total_distance=total_dist or None,
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )


async def _trip_to_detail(
    session: AsyncSession, trip: Trip
) -> TripDetail:
    pub = await _trip_to_public(session, trip)
    points = await crud.list_points_by_trip(session=session, trip_id=trip.id)
    detail = TripDetail(**pub.model_dump())
    detail.points = [
        await _point_to_public(session, p) for p in points
    ]
    return detail


# ── 校验 ──────────────────────────────────────────────


async def _validate_trip_refs(
    session: AsyncSession,
    *,
    slug: str | None,
    cover_media_id: str | None,
    exclude_id: str | None = None,
) -> None:
    if slug is not None:
        existing = await crud.trip_slug_exists(
            session=session, slug=slug, exclude_id=exclude_id
        )
        if existing:
            raise HTTPException(status_code=400, detail="slug 已存在")
    if cover_media_id is not None and not await session.get(
        Media, cover_media_id
    ):
        raise HTTPException(status_code=400, detail="封面文件不存在")


async def _get_trip_or_404(
    session: AsyncSession, trip_id: str
) -> Trip:
    trip = await crud.get_trip(session=session, trip_id=trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="行程不存在")
    return trip


async def _get_point_or_404(
    session: AsyncSession, point_id: str, trip_id: str
) -> TripPoint:
    point = await crud.get_point(session=session, point_id=point_id)
    if not point or point.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="记录点不存在")
    return point


# ── 行程 CRUD ──────────────────────────────────────────


@router.get("", response_model=TripsPublic)
async def admin_list_trips(
    session: SessionDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
    is_public: bool | None = None,
    search: str | None = None,
    sort_order: str = "desc",
    _=Depends(require_permission("trip:manage")),
) -> TripsPublic:
    items, count = await crud.list_trips(
        session=session,
        skip=skip,
        limit=limit,
        status=status,
        is_public=is_public,
        search=search,
        sort_order=sort_order,
    )
    data = [await _trip_to_public(session, t) for t in items]
    return TripsPublic(data=data, count=count)


@router.get("/{trip_id}", response_model=TripDetail)
async def admin_get_trip(
    session: SessionDep,
    trip_id: str,
    _=Depends(require_permission("trip:manage")),
) -> TripDetail:
    trip = await _get_trip_or_404(session, trip_id)
    return await _trip_to_detail(session, trip)


@router.get("/by-slug/{slug}", response_model=TripDetail)
async def admin_get_trip_by_slug(
    session: SessionDep,
    slug: str,
    _=Depends(require_permission("trip:manage")),
) -> TripDetail:
    trip = await crud.get_trip_by_slug(session=session, slug=slug)
    if not trip:
        raise HTTPException(status_code=404, detail="行程不存在")
    return await _trip_to_detail(session, trip)


@router.post("", response_model=TripDetail, status_code=201)
async def admin_create_trip(
    session: SessionDep,
    trip_in: TripCreate,
    _=Depends(require_permission("trip:manage")),
) -> TripDetail:
    await _validate_trip_refs(
        session, slug=trip_in.slug, cover_media_id=trip_in.cover_media_id
    )
    trip = await crud.create_trip(session=session, trip_in=trip_in)
    return await _trip_to_detail(session, trip)


@router.patch("/{trip_id}", response_model=TripDetail)
async def admin_update_trip(
    session: SessionDep,
    trip_id: str,
    trip_in: TripUpdate,
    _=Depends(require_permission("trip:manage")),
) -> TripDetail:
    trip = await _get_trip_or_404(session, trip_id)
    await _validate_trip_refs(
        session,
        slug=trip_in.slug,
        cover_media_id=trip_in.cover_media_id,
        exclude_id=trip_id,
    )
    trip = await crud.update_trip(
        session=session, db_trip=trip, trip_in=trip_in
    )
    return await _trip_to_detail(session, trip)


@router.delete("/{trip_id}", response_model=Message)
async def admin_delete_trip(
    session: SessionDep,
    trip_id: str,
    _=Depends(require_permission("trip:manage")),
) -> Message:
    trip = await _get_trip_or_404(session, trip_id)
    await crud.delete_trip(session=session, trip=trip)
    return Message(message="已删除")


# ── 记录点 CRUD ────────────────────────────────────────


@router.get("/{trip_id}/points", response_model=list[TripPointPublic])
async def admin_list_points(
    session: SessionDep,
    trip_id: str,
    _=Depends(require_permission("trip:manage")),
) -> list[TripPointPublic]:
    await _get_trip_or_404(session, trip_id)
    points = await crud.list_points_by_trip(session=session, trip_id=trip_id)
    return [await _point_to_public(session, p) for p in points]


@router.post(
    "/{trip_id}/points", response_model=TripPointPublic, status_code=201
)
async def admin_create_point(
    session: SessionDep,
    trip_id: str,
    point_in: TripPointCreate,
    background_tasks: BackgroundTasks,
    _=Depends(require_permission("trip:manage")),
) -> TripPointPublic:
    await _get_trip_or_404(session, trip_id)
    point = await crud.create_point(session=session, point_in=point_in)

    # 途经点（纯路线锚点）不生成推荐；其余在 create_point 内已置 pending
    if point.point_type != "waypoint":
        background_tasks.add_task(generate_recommendation_task, point.id)

    return await _point_to_public(session, point)


@router.patch(
    "/{trip_id}/points/{point_id}", response_model=TripPointPublic
)
async def admin_update_point(
    session: SessionDep,
    trip_id: str,
    point_id: str,
    point_in: TripPointUpdate,
    _=Depends(require_permission("trip:manage")),
) -> TripPointPublic:
    point = await _get_point_or_404(session, point_id, trip_id)
    point = await crud.update_point(
        session=session, db_point=point, point_in=point_in
    )
    return await _point_to_public(session, point)


@router.delete(
    "/{trip_id}/points/{point_id}", response_model=Message
)
async def admin_delete_point(
    session: SessionDep,
    trip_id: str,
    point_id: str,
    _=Depends(require_permission("trip:manage")),
) -> Message:
    point = await _get_point_or_404(session, point_id, trip_id)
    await crud.delete_point(session=session, point=point)
    return Message(message="已删除")
