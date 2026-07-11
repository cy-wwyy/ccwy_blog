"""通用媒体文件上传接口。"""

import hashlib
import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep, require_permission
from app.core.models import Media
from app.media.schemas import MediaPublic
from app.storage import storage

router = APIRouter(prefix="/admin/media", tags=["media"])

# 允许的扩展名（图片为主，兼顾视频/PDF）
ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "svg", "mp4", "webm", "pdf",
}

# module 会作为存储路径前缀，必须是安全的路径段，防止路径穿越
_MODULE_PATTERN = re.compile(r"^[a-z0-9_-]{1,32}$")


def _to_public(media: Media, *, deduped: bool = False) -> MediaPublic:
    return MediaPublic(
        id=media.id,
        filename=media.filename,
        url=storage.url(media.path),
        mime_type=media.mime_type,
        size=media.size,
        module=media.module,
        synced_to_oss=media.synced_to_oss,
        deduped=deduped,
        created_at=media.created_at,
    )


async def _find_by_hash(session: AsyncSession, content_hash: str) -> Media | None:
    return (
        await session.exec(
            select(Media).where(Media.content_hash == content_hash)
        )
    ).first()


@router.post("", response_model=MediaPublic)
async def upload_media(
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    module: str = Query(
        "media", description="归属模块：blog / media / album 等，作为存储路径前缀"
    ),
    _=Depends(require_permission("media:manage")),
) -> MediaPublic:
    """上传媒体文件。按模块前缀分目录存储；相同内容自动去重返回已有文件。"""
    if not _MODULE_PATTERN.match(module):
        raise HTTPException(
            status_code=400, detail="module 仅允许小写字母、数字、_ 和 -"
        )

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: .{ext}")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=400, detail=f"文件超过 {settings.MAX_UPLOAD_SIZE_MB}MB 限制"
        )

    content_hash = hashlib.sha256(content).hexdigest()

    # 内容级去重：已存在同内容文件 → 直接返回，不重复落盘/传 OSS/建行
    existing = await _find_by_hash(session, content_hash)
    if existing:
        return _to_public(existing, deduped=True)

    # key: 模块/年/月/uuid.ext —— 模块前缀便于在本地和 OSS 中按功能区分
    key = (
        f"{module}/{datetime.now(UTC).strftime('%Y/%m')}/{uuid.uuid4().hex}.{ext}"
    )
    mime_type = file.content_type or "application/octet-stream"

    # 双写：本地 + 可选 OSS
    synced = await storage.save(key, content, mime_type)

    media = Media(
        filename=filename or f"file.{ext}",
        path=key,
        mime_type=mime_type,
        size=len(content),
        content_hash=content_hash,
        module=module,
        synced_to_oss=synced,
        uploaded_by=current_user.id,
    )
    session.add(media)
    try:
        await session.commit()
    except IntegrityError:
        # 并发下同内容竞态命中唯一约束：回滚并返回已存在的那条
        await session.rollback()
        existing = await _find_by_hash(session, content_hash)
        if existing:
            return _to_public(existing, deduped=True)
        raise
    await session.refresh(media)
    return _to_public(media, deduped=False)
