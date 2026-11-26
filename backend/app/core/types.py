"""跨模块共享的 Pydantic 类型。

`UtcDateTime` 用于**所有对外响应**里的 datetime 字段。

背景：SQLite 没有时区类型，SQLAlchemy 读出来的 datetime 是 naive 的，
Pydantic 默认会把它序列化成不带后缀的 ``"2026-07-14T13:24:41"``。
浏览器 ``new Date(...)`` 会按**本地时区**解析，于是东八区用户看到的时间
整体早 8 小时（晚上的文章会显示成前一天）。

加上这个标注后，naive 值会被补上 UTC 时区，序列化成 ``...Z``，前端解析正确。
"""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BeforeValidator


def ensure_utc(v: object) -> datetime | None:
    """把 naive datetime 视作 UTC；已带时区的原样返回。"""
    if v is None:
        return None
    if isinstance(v, datetime) and v.tzinfo is None:
        return v.replace(tzinfo=UTC)
    return v  # type: ignore[return-value]


UtcDateTime = Annotated[datetime | None, BeforeValidator(ensure_utc)]
