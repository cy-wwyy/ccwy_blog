from fastapi import APIRouter, Request, Response

from app.album import crud as album_crud
from app.blog import crud as blog_crud
from app.core.config import settings
from app.core.deps import SessionDep
from app.core.utils import generate_ulid
from app.stats import crud
from app.stats.models import StatsOverview, TrackIn

router = APIRouter(tags=["stats"])

_VID_COOKIE = "vid"
_VID_MAX_AGE = 60 * 60 * 24 * 365  # 一年


@router.post("/track", status_code=204)
async def track(
    session: SessionDep, data: TrackIn, request: Request
) -> Response:
    """前台埋点：记录一次访问。半小时内同一访客同一目标只计一次。

    访客识别统一使用 cookie vid（跨网络/跨天稳定），
    首次访问自动生成并下发。
    """
    resp = Response(status_code=204)
    vid = request.cookies.get(_VID_COOKIE)
    if not vid:
        vid = generate_ulid()
        resp.set_cookie(
            _VID_COOKIE,
            vid,
            max_age=_VID_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=settings.ENVIRONMENT != "local",
            path="/",
        )
    vkey = crud.visitor_key_cookie(vid)

    post_id: str | None = None
    album_id: str | None = None

    if data.kind == "post":
        if not data.slug:
            return resp
        post = await blog_crud.get_post_by_slug(session=session, slug=data.slug)
        if not post or post.status != "published" or not post.is_public:
            return resp  # 无效目标静默忽略，不泄漏存在性
        post_id = post.id
    elif data.kind == "album":
        if not data.slug:
            return resp
        album = await album_crud.get_album_by_slug(
            session=session, slug=data.slug
        )
        if not album or not album.is_public:
            return resp
        album_id = album.id

    await crud.record_view(
        session=session,
        kind=data.kind,
        vkey=vkey,
        post_id=post_id,
        album_id=album_id,
    )
    return resp


@router.get("/site-stats", response_model=StatsOverview)
async def site_stats(session: SessionDep) -> StatsOverview:
    """公开：整站访客量（今日 / 累计），供前台右栏展示。"""
    return StatsOverview(
        visitors_today=await crud.visitors_today(session=session),
        visitors_total=await crud.visitors_total(session=session),
    )
