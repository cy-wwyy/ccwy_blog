"""通用媒体文件上传接口。"""

import asyncio
import hashlib
import logging
import re
import uuid
from datetime import UTC, datetime
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep, require_permission
from app.core.models import Media
from app.media.schemas import MediaPublic
from app.storage import storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/media", tags=["media"])

# 允许的扩展名（图片为主，兼顾视频/PDF）
ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "svg", "mp4", "webm", "pdf",
}

# 可生成缩略图的栅格图类型（svg 是矢量、无需缩略图；视频/pdf 无法处理）
_THUMBNAILABLE = {"jpg", "jpeg", "png", "gif", "webp"}
# 缩略图最长边像素
_THUMB_MAX = 400
# 解压炸弹防护：超过此像素面积的图不解码生成缩略图（压缩后字节小但解码后巨大）
_MAX_PIXELS = 50_000_000
# 让 PIL 对极端超大图在 load() 阶段直接抛错（会被 _generate_thumbnail 兜住降级）
Image.MAX_IMAGE_PIXELS = _MAX_PIXELS

# module 会作为存储路径前缀，必须是安全的路径段，防止路径穿越
_MODULE_PATTERN = re.compile(r"^[a-z0-9_-]{1,32}$")


def _generate_thumbnail(
    content: bytes,
) -> tuple[bytes | None, int | None, int | None]:
    """生成 webp 缩略图。返回 (缩略图字节, 原图宽, 原图高)。

    非法/无法识别/超大的图片安全降级：缩略图字节为 None，尺寸尽力返回。
    纯 CPU 操作，调用方需放到线程池执行，避免阻塞事件循环。
    """
    try:
        with Image.open(BytesIO(content)) as img:
            img.load()
            width, height = img.size
            thumb = img.copy()
    except Exception:
        return None, None, None

    # 解压炸弹防护：面积超限不生成缩略图（尺寸仍返回供记录）
    if width * height > _MAX_PIXELS:
        thumb.close()
        return None, width, height

    try:
        thumb.thumbnail((_THUMB_MAX, _THUMB_MAX))
        # webp 仅支持部分模式，其余统一转 RGBA 保留透明度
        if thumb.mode not in ("RGB", "RGBA", "L"):
            thumb = thumb.convert("RGBA")
        buf = BytesIO()
        thumb.save(buf, format="WEBP", quality=80, method=4)
        return buf.getvalue(), width, height
    except Exception:
        return None, width, height
    finally:
        thumb.close()


def _thumb_key(key: str) -> str:
    """由原图 key 派生缩略图 key：同目录，扩展名换成 .thumb.webp。"""
    base = key.rsplit(".", 1)[0] if "." in key else key
    return f"{base}.thumb.webp"


async def _safe_delete(*keys: str | None) -> None:
    """尽力删除已写入存储的文件，用于清理孤儿；失败仅记日志不抛。"""
    for key in keys:
        if not key:
            continue
        try:
            await storage.delete(key)
        except Exception as e:  # noqa: BLE001
            logger.warning("清理孤儿文件失败 %s: %s", key, e)


def _to_public(media: Media, *, deduped: bool = False) -> MediaPublic:
    return MediaPublic(
        id=media.id,
        filename=media.filename,
        url=storage.url(media.path),
        thumb_url=storage.url(media.thumb_path) if media.thumb_path else None,
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

    # 栅格图生成缩略图（webp）并记录原图尺寸。
    # 生成或存储失败都安全降级为「无缩略图」，绝不拖垮主上传流程。
    thumb_path: str | None = None
    width: int | None = None
    height: int | None = None
    if ext in _THUMBNAILABLE:
        loop = asyncio.get_running_loop()
        thumb_bytes, width, height = await loop.run_in_executor(
            None, _generate_thumbnail, content
        )
        if thumb_bytes is not None:
            candidate = _thumb_key(key)
            try:
                await storage.save(candidate, thumb_bytes, "image/webp")
                thumb_path = candidate
            except Exception as e:  # noqa: BLE001
                logger.warning("缩略图存储失败 %s，按无缩略图处理: %s", candidate, e)

    media = Media(
        filename=filename or f"file.{ext}",
        path=key,
        mime_type=mime_type,
        size=len(content),
        content_hash=content_hash,
        width=width,
        height=height,
        thumb_path=thumb_path,
        module=module,
        synced_to_oss=synced,
        uploaded_by=current_user.id,
    )
    session.add(media)
    try:
        await session.commit()
    except IntegrityError:
        # 并发下同内容竞态命中唯一约束：回滚并返回已存在的那条，
        # 同时清理本请求已写入的孤儿文件（原图 + 缩略图）。
        await session.rollback()
        await _safe_delete(key, thumb_path)
        existing = await _find_by_hash(session, content_hash)
        if existing:
            return _to_public(existing, deduped=True)
        raise
    except Exception:
        # 其他提交失败：清理已写入文件避免孤儿，再向上抛
        await session.rollback()
        await _safe_delete(key, thumb_path)
        raise
    await session.refresh(media)
    return _to_public(media, deduped=False)
