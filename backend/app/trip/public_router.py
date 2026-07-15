from fastapi import APIRouter, HTTPException, Query

from app.core.deps import SessionDep
from app.trip import crud
from app.trip.admin_router import _photos_of_point, _trip_to_public
from app.trip.models import (
    TripCard,
    TripPointView,
    TripsView,
    TripView,
)

router = APIRouter(tags=["trips"])


# ── helpers ───────────────────────────────────────────


def _point_to_view(point) -> TripPointView:
    photos = getattr(point, "_photos", [])
    return TripPointView(
        id=point.id,
        title=point.title,
        description=point.description,
        point_type=point.point_type,
        location_name=point.location_name,
        latitude=point.latitude,
        longitude=point.longitude,
        arrived_at=point.arrived_at,
        sort_order=point.sort_order,
        polyline_to_next=point.polyline_to_next,
        distance_to_next=point.distance_to_next,
        photos=photos,
    )


# ── 公开端点 ──────────────────────────────────────────


@router.get("/trips", response_model=TripsView)
async def list_trips(
    session: SessionDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> TripsView:
    """公开行程列表（仅已发布且公开的行程）。"""
    items, count = await crud.list_trips(
        session=session,
        skip=skip,
        limit=limit,
        status="published",
        is_public=True,
        sort_order="desc",
    )
    cards: list[TripCard] = []
    for t in items:
        pub = await _trip_to_public(session, t)
        cards.append(
            TripCard(
                id=pub.id,
                title=pub.title,
                slug=pub.slug,
                description=pub.description,
                cover_url=pub.cover_url,
                start_date=pub.start_date,
                end_date=pub.end_date,
                point_count=pub.point_count,
                total_distance=pub.total_distance,
                created_at=pub.created_at,
                updated_at=pub.updated_at,
            )
        )
    return TripsView(data=cards, count=count)


@router.get("/trips/{slug}", response_model=TripView)
async def get_trip(session: SessionDep, slug: str) -> TripView:
    """公开行程详情（含所有记录点和路线 polyline）。"""
    trip = await crud.get_trip_by_slug(session=session, slug=slug)
    if not trip or trip.status != "published" or not trip.is_public:
        raise HTTPException(status_code=404, detail="行程不存在")

    pub = await _trip_to_public(session, trip)
    card = TripCard(
        id=pub.id,
        title=pub.title,
        slug=pub.slug,
        description=pub.description,
        cover_url=pub.cover_url,
        start_date=pub.start_date,
        end_date=pub.end_date,
        point_count=pub.point_count,
        total_distance=pub.total_distance,
        created_at=pub.created_at,
        updated_at=pub.updated_at,
    )

    points = await crud.list_points_by_trip(session=session, trip_id=trip.id)
    views: list[TripPointView] = []
    for p in points:
        photos = await _photos_of_point(session, p.id)
        p._photos = photos  # type: ignore[attr-defined]
        views.append(_point_to_view(p))

    return TripView(**card.model_dump(), points=views)
