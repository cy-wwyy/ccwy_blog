"""存储后端抽象基类。"""

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """文件存储后端接口。key 为相对路径，如 2026/07/abc.png。"""

    @abstractmethod
    async def save(self, key: str, data: bytes, mime_type: str) -> None:
        """保存文件。"""
        ...

    @abstractmethod
    async def get(self, key: str) -> bytes | None:
        """读取文件内容，不存在返回 None。"""
        ...

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """删除文件。返回 True 表示已删除，False 表示文件不存在。"""
        ...

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """检查文件是否存在。"""
        ...

    @abstractmethod
    def url(self, key: str) -> str:
        """返回文件的对外访问 URL。"""
        ...
