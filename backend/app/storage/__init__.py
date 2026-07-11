"""存储模块统一入口。

本地存储始终启用；OSS 仅当配置了 OSS_ENDPOINT + OSS_BUCKET 时启用。
写入双写（本地 + 可选 OSS），读取本地优先、OSS 回源。

    from app.storage import storage
    synced = await storage.save(key, data, mime)
    data = await storage.read(key)
    url = storage.url(key)
"""

import logging

from app.core.config import settings
from app.storage.local import LocalStorage
from app.storage.oss import OSSStorage

logger = logging.getLogger(__name__)

_local = LocalStorage()
_oss: OSSStorage | None = None

if settings.OSS_ENDPOINT and settings.OSS_BUCKET:
    try:
        _oss = OSSStorage()
        logger.info("OSS storage enabled: bucket=%s", settings.OSS_BUCKET)
    except Exception as e:
        logger.warning("OSS storage init failed, falling back to local-only: %s", e)
        _oss = None


class Storage:
    """组合存储：本地 + 可选 OSS。"""

    @property
    def oss_enabled(self) -> bool:
        return _oss is not None

    async def save(self, key: str, data: bytes, mime_type: str) -> bool:
        """保存到本地 + 可选 OSS。返回是否已同步到 OSS。"""
        await _local.save(key, data, mime_type)
        if _oss:
            try:
                await _oss.save(key, data, mime_type)
                return True
            except Exception as e:
                logger.error("OSS save failed for %s: %s", key, e)
        return False

    async def read(self, key: str) -> bytes | None:
        """读取文件：本地优先 → OSS 回源。"""
        data = await _local.get(key)
        if data is not None:
            return data
        if _oss:
            logger.info("Local miss for %s, fetching from OSS", key)
            data = await _oss.get(key)
            if data is not None:
                try:
                    await _local.save(key, data, "application/octet-stream")
                except Exception as e:
                    logger.warning("Failed to restore %s to local: %s", key, e)
                return data
        return None

    async def delete(self, key: str) -> None:
        """双删：本地 + OSS（有则删，不存在跳过）。"""
        await _local.delete(key)
        if _oss:
            try:
                await _oss.delete(key)
            except Exception as e:
                logger.error("OSS delete failed for %s: %s", key, e)

    def url(self, key: str) -> str:
        """返回统一 URL（始终 /uploads/...，不暴露 OSS 地址）。"""
        return _local.url(key)


storage = Storage()
