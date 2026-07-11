from httpx import AsyncClient

from app.core.config import settings

API = settings.API_V1_STR


async def test_login_success(client: AsyncClient) -> None:
    resp = await client.post(
        f"{API}/login/access-token",
        data={
            "username": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]


async def test_login_wrong_password(client: AsyncClient) -> None:
    resp = await client.post(
        f"{API}/login/access-token",
        data={"username": settings.FIRST_SUPERUSER, "password": "wrong-password"},
    )
    assert resp.status_code == 400


async def test_test_token(client: AsyncClient, auth: dict[str, str]) -> None:
    resp = await client.post(f"{API}/login/test-token", headers=auth)
    assert resp.status_code == 200
    assert resp.json()["email"] == settings.FIRST_SUPERUSER


async def test_admin_posts_requires_auth(client: AsyncClient) -> None:
    resp = await client.get(f"{API}/admin/posts")
    assert resp.status_code == 401
