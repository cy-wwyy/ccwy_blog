"""AI 功能 API 端点。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel

from app.ai import client
from app.core.deps import SessionDep
from app.core.models import User
from app.core.deps import require_permission

router = APIRouter(prefix="/ai", tags=["ai"])


class GenerateSlugRequest(SQLModel):
    title: str
    lang: str = "zh"


class GenerateSlugResponse(SQLModel):
    slug: str


@router.post("/generate-slug", response_model=GenerateSlugResponse)
async def generate_slug(
    data: GenerateSlugRequest,
    session: SessionDep,
    _current_user: User = Depends(require_permission("posts:create")),
) -> GenerateSlugResponse:
    """由标题调用 LLM 生成英文 slug（手动 ✨ 按钮调用）。

    鉴权：至少需要 posts:create 权限（写文章/标签/分类/相册的最低门槛）。
    """
    try:
        slug = await client.generate_slug(
            session=session, title=data.title, lang=data.lang
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return GenerateSlugResponse(slug=slug)
