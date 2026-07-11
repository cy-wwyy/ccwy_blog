from httpx import AsyncClient

from app.core.config import settings

API = settings.API_V1_STR


async def _make_post(client: AsyncClient, auth: dict[str, str], slug: str) -> None:
    resp = await client.post(
        f"{API}/admin/posts",
        headers=auth,
        json={
            "title": f"文章 {slug}",
            "slug": slug,
            "content": "正文内容",
            "status": "published",
        },
    )
    assert resp.status_code == 200, resp.text


async def _views(client: AsyncClient, slug: str) -> int:
    r = await client.get(f"{API}/posts/{slug}")
    assert r.status_code == 200, r.text
    return r.json()["views"]


async def _track(
    client: AsyncClient, kind: str, vid: str, slug: str | None = None
) -> None:
    # 在 client 上设定 vid cookie 模拟不同访客（cookie 为访客主标识）
    client.cookies.set("vid", vid)
    body: dict[str, object] = {"kind": kind}
    if slug:
        body["slug"] = slug
    r = await client.post(f"{API}/track", json=body)
    assert r.status_code == 204


async def test_track_post_view_dedup_and_distinct_visitors(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await _make_post(client, auth, "hello")
    assert await _views(client, "hello") == 0

    await _track(client, "post", "A", "hello")  # 访客 A 首访 → +1
    assert await _views(client, "hello") == 1

    await _track(client, "post", "A", "hello")  # A 半小时内重复 → 去重
    assert await _views(client, "hello") == 1

    await _track(client, "post", "B", "hello")  # 访客 B → +1
    assert await _views(client, "hello") == 2


async def test_track_sets_cookie_when_absent(client: AsyncClient) -> None:
    # 无 cookie → 兜底用 IP+UA，并下发 vid cookie
    client.cookies.clear()
    r = await client.post(f"{API}/track", json={"kind": "site"})
    assert r.status_code == 204
    assert client.cookies.get("vid")


async def test_track_invalid_target_ignored(client: AsyncClient) -> None:
    r = await client.post(f"{API}/track", json={"kind": "post", "slug": "nope"})
    assert r.status_code == 204


async def test_site_visitors_overview_and_public(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    for vid in ("v1", "v2", "v1"):  # v1 两次 → UV 去重后算 1
        await _track(client, "site", vid)

    # 后台鉴权版
    r = await client.get(f"{API}/admin/stats/overview", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json() == {"visitors_today": 2, "visitors_total": 2}

    # 公开版（前台右栏用）
    pub = await client.get(f"{API}/site-stats")
    assert pub.status_code == 200
    assert pub.json()["visitors_total"] == 2


async def test_post_stats_ranking(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await _make_post(client, auth, "hot")
    await _make_post(client, auth, "cold")
    for vid in ("a", "b"):
        await _track(client, "post", vid, "hot")
    await _track(client, "post", "a", "cold")

    r = await client.get(f"{API}/admin/stats/posts", headers=auth)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data[0]["slug"] == "hot" and data[0]["views"] == 2
    slugs = {d["slug"]: d["views"] for d in data}
    assert slugs["cold"] == 1


async def test_stats_require_auth(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/admin/stats/overview")).status_code == 401
    assert (await client.get(f"{API}/admin/stats/posts")).status_code == 401
