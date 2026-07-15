"""川藏线 G318 测试数据 — 直接调 API 创建行程与记录点。"""

import asyncio
import httpx

import os

API = os.getenv("API_BASE", "http://localhost:8080/api/v1")
EMAIL = os.getenv("ADMIN_EMAIL", "")
PASSWORD = os.getenv("ADMIN_PASSWORD", "")

if not EMAIL or not PASSWORD:
    print("请设置环境变量 ADMIN_EMAIL 和 ADMIN_PASSWORD")
    exit(1)

POINTS = [
    # (标题, 类型, 地名, 纬度, 经度, arrived_at)
    ("成都出发", "accommodation", "四川省成都市", 30.572961, 104.066301, "2026-08-01T08:00:00"),
    ("雅安午餐", "lunch", "四川省雅安市雨城区", 29.984042, 103.010777, "2026-08-01T12:00:00"),
    ("泸定桥打卡", "viewpoint", "四川省甘孜州泸定县", 29.915478, 102.229261, "2026-08-01T15:30:00"),
    ("康定情歌城", "accommodation", "四川省甘孜州康定市", 30.052812, 101.963837, "2026-08-01T18:00:00"),
    ("翻越折多山", "pass", "四川省甘孜州康定市折多山垭口", 30.072154, 101.794690, "2026-08-02T10:30:00"),
    ("新都桥摄影天堂", "viewpoint", "四川省甘孜州康定市新都桥镇", 30.040490, 101.487645, "2026-08-02T12:00:00"),
    ("雅江歇脚", "accommodation", "四川省甘孜州雅江县", 30.031461, 101.014249, "2026-08-02T17:00:00"),
    ("天路十八弯", "viewpoint", "四川省甘孜州雅江县剪子弯山", 30.015176, 100.856248, "2026-08-03T09:30:00"),
    ("世界高城理塘", "accommodation", "四川省甘孜州理塘县", 29.996697, 100.269547, "2026-08-03T16:00:00"),
    ("毛垭大草原", "viewpoint", "四川省甘孜州理塘县毛垭草原", 29.974981, 100.079470, "2026-08-04T09:00:00"),
    ("姊妹湖", "viewpoint", "四川省甘孜州巴塘县海子山", 30.016255, 99.561717, "2026-08-04T12:00:00"),
    ("巴塘休整", "accommodation", "四川省甘孜州巴塘县", 30.005374, 99.110749, "2026-08-04T17:00:00"),
    ("金沙江进藏", "viewpoint", "西藏昌都市芒康县金沙江大桥", 29.756989, 98.958263, "2026-08-05T10:00:00"),
    ("芒康第一站", "accommodation", "西藏昌都市芒康县", 29.680095, 98.593737, "2026-08-05T15:00:00"),
    ("东达山垭口", "pass", "西藏昌都市左贡县东达山", 29.626123, 98.089876, "2026-08-06T10:30:00"),
    ("左贡休息", "accommodation", "西藏昌都市左贡县", 29.671399, 97.840496, "2026-08-06T16:00:00"),
    ("业拉山怒江72拐", "pass", "西藏昌都市八宿县业拉山", 29.993987, 97.251197, "2026-08-07T09:30:00"),
    ("八宿温泉", "accommodation", "西藏昌都市八宿县", 30.053882, 96.918174, "2026-08-07T17:00:00"),
    ("然乌湖仙境", "viewpoint", "西藏昌都市八宿县然乌湖", 29.499758, 96.694704, "2026-08-08T10:00:00"),
    ("波密冰川", "viewpoint", "西藏林芝市波密县", 29.858720, 95.767504, "2026-08-08T14:00:00"),
    ("通麦天险", "viewpoint", "西藏林芝市波密县通麦镇", 30.101087, 95.083998, "2026-08-09T09:00:00"),
    ("鲁朗林海", "accommodation", "西藏林芝市巴宜区鲁朗镇", 29.675353, 94.724671, "2026-08-09T15:00:00"),
    ("林芝桃花沟", "viewpoint", "西藏林芝市巴宜区", 29.650413, 94.360975, "2026-08-10T09:30:00"),
    ("工布江达午餐", "lunch", "西藏林芝市工布江达县", 29.885492, 93.246110, "2026-08-10T12:30:00"),
    ("米拉山口", "pass", "西藏拉萨市墨竹工卡县米拉山", 29.820338, 92.346820, "2026-08-10T15:00:00"),
    ("抵达拉萨", "accommodation", "西藏拉萨市布达拉宫", 29.654839, 91.140553, "2026-08-10T18:30:00"),
]

TRIP = {
    "title": "川藏线 G318 摩旅",
    "slug": "g318-sichuan-tibet-2026",
    "description": "从成都到拉萨，沿 G318 跨越横断山脉、念青唐古拉山，全程约 2200 公里。一路翻越折多山、东达山、米拉山，看尽川西草原与藏地雪山。",
    "start_date": "2026-08-01",
    "end_date": "2026-08-10",
    "is_public": True,
    "status": "published",
}


async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. 登录
        r = await client.post(
            f"{API}/login/access-token",
            data={"username": EMAIL, "password": PASSWORD},
        )
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        print(f"✅ 登录成功 (token: {token[:20]}...)")

        # 2. 检查是否已有同名行程
        r = await client.get(
            f"{API}/admin/trips/by-slug/{TRIP['slug']}", headers=headers
        )
        if r.status_code == 200:
            print("⚠️  同名行程已存在，跳过创建")
            trip_id = r.json()["id"]
            # 删除旧的重新造
            await client.delete(f"{API}/admin/trips/{trip_id}", headers=headers)
            print("   → 已删除旧行程")

        # 3. 创建行程
        r = await client.post(
            f"{API}/admin/trips", headers=headers, json=TRIP
        )
        r.raise_for_status()
        trip = r.json()
        trip_id = trip["id"]
        print(f"✅ 创建行程: {TRIP['title']} (id={trip_id})")

        # 4. 逐点添加（每个点会触发高德路径规划，间隔一下避免太密集）
        for i, (title, ptype, loc, lat, lng, arrived) in enumerate(POINTS):
            payload = {
                "trip_id": trip_id,
                "title": title,
                "point_type": ptype,
                "location_name": loc,
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "arrived_at": arrived,
                "sort_order": i,
            }
            r = await client.post(
                f"{API}/admin/trips/{trip_id}/points",
                headers=headers,
                json=payload,
            )
            if r.status_code == 201:
                data = r.json()
                poly = "✓" if data.get("polyline_to_next") else "✗"
                print(f"  [{i+1:2d}/{len(POINTS)}] {title:12s} {poly}路线")
            else:
                print(f"  [{i+1:2d}/{len(POINTS)}] {title:12s} ✗ HTTP {r.status_code}: {r.text[:80]}")
            # 稍微等一下避免请求太密
            if i < len(POINTS) - 1:
                await asyncio.sleep(0.3)

    print("\n🎉 完成！访问 http://localhost:3000/trips/g318-sichuan-tibet-2026 查看地图")


if __name__ == "__main__":
    asyncio.run(main())
