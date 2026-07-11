from httpx import AsyncClient

from app.core.config import settings

API = settings.API_V1_STR


async def test_settings_require_auth(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/admin/settings/profile")).status_code == 401
    assert (await client.get(f"{API}/admin/settings/site")).status_code == 401


async def test_profile_read_and_update(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 初始可读
    r = await client.get(f"{API}/admin/settings/profile", headers=auth)
    assert r.status_code == 200, r.text
    assert "display_name" in r.json()
    assert r.json()["is_owner"] is True  # 初始管理员即博主

    r2 = await client.patch(
        f"{API}/admin/settings/profile",
        headers=auth,
        json={
            "display_name": "王五",
            "bio": "记录技术与生活",
            "github": "https://github.com/foo",
            "website": "https://foo.dev",
            "avatar": "https://cdn/x.png",
        },
    )
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["display_name"] == "王五"
    assert d["bio"] == "记录技术与生活"  # 落在 User 表
    assert d["github"] == "https://github.com/foo"  # 同样落在 User 表
    assert d["avatar"] == "https://cdn/x.png"

    # 部分更新不影响未提交字段
    r3 = await client.patch(
        f"{API}/admin/settings/profile", headers=auth, json={"bio": "改了"}
    )
    assert r3.json()["bio"] == "改了"
    assert r3.json()["display_name"] == "王五"


async def test_site_settings_defaults_and_upsert(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 默认：site_title 取 PROJECT_NAME，其余空串
    r = await client.get(f"{API}/admin/settings/site", headers=auth)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["site_title"] == settings.PROJECT_NAME
    assert d["site_subtitle"] == ""

    r2 = await client.patch(
        f"{API}/admin/settings/site",
        headers=auth,
        json={"site_title": "我的博客", "footer_text": "© 2026", "icp": "京ICP备X号"},
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["site_title"] == "我的博客"
    assert d2["footer_text"] == "© 2026"
    assert d2["icp"] == "京ICP备X号"

    # 持久化 + 部分更新
    r3 = await client.patch(
        f"{API}/admin/settings/site",
        headers=auth,
        json={"site_subtitle": "副标题"},
    )
    d3 = r3.json()
    assert d3["site_subtitle"] == "副标题"
    assert d3["site_title"] == "我的博客"  # 未提交，保持


async def test_public_site_info(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await client.patch(
        f"{API}/admin/settings/site",
        headers=auth,
        json={"site_title": "公开标题", "footer_text": "版权"},
    )
    await client.patch(
        f"{API}/admin/settings/profile",
        headers=auth,
        json={"display_name": "博主", "bio": "简介"},
    )

    r = await client.get(f"{API}/site-settings")  # 无需鉴权
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["site_title"] == "公开标题"
    assert d["footer_text"] == "版权"
    assert d["author"]["display_name"] == "博主"
    assert d["author"]["bio"] == "简介"
    # 不应泄漏 KV 内部结构或用户敏感字段
    assert "hashed_password" not in d["author"]
