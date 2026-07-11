from typing import Annotated, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    computed_field,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors(v: object) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    # 必填，从环境读取 — 保证多 worker / 重启后签名密钥稳定
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    # 允许跨域的来源（逗号分隔）。非 local 环境必须显式配置，禁止通配符 *
    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    PROJECT_NAME: str
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str

    # 数据库 — 先 SQLite（异步驱动 aiosqlite），后续切 PostgreSQL 改这里
    # （postgresql+asyncpg://user:pass@host/db）
    SQLITE_DB: str = "ccwy_blog.db"

    # ── 上传 ──
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # ── OSS（可选，留空则不启用；配置后本地+OSS 双写、本地优先读）──
    OSS_ENDPOINT: str = ""
    OSS_BUCKET: str = ""
    OSS_ACCESS_KEY: str = ""
    OSS_ACCESS_SECRET: str = ""

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"sqlite+aiosqlite:///{self.SQLITE_DB}"

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        """本地开发放开所有来源；其余环境仅允许显式配置的白名单"""
        if self.ENVIRONMENT == "local":
            return ["*"]
        return [str(o).rstrip("/") for o in self.BACKEND_CORS_ORIGINS]


settings = Settings()  # type: ignore
