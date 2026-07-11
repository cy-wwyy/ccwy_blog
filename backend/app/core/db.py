from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.core.security import get_password_hash

connect_args = {"check_same_thread": False}
engine = create_async_engine(
    settings.SQLALCHEMY_DATABASE_URI, connect_args=connect_args
)


# SQLite 默认关闭外键约束，需每次连接显式开启，否则模型里声明的
# foreign_key / ondelete 级联在数据库层完全不生效。
# 异步引擎需把事件监听挂在底层的 sync_engine 上。
if settings.SQLALCHEMY_DATABASE_URI.startswith("sqlite"):

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# 导入所有模块的模型
import app.album.models  # noqa: E402, F401
import app.blog.models  # noqa: E402, F401
import app.core.models  # noqa: E402, F401
import app.settings.models  # noqa: E402, F401
import app.stats.models  # noqa: E402, F401


async def create_db_and_tables() -> None:
    """建表——异步引擎需通过 run_sync 调用同步的 metadata.create_all。"""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def init_db(session: AsyncSession) -> None:
    """初始化数据库：创建管理员账户、角色、权限"""
    from app.core.models import (
        Permission,
        Role,
        RolePermission,
        User,
        UserRole,
    )

    # ── 1. 创建权限 ──
    default_permissions = {
        "posts:create": "创建文章",
        "posts:read": "查看文章",
        "posts:update": "编辑文章",
        "posts:delete": "删除文章",
        "comments:create": "创建评论",
        "comments:moderate": "管理评论",
        "media:manage": "管理媒体",
        "album:manage": "管理相册",
        "users:manage": "管理用户",
        "settings:manage": "管理站点设置",
    }
    perm_map: dict[str, Permission] = {}
    for code, name in default_permissions.items():
        perm = (
            await session.exec(select(Permission).where(Permission.code == code))
        ).first()
        if not perm:
            perm = Permission(code=code, name=name)
            session.add(perm)
            await session.flush()
        perm_map[code] = perm

    # ── 2. 创建角色 ──
    async def get_or_create_role(name: str) -> Role:
        role = (
            await session.exec(select(Role).where(Role.name == name))
        ).first()
        if not role:
            role = Role(name=name)
            session.add(role)
            await session.flush()
        return role

    admin_role = await get_or_create_role("admin")
    reader_role = await get_or_create_role("reader")

    # ── 3. 角色绑定权限 ──
    # admin 拥有全部权限
    existing_rp = (
        await session.exec(
            select(RolePermission.role_id, RolePermission.permission_id)
        )
    ).all()
    existing_rp_set = set(existing_rp)

    for perm in perm_map.values():
        if (admin_role.id, perm.id) not in existing_rp_set:
            session.add(RolePermission(role_id=admin_role.id, permission_id=perm.id))

    # reader 只有创建评论
    reader_perms = ["comments:create"]
    for code in reader_perms:
        perm = perm_map[code]
        if (reader_role.id, perm.id) not in existing_rp_set:
            session.add(
                RolePermission(role_id=reader_role.id, permission_id=perm.id)
            )

    await session.flush()

    # ── 4. 创建管理员账户 ──
    user = (
        await session.exec(
            select(User).where(User.email == settings.FIRST_SUPERUSER)
        )
    ).first()
    if not user:
        user = User(
            username=settings.FIRST_SUPERUSER.split("@")[0],
            email=settings.FIRST_SUPERUSER,
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            display_name=settings.FIRST_SUPERUSER.split("@")[0],
            is_owner=True,
        )
        session.add(user)
        await session.flush()

        # 赋予 admin 角色
        session.add(UserRole(user_id=user.id, role_id=admin_role.id))

    # ── 5. 给已存在的管理员补角色（数据修复） ──
    existing_ur = (
        await session.exec(
            select(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.role_id == admin_role.id,
            )
        )
    ).first()
    if not existing_ur:
        session.add(UserRole(user_id=user.id, role_id=admin_role.id))

    # 数据修复：确保初始管理员被标记为博主
    if not user.is_owner:
        user.is_owner = True
        session.add(user)

    await session.commit()
