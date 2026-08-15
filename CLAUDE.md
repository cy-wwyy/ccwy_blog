# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

前后端分离的个人博客系统。后端 FastAPI + SQLModel（全异步），前端 Next.js 16 + React 19 + Tailwind CSS v4 + shadcn/ui（Base UI 预设）。

## 关键约束：命令在子目录运行

前后端命令**必须在各自子目录执行**，绝不在项目根运行。

```bash
# 后端（backend/ 下）
cd backend
uv sync                    # 安装依赖
uv run fastapi dev app/main.py --port 8080
uv run pytest              # 测试
uv run ruff check .        # lint
uv run mypy .              # 类型检查

# 前端（frontend/ 下）
cd frontend
npm install
npm run dev                # http://localhost:3000
npm run lint
npm run build
```

前端通过 `next.config.ts` 把 `/api` 与 `/uploads` 反向代理到后端（默认 `http://localhost:8080`），本地开发直接访问 `localhost:3000`。

## 架构总览

```
backend/app/
├── main.py              # FastAPI 入口，CORS、lifespan、/uploads 回源端点
├── api/                 # 路由聚合 (api/main.py) + 登录 (login.py)
├── core/                # config.py(Settings) db.py(engine/init_db) deps.py(认证/鉴权) models.py(User/Permission/Role) security.py(JWT+argon2)
├── blog/                # Post/Category/Tag — models/crud/helpers + admin_router + public_router
├── album/               # Album/AlbumPhoto — models/crud/helpers + admin + public
├── media/               # 媒体上传，admin_router 复用 storage 层
├── settings/            # SiteSetting(KV表) + 博主资料(读写User表) — models/crud + admin + public
├── stats/               # PageView 事件表，埋点去重 + 浏览量/访客量聚合
├── storage/             # 抽象基类 + Local + OSS 实现（本地优先读，OSS 回源回填）
├── ai/                  # OpenAI 兼容 LLM 客户端（slug 生成 + 行程推荐），配置从 SiteSetting 读（非 .env），运行时热修改
├── trip/                # 行程记录：Trip/TripPoint/TripPointMedia — 高德地图集成 + admin + public + ai_tasks（异步推荐）
├── tools/               # TOTP 2FA 工具
```

**后端核心模式**：
- **全异步**：`async def` 路由 + `AsyncSession` + `await` 所有 DB 操作。`session.add()` 不同步 await，`session.exec()` 要先 await 再取值。
- **RBAC 鉴权**：User → UserRole → Role → RolePermission → Permission。`require_permission(code)` 返回 Depends。路由通过 `_current_user: User = Depends(require_permission("posts:create"))` 保护。
- **存储双写**：上传同时写本地 + OSS（可选），读取本地优先，本地缺失从 OSS 回源并回填本地。`main.py` 的 `/uploads/{path}` 端点封装此逻辑。
- **AI 配置**：不走 `.env`，从 `SiteSetting` KV 表读取（`ai_enabled/api_base/api_key/model/reasoning_effort/extra_body`），支持运行时热修改。⚠️ `init_db` 不播种 SiteSetting，库重建会静默丢 AI key（表现为 slug 生成/推荐报「AI 未启用」）。
- **行程记录点**：`Trip` 一对多 `TripPoint`（`point_type` 为 `Literal`，含 `camping`/`rest`/`viewpoint`/`pass` 等）。`trip/helpers.py` 封装高德地图 Web API——地理编码/逆地理编码/驾车路径规划，路线结果缓存在 `TripPoint.polyline_to_next`/`distance_to_next`（米），供前端直接渲染。
- **AI 行程推荐**：创建记录点（非 `waypoint`）后 `BackgroundTasks` 触发 `trip/ai_tasks.py` 异步生成下一程推荐，结果存 `TripPoint.ai_rec`（JSON）+ `ai_rec_status`（none/pending/ready/failed）。流程 = 高德周边搜索候选 POI → LLM（`ai/client.py` 的 `generate_recommendation`）按偏好决策，输出 `next_stop` + `detours`。两处质量保证：从最近两点坐标算方位角注入 prompt（避免推荐身后已走过的地方），`next_stop` 用 geocode + driving_route 实测距离替换 LLM 估值。行程规划字段（`trip_mode/route_plan/interest_tags/preferences`）存 `Trip` 表，仅后台可见（前台公开不暴露）。

