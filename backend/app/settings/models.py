from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel

from app.core.utils import get_datetime_utc

# ── SiteSetting 表（站点设置，键值存储）──────────────────
# 键值表：新增设置项只需加 key，不用改表结构（本项目 create_all 不做 ALTER）。


class SiteSetting(SQLModel, table=True):
    key: str = Field(primary_key=True, max_length=64)
    value: str = Field(default="", max_length=2048)
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# 站点设置已知键与默认值（site_title 默认取 PROJECT_NAME，在 crud 里注入）
SITE_KEYS: tuple[str, ...] = ("site_title", "site_subtitle", "footer_text", "icp")


# ── 博主设置 Schemas（读写 User 表）───────────────────


class ProfileRead(SQLModel):
    display_name: str = ""
    avatar: str | None = None
    bio: str | None = None
    github: str | None = None
    website: str | None = None
    is_owner: bool = False


class ProfileUpdate(SQLModel):
    display_name: str | None = Field(default=None, max_length=64)
    avatar: str | None = Field(default=None, max_length=512)
    bio: str | None = Field(default=None, max_length=1024)
    github: str | None = Field(default=None, max_length=256)
    website: str | None = Field(default=None, max_length=256)


# ── 网页设置 Schemas ─────────────────────────────────


class SiteSettingsRead(SQLModel):
    site_title: str = ""
    site_subtitle: str = ""
    footer_text: str = ""
    icp: str = ""


class SiteSettingsUpdate(SQLModel):
    site_title: str | None = Field(default=None, max_length=128)
    site_subtitle: str | None = Field(default=None, max_length=256)
    footer_text: str | None = Field(default=None, max_length=256)
    icp: str | None = Field(default=None, max_length=128)


# ── 公开视图（前台消费：站点信息 + 博主公开信息）──────────


class PublicAuthor(SQLModel):
    display_name: str = ""
    bio: str | None = None
    avatar: str | None = None
    github: str | None = None
    website: str | None = None


class PublicSiteInfo(SiteSettingsRead):
    author: PublicAuthor
