from fastapi import APIRouter, HTTPException, Query

from app.blog import crud
from app.blog.helpers import category_to_public, post_to_detail, post_to_public
from app.blog.models import CategoryPublic, PostDetail, PostsPublic
from app.core.deps import SessionDep
from app.stats import crud as stats_crud

router = APIRouter()
posts_router = APIRouter(prefix="/posts", tags=["posts"])

# ── Categories ─────────────────────────────────────────


@router.get("/categories", response_model=list[CategoryPublic])
async def list_categories(session: SessionDep) -> list[CategoryPublic]:
    cats = await crud.list_categories(session=session)
    return [category_to_public(c) for c in cats]

# ── Posts ──────────────────────────────────────────────


@posts_router.get("", response_model=PostsPublic)
async def list_posts(
    session: SessionDep,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    category_id: str | None = None,
    search: str | None = Query(default=None, max_length=100),
) -> PostsPublic:
    items, count = await crud.list_posts(
        session=session, skip=skip, limit=limit,
        status="published", is_public=True,
        category_id=category_id, search=search,
    )
    data = [post_to_public(p) for p in items]
    views = await stats_crud.views_by_posts(
        session=session, post_ids=[p.id for p in items]
    )
    for pub in data:
        pub.views = views.get(pub.id, 0)
    return PostsPublic(data=data, count=count)


@posts_router.get("/{slug}", response_model=PostDetail)
async def get_post(session: SessionDep, slug: str) -> PostDetail:
    post = await crud.get_post_by_slug(session=session, slug=slug)
    if not post or post.status != "published":
        raise HTTPException(status_code=404, detail="文章不存在")
    if not post.is_public:
        raise HTTPException(status_code=404, detail="文章不存在")
    detail = await post_to_detail(session, post)
    detail.views = await stats_crud.count_post_views(
        session=session, post_id=post.id
    )
    return detail
