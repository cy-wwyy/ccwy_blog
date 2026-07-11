"""本地文件存储（aiofiles 异步 IO）。"""

import os

import aiofiles

from app.core.config import settings
from app.storage.base import StorageBackend


class LocalStorage(StorageBackend):
    """本地磁盘存储。文件保存在 settings.UPLOAD_DIR 下。"""

    def _full_path(self, key: str) -> str:
        return os.path.join(settings.UPLOAD_DIR, key)

    async def save(self, key: str, data: bytes, mime_type: str) -> None:
        full = self._full_path(key)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        async with aiofiles.open(full, "wb") as f:
            await f.write(data)

    async def get(self, key: str) -> bytes | None:
        full = self._full_path(key)
        if not os.path.exists(full):
            return None
        async with aiofiles.open(full, "rb") as f:
            return await f.read()

    async def delete(self, key: str) -> bool:
        full = self._full_path(key)
        if os.path.exists(full):
            os.remove(full)
            return True
        return False

    async def exists(self, key: str) -> bool:
        return os.path.exists(self._full_path(key))

    def url(self, key: str) -> str:
        return f"/uploads/{key}"
