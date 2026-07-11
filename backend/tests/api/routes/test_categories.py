from httpx import AsyncClient

from app.core.config import settings

API = settings.API_V1_STR


async def _create_category(
    client: AsyncClient, auth: dict[str, str], name: str, slug: str,
    parent_id: str | None = None,
) -> dict:
    resp = await client.post(
        f"{API}/admin/categories",
        headers=auth,
        json={"name": name, "slug": slug, "parent_id": parent_id},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_admin_categories_requires_auth(client: AsyncClient) -> None:
    # M4：后台分类列表不再允许匿名访问
    resp = await client.get(f"{API}/admin/categories")
    assert resp.status_code == 401


async def test_create_category_duplicate_slug(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await _create_category(client, auth, "技术", "tech")
    resp = await client.post(
        f"{API}/admin/categories",
        headers=auth,
        json={"name": "技术2", "slug": "tech"},
    )
    assert resp.status_code == 400


async def test_create_category_invalid_parent(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    resp = await client.post(
        f"{API}/admin/categories",
        headers=auth,
        json={"name": "子", "slug": "child", "parent_id": "not-exist"},
    )
    assert resp.status_code == 400


async def test_update_category_self_parent_rejected(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    cat = await _create_category(client, auth, "A", "a")
    resp = await client.patch(
        f"{API}/admin/categories/{cat['id']}",
        headers=auth,
        json={"parent_id": cat["id"]},
    )
    assert resp.status_code == 400


async def test_update_category_cycle_rejected(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # S1：A 为 B 的父，禁止再把 A 的父设为 B（成环）
    a = await _create_category(client, auth, "A", "a")
    b = await _create_category(client, auth, "B", "b", parent_id=a["id"])
    resp = await client.patch(
        f"{API}/admin/categories/{a['id']}",
        headers=auth,
        json={"parent_id": b["id"]},
    )
    assert resp.status_code == 400


async def test_delete_category_nulls_posts(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    cat = await _create_category(client, auth, "临时", "tmp")
    post = (
        await client.post(
            f"{API}/admin/posts",
            headers=auth,
            json={
                "title": "T", "slug": "t-post", "content": "c",
                "category_id": cat["id"],
            },
        )
    ).json()
    assert post["category_id"] == cat["id"]

    resp = await client.delete(
        f"{API}/admin/categories/{cat['id']}", headers=auth
    )
    assert resp.status_code == 200

    got = (
        await client.get(f"{API}/admin/posts/{post['id']}", headers=auth)
    ).json()
    assert got["category_id"] is None


async def _create_post_in(
    client: AsyncClient, auth: dict[str, str], slug: str, category_id: str
) -> dict:
    resp = await client.post(
        f"{API}/admin/posts",
        headers=auth,
        json={"title": "T", "slug": slug, "content": "c", "category_id": category_id},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_post_cannot_use_non_leaf_category(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # R1：父级有子分类后，文章不能再挂到父级
    parent = await _create_category(client, auth, "父", "parent")
    await _create_category(client, auth, "子", "child", parent_id=parent["id"])
    resp = await client.post(
        f"{API}/admin/posts",
        headers=auth,
        json={"title": "T", "slug": "on-parent", "content": "c",
              "category_id": parent["id"]},
    )
    assert resp.status_code == 400


async def test_create_child_migrates_parent_posts(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # R2：在有文章的父级下建子级 → 父级文章全部迁到新子级
    parent = await _create_category(client, auth, "父", "parent")
    post = await _create_post_in(client, auth, "mig-post", parent["id"])
    assert post["category_id"] == parent["id"]

    child = await _create_category(client, auth, "子", "child", parent_id=parent["id"])

    got = (
        await client.get(f"{API}/admin/posts/{post['id']}", headers=auth)
    ).json()
    assert got["category_id"] == child["id"]


async def test_reparent_under_posts_bearing_parent_rejected(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # 边界(a)：把已有分类移到"有文章的父级"下 → 400
    p = await _create_category(client, auth, "P", "p")
    x = await _create_category(client, auth, "X", "x")
    await _create_post_in(client, auth, "p-post", p["id"])

    resp = await client.patch(
        f"{API}/admin/categories/{x['id']}",
        headers=auth,
        json={"parent_id": p["id"]},
    )
    assert resp.status_code == 400


async def test_max_three_levels_on_create(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # R3：最多三层，第四层拒绝
    a = await _create_category(client, auth, "A", "a")
    b = await _create_category(client, auth, "B", "b", parent_id=a["id"])
    c = await _create_category(client, auth, "C", "c", parent_id=b["id"])
    resp = await client.post(
        f"{API}/admin/categories",
        headers=auth,
        json={"name": "D", "slug": "d", "parent_id": c["id"]},
    )
    assert resp.status_code == 400

