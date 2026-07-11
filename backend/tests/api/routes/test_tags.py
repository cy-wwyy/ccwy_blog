from httpx import AsyncClient

from app.core.config import settings

API = settings.API_V1_STR


async def _create_tag(
    client: AsyncClient, auth: dict[str, str], name: str, slug: str
) -> dict:
    resp = await client.post(
        f"{API}/admin/tags",
        headers=auth,
        json={"name": name, "slug": slug},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_admin_tags_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(f"{API}/admin/tags")
    assert resp.status_code == 401


async def test_create_and_list_tag(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await _create_tag(client, auth, "Python", "python")
    resp = await client.get(f"{API}/admin/tags", headers=auth)
    assert resp.status_code == 200
    assert any(t["slug"] == "python" for t in resp.json())


async def test_create_tag_duplicate_slug(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await _create_tag(client, auth, "Python", "python")
    resp = await client.post(
        f"{API}/admin/tags",
        headers=auth,
        json={"name": "Py", "slug": "python"},
    )
    assert resp.status_code == 400
