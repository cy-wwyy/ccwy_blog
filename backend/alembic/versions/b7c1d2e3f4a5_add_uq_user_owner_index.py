"""enforce single owner: add uq_user_owner partial unique index

Revision ID: b7c1d2e3f4a5
Revises: d73fdccb226f
Create Date: 2026-11-26

背景：``User.__table_args__`` 里早就声明了 ``uq_user_owner``（部分唯一索引，
只约束 ``is_owner = 1`` 的行），但历史迁移从来没创建过它。结果是从迁移脚本
全新部署的库没有这条约束，而线上库是通过 ``create_all`` / 手工方式才有 ——
schema 漂移。

这个迁移负责补齐。因为线上库可能已经存在该索引，upgrade 里做了存在性判断，
重复执行不会报错。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c1d2e3f4a5"
down_revision: str | None = "d73fdccb226f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "user"
INDEX = "uq_user_owner"
PREDICATE = "is_owner = 1"


def _index_exists() -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return INDEX in {ix["name"] for ix in inspector.get_indexes(TABLE)}


def upgrade() -> None:
    if _index_exists():
        return

    op.create_index(
        INDEX,
        TABLE,
        ["is_owner"],
        unique=True,
        sqlite_where=sa.text(PREDICATE),
        postgresql_where=sa.text("is_owner = true"),
    )


def downgrade() -> None:
    if not _index_exists():
        return
    op.drop_index(INDEX, table_name=TABLE)
