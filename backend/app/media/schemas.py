from datetime import datetime

from sqlmodel import SQLModel


class MediaPublic(SQLModel):
    """上传/列表返回的媒体信息。url 由 storage 统一生成（/uploads/...）。"""

    id: str
    filename: str
    url: str
    mime_type: str
    size: int
    module: str
    synced_to_oss: bool = False
    # 是否命中去重（true=返回的是已存在的同内容文件）
    deduped: bool = False
    created_at: datetime | None = None