```
frontend/src/
├── app/
│   ├── layout.tsx        # 根布局，theme-init script（防闪烁）
│   ├── providers.tsx      # ThemeProvider → TooltipProvider → AuthProvider → Toaster
│   ├── (site)/           # 公开站点：首页/博客/相册/行程/关于/项目，layout 含侧栏+右栏+顶栏
│   ├── trips/[slug]/     # 行程详情页（全屏高德地图渲染记录点 + polyline）
│   ├── admin/            # 后台：仪表盘/文章CRUD/分类/标签/相册/媒体/设置/工具/行程
│   └── login/            # 登录页
├── components/
│   ├── ui/               # shadcn/ui 组件（Base UI 底层）
│   ├── admin/            # AuthGuard、AdminLayout、AdminSidebar、PostForm、SlugInput 等
│   ├── site/             # SiteSidebar、SiteRightAside、PostCard、TopToolbar 等
│   ├── editor/           # md-editor（vditor 封装）、vditor-preview
│   └── auth/             # login-form
├── hooks/                # use-auth（AuthContext：token/用户状态/登录/登出/401兜底）
├── types/                # 第三方类型声明（amap.d.ts 高德 JS API）
└── lib/                  # api.ts（统一 request() + ApiError + 所有API函数）、constants.ts、utils.ts
```

**前端核心模式**：
- **API 层**：`lib/api.ts` 的 `request<T>()` 统一封装——非 2xx 抛 `ApiError(status, detail)`，401/403 触发全局 `unauthorizedHandler` 清会话跳登录。
- **认证流**：`AuthProvider` 挂载时从 localStorage 恢复 token → `getMe()` 验证 → 注册 401 兜底。`AuthGuard` 包裹所有 admin 页面。
- **表单**：全站统一 react-hook-form + zod（login、post、分类/标签、设置）。
- **访问统计**：前端渲染时 `trackView(kind, slug?)` → `POST /track`（fire-and-forget），后端半小时去重。
- **AI 推荐 UI**：后台行程详情页记录点表格有「AI 推荐」列，图标按 `ai_rec_status` 显示（pending 转圈 / ready ✨ 点击弹窗 / failed 红叹号），存在 pending 点时每 5s 静默轮询刷新。

## 数据库：Alembic 迁移

表结构由 Alembic 管理，`main.py` 启动**不再 create_all**（仅 `init_db` 播种权限/角色/管理员）。改表流程：

1. 改 `app/**/models.py`
2. `uv run alembic revision --autogenerate -m "描述"`
3. **人工审**新迁移脚本（autogenerate 可能把改列名误判为删+加）
4. `uv run alembic upgrade head` 验证
5. 模型改动 + 迁移脚本一并提交

部署：服务器拉代码后 `uv run alembic upgrade head`。测试用 `conftest.py` 内存库直接 `create_all`，与迁移无关。

## 关键陷阱与约定

### ruff: 禁止 autofix UP037
`app/blog/models.py`、`app/core/models.py` 有 `UP037` 告警（去除类型注解引号）。**切勿 `ruff check --fix`**：这些是 SQLModel `Relationship` 的前向引用（如 `Optional["Category"]`），去掉引号会 `NameError`。

### eslint 基线不干净
`react-hooks/set-state-in-effect` 在多处报 error（含未改动的 `use-mobile.ts`、`admin-sidebar.tsx`），属全项目基线。Next 16 build 不内置 ESLint 门禁，真正门禁是 `tsc --noEmit` + `next build`。

### Base UI: Button 渲染成 Link
`<Button render={<Link href={...} />}>` 必须加 `nativeButton={false}`，否则控制台报错。参照 `pagination.tsx`。

### 异步 DB：禁止隐式关系懒加载
async 下 `obj.some_relationship` 会抛错。需要关联数据用显式 `select().join()` 或 `selectinload` 预加载。

### 用户字段位置
`Profile` 表已删除，博主资料字段已并入 `User`。`User.is_owner` 唯一标识博主（部分唯一索引保证）。新增用户字段一律加在 `User`，网页级设置走 `SiteSetting` KV 表。

### Next.js 16 注意事项
此版本有 breaking changes。写前端代码前先读 `frontend/node_modules/next/dist/docs/` 中的相关指南。

### shadcn/ui 组件文档
```bash
cd frontend && npx shadcn@latest docs <component-name>  # 获取组件的 docs/examples/api 链接
```

### 环境变量
- 后端：`backend/.env`（从 `.env.example` 复制），含 `SECRET_KEY`、管理员账号、OSS 配置、`AMAP_WEB_KEY`（高德地图，行程模块用）等
- 前端：`frontend/.env.local` 可选设 `BACKEND_URL`、`ALLOWED_DEV_ORIGINS`
