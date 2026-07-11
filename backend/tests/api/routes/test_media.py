from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.config import settings
from app.media import admin_router as media_router

API = settings.API_V1_STR


def _real_png(width: int = 800, height: int = 600) -> bytes:
    """生成一张真实 PNG，供缩略图生成用。"""
    buf = BytesIO()
    Image.new("RGB", (width, height), (120, 60, 200)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _no_real_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """避免测试真的写磁盘/传 OSS：把 storage.save 换成 no-op。"""

    async def _fake_save(key: str, data: bytes, mime_type: str) -> bool:
        return False

    monkeypatch.setattr(media_router.storage, "save", _fake_save)


def _png(name: str, content: bytes) -> dict:
    return {"file": (name, content, "image/png")}


async def test_upload_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        f"{API}/admin/media", files=_png("x.png", b"hi")
    )
    assert resp.status_code == 401


async def test_upload_bad_type(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    resp = await client.post(
        f"{API}/admin/media",
        headers=auth,
        files={"file": ("x.txt", b"hi", "text/plain")},
    )
    assert resp.status_code == 400


async def test_upload_and_dedup_same_content(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 首次上传
    r1 = await client.post(
        f"{API}/admin/media?module=blog",
        headers=auth,
        files=_png("a.png", b"same-bytes"),
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["deduped"] is False

    # 同内容再传（文件名不同也算同一文件）→ 去重，返回同一条
    r2 = await client.post(
        f"{API}/admin/media?module=blog",
        headers=auth,
        files=_png("a-again.png", b"same-bytes"),
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["deduped"] is True
    assert d2["id"] == d1["id"]
    assert d2["url"] == d1["url"]


async def test_upload_different_content_not_deduped(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    r1 = await client.post(
        f"{API}/admin/media", headers=auth, files=_png("x.png", b"content-x")
    )
    r2 = await client.post(
        f"{API}/admin/media", headers=auth, files=_png("y.png", b"content-y")
    )
    assert r1.json()["id"] != r2.json()["id"]
    assert r2.json()["deduped"] is False


async def test_upload_generates_thumbnail(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 真实栅格图 → 应生成 .thumb.webp 缩略图
    resp = await client.post(
        f"{API}/admin/media?module=album",
        headers=auth,
        files={"file": ("real.png", _real_png(), "image/png")},
    )
    assert resp.status_code == 200, resp.text
    d = resp.json()
    assert d["thumb_url"], "栅格图应生成缩略图"
    assert d["thumb_url"].endswith(".thumb.webp")


async def test_upload_svg_has_no_thumbnail(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # svg 是矢量图，不生成缩略图
    resp = await client.post(
        f"{API}/admin/media",
        headers=auth,
        files={"file": ("icon.svg", b"<svg></svg>", "image/svg+xml")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["thumb_url"] is None
