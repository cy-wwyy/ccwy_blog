from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from alembic import context

# 导入全部模型模块，填充 SQLModel.metadata（autogenerate 依赖它对比 schema）。
# 缺任何一个模块都会让 Alembic 误判其表“需要删除”。
import app.album.models  # noqa: F401
import app.blog.models  # noqa: F401
import app.core.models  # noqa: F401
import app.settings.models  # noqa: F401
import app.stats.models  # noqa: F401
from app.core.config import settings

config = context.config

# 迁移用同步 URL 从应用配置注入，避免 alembic.ini 与 .env 两处维护。
config.set_main_option("sqlalchemy.url", settings.MIGRATION_DATABASE_URI)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata

# SQLite 不支持多数 ALTER，需 batch 模式（建新表→拷数据→改名）才能改/删列、加约束。
# PostgreSQL 原生支持，无需 batch。
_render_as_batch = settings.MIGRATION_DATABASE_URI.startswith("sqlite")


def run_migrations_offline() -> None:
    """离线模式：只用 URL 生成 SQL，不连库。"""
    context.configure(
        url=settings.MIGRATION_DATABASE_URI,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=_render_as_batch,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：连库执行迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=_render_as_batch,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
