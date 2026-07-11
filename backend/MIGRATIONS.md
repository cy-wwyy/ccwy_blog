# 数据库迁移（Alembic）

表结构由 **Alembic** 管理，应用启动**不再自动建表**（`main.py` 只做数据播种 `init_db`）。
测试例外：`tests/conftest.py` 用内存库直接 `create_all`，与迁移无关，不受影响。

## 日常改表流程（开发机）

1. 改 `app/**/models.py` 里的模型
2. 生成迁移脚本：
   ```bash
   uv run alembic revision --autogenerate -m "简述本次变更"
   ```
3. **人工审** `alembic/versions/` 下新脚本——autogenerate 不是万能的，重点核对：
   - 改列名会被误判成「删旧列 + 加新列」（数据丢失），需手改成 `batch_op.alter_column(... new_column_name=...)`
   - 部分索引 / CHECK / 自定义约束的条件是否正确
   - 数据回填（如新非空列）要手写补充
4. 本地验证往返：
   ```bash
   uv run alembic upgrade head
   uv run alembic downgrade -1   # 确认能干净回滚
   uv run alembic upgrade head
   uv run alembic check          # 应输出 No new upgrade operations detected
   ```
5. 提交模型改动 + 迁移脚本（一并入库）

## 部署 / 更新（服务器）

拉代码后、启动应用**之前**执行：

```bash
uv run alembic upgrade head   # 只增量改结构，不动数据
```

首次部署：空库直接 `alembic upgrade head` 建全，再启动应用（`init_db` 播种权限/管理员）。
已有 `create_all` 建出来的旧库要接管：先 `alembic stamp head` 打基线，之后再走正常流程。

## 切换到 PostgreSQL

- 改 `.env` 的数据库配置，`config.py` 的 `SQLALCHEMY_DATABASE_URI` 换成 `postgresql+asyncpg://...`
- 迁移用的 `MIGRATION_DATABASE_URI` 会自动把 `+asyncpg` 换成 `+psycopg`（同步驱动，需装 `psycopg`）
- `env.py` 里 `render_as_batch` 仅对 SQLite 生效，PG 原生支持 ALTER，无需 batch
- 同一套迁移脚本基本通用；如脚本里写死了 SQLite 专属 SQL，切换时需复核

## 备注

- 迁移用**同步**驱动（`MIGRATION_DATABASE_URI`），因为 Alembic 在同步上下文里跑 DDL；应用运行仍用异步 `SQLALCHEMY_DATABASE_URI`
- `alembic/` 目录已在 ruff 中排除（生成脚本沿用模板风格）
