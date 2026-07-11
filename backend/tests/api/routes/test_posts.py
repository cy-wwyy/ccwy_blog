from httpx import AsyncClient

from app.core.config import settings

API = settings.API_V1_STR


async def _create_tag(client: AsyncClient, auth: dict[str, str], slug: str) -> str:
    resp = await client.post(
        f"{API}/admin/tags", headers=auth, json={"name": slug, "slug": slug}
    )
    return resp.json()["id"]


async def _new_post(client: AsyncClient, auth: dict[str, str], **overrides):
    body = {"title": "标题", "slug": "post-1", "content": "正文"}
    body.update(overrides)
    return await client.post(f"{API}/admin/posts", headers=auth, json=body)


async def test_create_draft_has_no_published_at(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    resp = await _new_post(client, auth, status="draft")
    assert resp.status_code == 200
    assert resp.json()["published_at"] is None


async def test_create_published_sets_published_at(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # M3：创建即发布时自动记录 published_at
    resp = await _new_post(client, auth, slug="pub", status="published")
    assert resp.status_code == 200
    assert resp.json()["published_at"] is not None


async def test_publish_and_unpublish_transitions(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # M3：草稿→发布置时间；发布→草稿清空
    post = (await _new_post(client, auth, slug="p", status="draft")).json()
    assert post["published_at"] is None

    published = (
        await client.patch(
            f"{API}/admin/posts/{post['id']}", headers=auth,
            json={"status": "published"},
        )
    ).json()
    assert published["published_at"] is not None

    back = (
        await client.patch(
            f"{API}/admin/posts/{post['id']}", headers=auth,
            json={"status": "draft"},
        )
    ).json()
    assert back["published_at"] is None


async def test_create_post_duplicate_slug(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # M1：slug 冲突返回 400 而非 500
    await _new_post(client, auth, slug="dup")
    resp = await _new_post(client, auth, slug="dup", title="另一篇")
    assert resp.status_code == 400


async def test_create_post_invalid_category(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # M2：分类不存在返回 400
    resp = await _new_post(client, auth, slug="badcat", category_id="not-exist")
    assert resp.status_code == 400


async def test_create_post_invalid_tag(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # M2：标签不存在返回 400，且不产生悬挂关联
    resp = await _new_post(client, auth, slug="badtag", tag_ids=["not-exist"])
    assert resp.status_code == 400


async def test_create_post_with_valid_tag(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    tag_id = await _create_tag(client, auth, "python")
    resp = await _new_post(client, auth, slug="withtag", tag_ids=[tag_id])
    assert resp.status_code == 200
    assert [t["id"] for t in resp.json()["tags"]] == [tag_id]


async def test_create_post_invalid_status_rejected(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    # status 收敛为 Literal，非法值由 pydantic 拦截（422）
    resp = await _new_post(client, auth, slug="badstatus", status="archived")
    assert resp.status_code == 422


async def test_public_only_lists_published(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    await _new_post(client, auth, slug="pub-post", status="published")
    await _new_post(client, auth, slug="draft-post", title="草稿", status="draft")
    resp = await client.get(f"{API}/posts")
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()["data"]]
    assert "pub-post" in slugs
    assert "draft-post" not in slugs
