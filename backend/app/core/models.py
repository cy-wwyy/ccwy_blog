from datetime import datetime

from pydantic import EmailStr
from sqlalchemy import DateTime, Index, text
from sqlmodel import Field, Relationship, SQLModel

from app.core.utils import generate_ulid, get_datetime_utc

# ── User 表（认证 + 博主资料）─────────────────────────


class User(SQLModel, table=True):
    # 博主标识全站唯一：部分唯一索引仅约束 is_owner 为真的行，
    # 允许任意多个非博主用户（SQLite 与 PostgreSQL 均支持部分索引）。
    __table_args__ = (
        Index(
            "uq_user_owner",
            "is_owner",
            unique=True,
            sqlite_where=text("is_owner = 1"),
            postgresql_where=text("is_owner = true"),
        ),
    )

    id: str = Field(default_factory=generate_ulid, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=64)
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    hashed_password: str
    avatar: str | None = Field(default=None, max_length=512)
    bio: str | None = Field(default=None, max_length=1024)
    # 博主展示资料（原 Profile 表并入）
    display_name: str | None = Field(default=None, max_length=64)
    github: str | None = Field(default=None, max_length=256)
    website: str | None = Field(default=None, max_length=256)
    # 博主标识：全站唯一，标记谁是站点博主
    is_owner: bool = Field(default=False)
    is_active: bool = True
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    # 关系
    user_roles: list["UserRole"] = Relationship(back_populates="user")


# ── Media 表（共享媒体文件）────────────────────────────


class Media(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    filename: str = Field(max_length=256)
    path: str = Field(max_length=512)
    mime_type: str = Field(max_length=128)
    size: int
    # 文件内容的 SHA-256（十六进制 64 位），用于内容级去重，唯一约束
    content_hash: str = Field(unique=True, index=True, max_length=64)
    width: int | None = None
    height: int | None = None
    # 缩略图存储路径（栅格图上传时生成的 webp 小图），非图/生成失败则为空
    thumb_path: str | None = Field(default=None, max_length=512)
    module: str = Field(max_length=64)
    module_id: str | None = None
    synced_to_oss: bool = Field(default=False)
    uploaded_by: str = Field(foreign_key="user.id")
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    uploader: User = Relationship()


# ── 权限 & 角色 ──────────────────────────────────────


class Permission(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    code: str = Field(unique=True, max_length=64)
    name: str = Field(max_length=128)

    role_permissions: list["RolePermission"] = Relationship(back_populates="permission")


class Role(SQLModel, table=True):
    id: str = Field(default_factory=generate_ulid, primary_key=True)
    name: str = Field(unique=True, max_length=64)

    role_permissions: list["RolePermission"] = Relationship(back_populates="role")
    user_roles: list["UserRole"] = Relationship(back_populates="role")


class RolePermission(SQLModel, table=True):
    role_id: str = Field(foreign_key="role.id", primary_key=True)
    permission_id: str = Field(foreign_key="permission.id", primary_key=True)

    role: Role = Relationship(back_populates="role_permissions")
    permission: Permission = Relationship(back_populates="role_permissions")


class UserRole(SQLModel, table=True):
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    role_id: str = Field(foreign_key="role.id", primary_key=True)

    user: User = Relationship(back_populates="user_roles")
    role: Role = Relationship(back_populates="user_roles")


# ── User Schemas ─────────────────────────────────────


class UserPublic(SQLModel):
    id: str
    username: str
    email: EmailStr
    avatar: str | None = None
    bio: str | None = None


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    sub: str


class Message(SQLModel):
    message: str
