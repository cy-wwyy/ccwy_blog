"""高德地图 Web API 集成：地理编码、路径规划、polyline 缓存更新。"""

import logging

import httpx
from sqlmodel import select

from app.core.config import settings

logger = logging.getLogger(__name__)

_AMAP_BASE = "https://restapi.amap.com/v3"

# 路径规划超时（秒）—— 比默认长，高德驾车路径规划有时较慢
_ROUTE_TIMEOUT = 10.0

# 两点间最大直线距离（公里），超出则跳过路径规划
_MAX_STRAIGHT_DISTANCE = 500

# 交通方式 → AI 推荐周边搜索半径（米）
TRIP_MODE_RADIUS: dict[str, int] = {
    "hiking": 20_000,
    "cycling": 50_000,
    "motorcycle": 100_000,
    "driving": 150_000,
}


def _key_params() -> dict[str, str]:
    return {"key": settings.AMAP_WEB_KEY}


# ── 地理编码 ───────────────────────────────────────────


async def geocode(address: str, city: str = "") -> tuple[float, float] | None:
    """地名 → 经纬度。返回 (lng, lat) 或 None。"""
    params = {**_key_params(), "address": address}
    if city:
        params["city"] = city
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_AMAP_BASE}/geocode/geo", params=params)
            resp.raise_for_status()
    except Exception:
        logger.warning("高德地理编码失败: %s", address, exc_info=True)
        return None
    data = resp.json()
    if data.get("status") != "1" or not data.get("geocodes"):
        logger.warning("高德地理编码无结果: %s", address)
        return None
    loc = data["geocodes"][0]["location"]  # "lng,lat"
    lng_str, lat_str = loc.split(",")
    return float(lng_str), float(lat_str)


async def regeocode(lng: float, lat: float) -> str | None:
    """经纬度 → 地名。返回格式化地址或 None。"""
    params = {**_key_params(), "location": f"{lng},{lat}"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_AMAP_BASE}/geocode/regeo", params=params)
            resp.raise_for_status()
    except Exception:
        logger.warning("高德逆地理编码失败: %.4f,%.4f", lng, lat, exc_info=True)
        return None
    data = resp.json()
    if data.get("status") != "1" or not data.get("regeocode"):
        logger.warning("高德逆地理编码无结果: %.4f,%.4f", lng, lat)
        return None
    return data["regeocode"]["formatted_address"] or None


# ── 驾车路径规划 ──────────────────────────────────────


async def driving_route(
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
    strategy: int = 10,
) -> tuple[str, int] | None:
    """两点间驾车路径规划。

    Args:
        strategy: 路径策略。0=速度优先, 10=不走高速(默认), 12=距离优先。
                  摩旅默认不走高速。

    Returns:
        (polyline, distance_meters) 或 None
    """
    # 防呆：两点距离过远
    dist_km = _haversine(origin_lng, origin_lat, dest_lng, dest_lat)
    if dist_km > _MAX_STRAIGHT_DISTANCE:
        logger.info("两点直线距离 %.0fkm > %dkm，跳过路径规划", dist_km, _MAX_STRAIGHT_DISTANCE)
        return None

    params = {
        **_key_params(),
        "origin": f"{origin_lng},{origin_lat}",
        "destination": f"{dest_lng},{dest_lat}",
        "strategy": str(strategy),
        "extensions": "base",  # 只要 polyline 和距离，不返回步骤
    }
    try:
        async with httpx.AsyncClient(timeout=_ROUTE_TIMEOUT) as client:
            resp = await client.get(f"{_AMAP_BASE}/direction/driving", params=params)
            resp.raise_for_status()
    except Exception:
        logger.warning(
            "高德路径规划失败: (%.4f,%.4f)→(%.4f,%.4f)",
            origin_lng, origin_lat, dest_lng, dest_lat,
            exc_info=True,
        )
        return None
    data = resp.json()
    if data.get("status") != "1" or not data.get("route"):
        logger.warning("高德路径规划无结果")
        return None
    route = data["route"]
    # paths[0] 的 steps 各自有 polyline，拼成完整路线
    path = route.get("paths", [{}])[0]
    steps = path.get("steps") or []
    if not steps:
        return None

    # 拼接所有 step 的 polyline（格式: "lng,lat;lng,lat;..."）
    segments: list[str] = []
    for step in steps:
        poly = step.get("polyline", "")
        if poly:
            segments.append(poly)
    if not segments:
        return None
    polyline = ";".join(segments)
    distance = int(path.get("distance", 0))
    return polyline, distance


# ── POI 周边搜索 ─────────────────────────────────────


