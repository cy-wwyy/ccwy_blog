"""阿里云 OSS 对象存储（oss2 为同步 SDK，经 run_in_executor 异步化）。"""

import asyncio
import logging
from typing import Any

from app.core.config import settings
from app.storage.base import StorageBackend

logger = logging.getLogger(__name__)

# 用 OSS_AVAILABLE 判断而非在调用处 catch ImportError
try:
    import oss2

    OSS_AVAILABLE = True
except ImportError:  # pragma: no cover
    OSS_AVAILABLE = False


class OSSStorage(StorageBackend):
    """阿里云 OSS 存储，所有阻塞的 OSS 调用都扔进线程池执行。"""

    PREFIX = "blog/"  # OSS key 前缀，区分不同应用

    def __init__(self) -> None:
        if not OSS_AVAILABLE:
            raise RuntimeError("oss2 未安装：uv add oss2")
        self._bucket = oss2.Bucket(
            oss2.Auth(settings.OSS_ACCESS_KEY, settings.OSS_ACCESS_SECRET),
            settings.OSS_ENDPOINT,
            settings.OSS_BUCKET,
        )

    @staticmethod
    def _oss_key(key: str) -> str:
        return f"{OSSStorage.PREFIX}{key}"

    # ── 同步方法（在线程池中执行）──

    def _sync_save(self, key: str, data: bytes, mime_type: str) -> None:
        self._bucket.put_object(
            self._oss_key(key), data, headers={"Content-Type": mime_type}
        )

    def _sync_get(self, key: str) -> bytes | None:
        try:
            return self._bucket.get_object(self._oss_key(key)).read()
        except oss2.exceptions.NoSuchKey:
            return None

    def _sync_delete(self, key: str) -> bool:
        try:
            self._bucket.delete_object(self._oss_key(key))
            return True
        except oss2.exceptions.NoSuchKey:
            return False

    def _sync_exists(self, key: str) -> bool:
        return bool(self._bucket.object_exists(self._oss_key(key)))

    # ── 异步包装 ──

    async def _run(self, fn: Any, *args: Any) -> Any:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, fn, *args)

    async def save(self, key: str, data: bytes, mime_type: str) -> None:
        await self._run(self._sync_save, key, data, mime_type)

    async def get(self, key: str) -> bytes | None:
        return await self._run(self._sync_get, key)

    async def delete(self, key: str) -> bool:
        return await self._run(self._sync_delete, key)

    async def exists(self, key: str) -> bool:
        return await self._run(self._sync_exists, key)

    def url(self, key: str) -> str:
        # URL 保持统一 —— 始终走 /uploads/ 代理，不暴露 OSS 地址
        return f"/uploads/{key}"
