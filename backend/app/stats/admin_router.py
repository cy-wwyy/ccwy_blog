from fastapi import APIRouter, Depends, Query

from app.core.deps import SessionDep, require_permission
from app.core.models import User
from app.stats import crud
from app.stats.models import PostViewStats, StatsOverview

router = APIRouter(prefix="/admin/stats", tags=["admin-stats"])


@router.get("/overview", response_model=StatsOverview)
async def overview(
    session: SessionDep,
    _: User = Depends(require_permission("settings:manage")),
) -> StatsOverview:
    return StatsOverview(
        visitors_today=await crud.visitors_today(session=session),
        visitors_total=await crud.visitors_total(session=session),
    )


@router.get("/posts", response_model=PostViewStats)
async def post_stats(
    session: SessionDep,
    limit: int = Query(default=10, ge=1, le=50),
    _: User = Depends(require_permission("settings:manage")),
) -> PostViewStats:
    data = await crud.post_view_stats(session=session, limit=limit)
    return PostViewStats(data=data)