async def search_nearby_poi(
    lng: float,
    lat: float,
    radius: int,
    types: str = "110000",
    keywords: str | None = None,
) -> list[dict] | None:
    """高德周边搜索 POI，供 AI 推荐候选。

    Args:
        lng, lat: 中心点经纬度
        radius: 搜索半径（米）
        types: 高德 POI 分类编码，默认 110000（风景名胜）；传 None 则不按分类过滤
        keywords: 关键词（如"营地"），传 None 则不按关键词过滤

    Returns:
        精简后的 POI 列表 [{name, address, distance_m, lng, lat}] 或 None
    """
    params = {
        **_key_params(),
        "location": f"{lng},{lat}",
        "radius": str(radius),
        "offset": "20",
        "page": "1",
        "extensions": "base",
    }
    if types:
        params["types"] = types
    if keywords:
        params["keywords"] = keywords
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{_AMAP_BASE}/place/around", params=params)
            resp.raise_for_status()
    except Exception:
        logger.warning("高德周边搜索失败: (%.4f,%.4f)", lng, lat, exc_info=True)
        return None
    data = resp.json()
    if data.get("status") != "1" or not data.get("pois"):
        logger.warning("高德周边搜索无结果: (%.4f,%.4f)", lng, lat)
        return None

    pois: list[dict] = []
    for p in data["pois"]:
        plng, plat = None, None
        loc = p.get("location", "")
        if loc:
            try:
                plng_str, plat_str = loc.split(",")
                plng, plat = float(plng_str), float(plat_str)
            except ValueError:
                pass
        raw_dist = p.get("distance")
        try:
            dist_m = int(raw_dist) if raw_dist is not None else None
        except (TypeError, ValueError):
            dist_m = None
        pois.append({
            "name": p.get("name", ""),
            "address": p.get("address", ""),
            "distance_m": dist_m,
            "lng": plng,
            "lat": plat,
        })
    return pois


# ── polyline 缓存更新 ─────────────────────────────────


async def update_point_polylines(
    point,
    session,
) -> None:
    """更新单点的 polyline_to_next（即本点→下一个点的路线）。

    用于新增点、编辑点经纬度后刷新缓存。
    会同时更新前驱点（如果存在）的 polyline_to_next。
    """
    from app.trip.models import TripPoint

    # 找到本行程中所有记录点，按 sort_order + arrived_at 排序
    all_points = (
        await session.exec(
            select(TripPoint)
            .where(TripPoint.trip_id == point.trip_id)
            .order_by(TripPoint.sort_order, TripPoint.arrived_at)
        )
    ).all()
    points = list(all_points)

    idx = next((i for i, p in enumerate(points) if p.id == point.id), None)
    if idx is None:
        return

    # 更新前驱 → 本点 的 polyline
    if idx > 0:
        prev = points[idx - 1]
        poly, dist = await _fetch_pair_polyline(prev, point)
        prev.polyline_to_next = poly
        prev.distance_to_next = dist
        session.add(prev)

    # 更新本点 → 后继 的 polyline
    if idx < len(points) - 1:
        nxt = points[idx + 1]
        poly, dist = await _fetch_pair_polyline(point, nxt)
        point.polyline_to_next = poly
        point.distance_to_next = dist
    else:
        # 最后一个点，清空
        point.polyline_to_next = None
        point.distance_to_next = None

    session.add(point)


async def _fetch_pair_polyline(origin, dest) -> tuple[str | None, int | None]:
    """获取两点间的 polyline + distance。任一点缺经纬度返回 None。"""
    if (
        origin.latitude is None
        or origin.longitude is None
        or dest.latitude is None
        or dest.longitude is None
    ):
        return None, None
    result = await driving_route(
        origin.longitude, origin.latitude,
        dest.longitude, dest.latitude,
    )
    if result:
        return result
    return None, None


async def handle_point_deleted(
    trip_id: str, deleted_idx: int, session
) -> None:
    """删除记录点后，重新连接被断开的前后两点。"""
    from app.trip.models import TripPoint

    all_points = (
        await session.exec(
            select(TripPoint)
            .where(TripPoint.trip_id == trip_id)
            .order_by(TripPoint.sort_order, TripPoint.arrived_at)
        )
    ).all()
    points = list(all_points)

    if 0 < deleted_idx <= len(points):
        prev = points[deleted_idx - 1]
        if deleted_idx < len(points):
            nxt = points[deleted_idx]
            poly, dist = await _fetch_pair_polyline(prev, nxt)
            prev.polyline_to_next = poly
            prev.distance_to_next = dist
        else:
            prev.polyline_to_next = None
            prev.distance_to_next = None
        session.add(prev)


async def fill_location_auto(point) -> bool:
    """自动补全位置字段（就地修改）。

    - 只有经纬度、无地名 → 逆地理编码填名称
    - 只有地名、无经纬度 → 地理编码填经纬度
    - 都有或都无 → 跳过

    Returns:
        是否有字段被自动补全。
    """
    has_coords = point.latitude is not None and point.longitude is not None
    has_name = bool(point.location_name)

    if has_coords and not has_name:
        name = await regeocode(point.longitude, point.latitude)
        if name:
            point.location_name = name
            return True

    if has_name and not has_coords:
        coords = await geocode(point.location_name)
        if coords:
            point.longitude, point.latitude = coords
            return True

    return False


# ── 工具函数 ──────────────────────────────────────────


def _haversine(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """两点间的大圆距离（km），用于判断是否需要跳过路径规划。"""
    from math import asin, cos, radians, sin, sqrt

    lng1, lat1, lng2, lat2 = map(radians, [lng1, lat1, lng2, lat2])
    dlng = lng2 - lng1
    dlat = lat2 - lat1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(a))


def bearing_compass(lng1: float, lat1: float, lng2: float, lat2: float) -> str:
    """从点1到点2的前进方向，返回中文方位（北/东北/东/…）。"""
    from math import atan2, cos, degrees, radians, sin

    dlng = radians(lng2 - lng1)
    lat1r, lat2r = radians(lat1), radians(lat2)
    x = sin(dlng) * cos(lat2r)
    y = cos(lat1r) * sin(lat2r) - sin(lat1r) * cos(lat2r) * cos(dlng)
    bearing = (degrees(atan2(x, y)) + 360) % 360
    compass = ("北", "东北", "东", "东南", "南", "西南", "西", "西北")
    return compass[int((bearing + 22.5) / 45) % 8]
