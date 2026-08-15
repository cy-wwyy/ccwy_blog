"""AI 推荐后台任务：创建记录点后异步生成下一程推荐。"""

import json
import logging

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.ai import client
from app.core.db import engine
from app.trip.helpers import (
    TRIP_MODE_RADIUS,
    bearing_compass,
    driving_route,
    geocode,
    search_nearby_poi,
)
from app.trip.models import Trip, TripPoint

logger = logging.getLogger(__name__)


async def generate_recommendation_task(point_id: str) -> None:
    """为指定记录点生成下一程推荐（BackgroundTasks 触发）。

    用独立 AsyncSession（请求已返回，原 session 已关闭）。
    全程 try/except，失败置 ai_rec_status="failed"，不抛异常。
    """
    async with AsyncSession(engine) as session:
        point = await session.get(TripPoint, point_id)
        if not point:
            return
        trip = await session.get(Trip, point.trip_id)
        if not trip:
            return

        try:
            result = await _build_recommendation(session, trip, point)
            point.ai_rec = json.dumps(result, ensure_ascii=False)
            point.ai_rec_status = "ready"
        except Exception as e:
            logger.warning("AI 推荐生成失败 point=%s: %s", point_id, e)
            point.ai_rec_status = "failed"

        session.add(point)
        await session.commit()


async def _build_recommendation(
    session: AsyncSession, trip: Trip, point: TripPoint
) -> dict:
    """组装上下文（最近点 + 高德候选）并调用 LLM。"""
    # 1. 最近 3 个点（当前点 + 前 2 个），按 sort_order + arrived_at 排序
    all_points = list(
        (
            await session.exec(
                select(TripPoint)
                .where(TripPoint.trip_id == trip.id)
                .order_by(TripPoint.sort_order, TripPoint.arrived_at)
            )
        ).all()
    )
    idx = next((i for i, p in enumerate(all_points) if p.id == point.id), -1)
    if idx < 0:
        idx = len(all_points) - 1
    recent = all_points[max(0, idx - 2): idx + 1]
    recent_points = [
        {
            "title": p.title,
            "point_type": p.point_type,
            "location_name": p.location_name or "",
            "lat": p.latitude,
            "lng": p.longitude,
        }
        for p in recent
    ]

    # 1b. 前进方向（最近两个点坐标算方位角，供 LLM 避免推荐身后地点）
    direction = ""
    if len(recent) >= 2:
        prev_p, cur_p = recent[-2], recent[-1]
        if (
            prev_p.longitude is not None and prev_p.latitude is not None
            and cur_p.longitude is not None and cur_p.latitude is not None
        ):
            compass = bearing_compass(
                prev_p.longitude, prev_p.latitude,
                cur_p.longitude, cur_p.latitude,
            )
            direction = (
                f"前进方向：正在往{compass}方向前进（最近依次经过 "
                f"「{prev_p.title}」→「{cur_p.title}」）。"
                "下一站必须沿此方向推荐前方地点，不要推荐身后已走过的地方。"
            )

    # 2. 高德周边搜索候选 POI
    candidates: list[dict] = []
    if point.latitude is not None and point.longitude is not None:
        radius = TRIP_MODE_RADIUS.get(trip.trip_mode, 100_000)
        pois = await search_nearby_poi(point.longitude, point.latitude, radius)
        if pois:
            candidates = [
                {
                    "name": p["name"],
                    "distance_km": round((p["distance_m"] or 0) / 1000, 1),
                    "address": p["address"] or "",
                }
                for p in pois
            ]

    # 3. LLM 决策
    result = await client.generate_recommendation(
        session=session,
        trip_mode=trip.trip_mode,
        route_plan=trip.route_plan,
        interest_tags=trip.interest_tags,
        preferences=trip.preferences,
        direction=direction,
        recent_points=recent_points,
        candidates=candidates,
    )
    if result is None:
        raise RuntimeError("LLM 未返回有效推荐")

    # 3b. 后处理：用高德验证 next_stop 真实距离（LLM 估的距离可能不准）
    ns = result.get("next_stop")
    if (
        isinstance(ns, dict)
        and ns.get("name")
        and point.longitude is not None
        and point.latitude is not None
    ):
        coords = await geocode(str(ns["name"]))
        if coords:
            route = await driving_route(
                point.longitude, point.latitude, coords[0], coords[1]
            )
            if route:
                ns["distance_km"] = round(route[1] / 1000, 1)
    return result
