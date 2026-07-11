import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.media import admin_router as media_router

API = settings.API_V1_STR


@pytest.fixture(autouse=True)
def _no_real_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """避免测试真的写磁盘/传 OSS：把 media 上传的 storage.save 换成 no-op。"""

    async def _fake_save(key: str, data: bytes, mime_type: str) -> bool:
        return False

    monkeypatch.setattr(media_router.storage, "save", _fake_save)


async def _upload_media(client: AsyncClient, auth: dict[str, str], content: bytes) -> str:
    """经媒体库上传一张图，返回 media_id（供挂载/封面复用）。"""
    resp = await client.post(
        f"{API}/admin/media?module=album",
        headers=auth,
        files={"file": ("p.png", content, "image/png")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _album(**over: object) -> dict:
    base = {"title": "旅行", "slug": "travel"}
    base.update(over)
    return base


async def test_public_endpoints_hide_internal_fields(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 建公开相册 + 挂一张照片
    aid = (
        await client.post(
            f"{API}/admin/albums",
            headers=auth,
            json=_album(slug="pub", is_public=True),
        )
    ).json()["id"]
    mid = await _upload_media(client, auth, b"pubimg")
    await client.post(
        f"{API}/admin/albums/{aid}/photos",
        headers=auth,
        json={"media_id": mid, "caption": "c"},
    )

    # 列表：不应暴露内部字段
    card = (await client.get(f"{API}/albums")).json()["data"][0]
    for leaked in ("cover_media_id", "is_public", "sort_order"):
        assert leaked not in card, f"公开列表泄漏了 {leaked}"
    assert {"id", "title", "slug", "cover_url", "photo_count"} <= card.keys()

    # 详情：相册与照片都不应暴露内部字段
    detail = (await client.get(f"{API}/albums/pub")).json()
    for leaked in ("cover_media_id", "is_public", "sort_order"):
        assert leaked not in detail
    photo = detail["photos"][0]
    assert "media_id" not in photo and "sort_order" not in photo
    assert {"id", "url", "caption"} <= photo.keys()


async def test_public_hides_non_public_album(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await client.post(
        f"{API}/admin/albums",
        headers=auth,
        json=_album(slug="secret", is_public=False),
    )
    # 列表不含私密相册
    data = (await client.get(f"{API}/albums")).json()["data"]
    assert all(a["slug"] != "secret" for a in data)
    # 详情 404
    assert (await client.get(f"{API}/albums/secret")).status_code == 404


async def test_album_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(f"{API}/admin/albums")
    assert resp.status_code == 401


async def test_list_albums_batches_photo_count(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 两个相册、照片数不同 —— 验证列表批量计数（albums_to_public）正确
    a1 = (
        await client.post(
            f"{API}/admin/albums", headers=auth, json=_album(slug="a1")
        )
    ).json()["id"]
    a2 = (
        await client.post(
            f"{API}/admin/albums", headers=auth, json=_album(slug="a2")
        )
    ).json()["id"]
    for content in (b"x1", b"x2"):
        mid = await _upload_media(client, auth, content)
        await client.post(
            f"{API}/admin/albums/{a1}/photos",
            headers=auth,
            json={"media_id": mid},
        )
    mid = await _upload_media(client, auth, b"y1")
    await client.post(
        f"{API}/admin/albums/{a2}/photos", headers=auth, json={"media_id": mid}
    )

    resp = await client.get(f"{API}/admin/albums", headers=auth)
    assert resp.status_code == 200
    counts = {a["id"]: a["photo_count"] for a in resp.json()["data"]}
    assert counts[a1] == 2
    assert counts[a2] == 1


async def test_create_and_fetch_album(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    r = await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["slug"] == "travel"
    assert d["photo_count"] == 0
    assert d["photos"] == []

    # by-slug 与 by-id 都能取到
    aid = d["id"]
    r_slug = await client.get(f"{API}/admin/albums/by-slug/travel", headers=auth)
    assert r_slug.status_code == 200
    assert r_slug.json()["id"] == aid
    r_id = await client.get(f"{API}/admin/albums/{aid}", headers=auth)
    assert r_id.status_code == 200


async def test_slug_conflict_rejected(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    r2 = await client.post(
        f"{API}/admin/albums", headers=auth, json=_album(title="又一个")
    )
    assert r2.status_code == 400


async def test_cover_must_exist(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    r = await client.post(
        f"{API}/admin/albums",
        headers=auth,
        json=_album(cover_media_id="nonexistent"),
    )
    assert r.status_code == 400


async def test_add_photo_and_detail(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    media_id = await _upload_media(client, auth, b"photo-a")
    aid = (
        await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    ).json()["id"]

    r = await client.post(
        f"{API}/admin/albums/{aid}/photos",
        headers=auth,
        json={"media_id": media_id, "caption": "海边", "sort_order": 1},
    )
    assert r.status_code == 200, r.text
    photo = r.json()
    assert photo["caption"] == "海边"
    assert photo["url"]  # storage.url 已填充

    detail = (
        await client.get(f"{API}/admin/albums/{aid}", headers=auth)
    ).json()
    assert detail["photo_count"] == 1
    assert len(detail["photos"]) == 1
    assert detail["photos"][0]["media_id"] == media_id


async def test_add_photo_bad_media_rejected(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    aid = (
        await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    ).json()["id"]
    r = await client.post(
        f"{API}/admin/albums/{aid}/photos",
        headers=auth,
        json={"media_id": "nope"},
    )
    assert r.status_code == 400


async def test_update_and_delete_photo(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    media_id = await _upload_media(client, auth, b"photo-b")
    aid = (
        await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    ).json()["id"]
    pid = (
        await client.post(
            f"{API}/admin/albums/{aid}/photos",
            headers=auth,
            json={"media_id": media_id},
        )
    ).json()["id"]

    # 改图注/排序
    r = await client.patch(
        f"{API}/admin/albums/{aid}/photos/{pid}",
        headers=auth,
        json={"caption": "改了", "sort_order": 5},
    )
    assert r.status_code == 200
    assert r.json()["caption"] == "改了"

    # 删照片
    r_del = await client.delete(
        f"{API}/admin/albums/{aid}/photos/{pid}", headers=auth
    )
    assert r_del.status_code == 200
    detail = (
        await client.get(f"{API}/admin/albums/{aid}", headers=auth)
    ).json()
    assert detail["photo_count"] == 0


async def test_delete_album_cascades_photos(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    media_id = await _upload_media(client, auth, b"photo-c")
    aid = (
        await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    ).json()["id"]
    await client.post(
        f"{API}/admin/albums/{aid}/photos",
        headers=auth,
        json={"media_id": media_id},
    )

    r = await client.delete(f"{API}/admin/albums/{aid}", headers=auth)
    assert r.status_code == 200
    # 相册已删
    assert (
        await client.get(f"{API}/admin/albums/{aid}", headers=auth)
    ).status_code == 404


async def test_update_album(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    aid = (
        await client.post(f"{API}/admin/albums", headers=auth, json=_album())
    ).json()["id"]
    r = await client.patch(
        f"{API}/admin/albums/{aid}",
        headers=auth,
        json={"title": "新标题", "is_public": False},
    )
    assert r.status_code == 200
    d = r.json()
    assert d["title"] == "新标题"
    assert d["is_public"] is False
