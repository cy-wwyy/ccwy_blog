from fastapi import APIRouter, Depends, Query

from app.core.deps import SessionDep, require_permission
from app.core.models import User
from app.stats import crud
from app.stats.models import (
    DailyStats,
    HourlyStats,
    PostViewStats,
    StatsOverview,
)

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


@router.get("/daily", response_model=DailyStats)
async def daily(
    session: SessionDep,
    days: int = Query(default=30, ge=1, le=365),
    kind: str = Query(default="site", pattern="^(site|post|album)$"),
    _: User = Depends(require_permission("settings:manage")),
) -> DailyStats:
    """按本地日聚合的 PV/UV 序列（缺失日期补 0）。"""
    data = await crud.daily_stats(session=session, days=days, kind=kind)
    return DailyStats(data=data)


@router.get("/hourly", response_model=HourlyStats)
async def hourly(
    session: SessionDep,
    days: int = Query(default=7, ge=1, le=90),
    kind: str = Query(default="site", pattern="^(site|post|album)$"),
    _: User = Depends(require_permission("settings:manage")),
) -> HourlyStats:
    """星期 × 小时 的访问热力（0=周一 … 6=周日，共 168 格）。"""
    data = await crud.hourly_stats(session=session, days=days, kind=kind)
    return HourlyStats(data=data)
