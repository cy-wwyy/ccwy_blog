# ccwy_blog

一个前后端分离的个人博客系统。后端基于 **FastAPI + SQLModel**(全异步),前端基于 **Next.js 16 + React 19**,支持 Markdown 写作、相册、媒体管理,以及本地 + 阿里云 OSS 双写存储。

## ✨ 功能特性

- **博客文章** —— Markdown 编辑（vditor），支持分类与标签
- **相册管理** —— 图片分组，拖拽排序（dnd-kit）
- **媒体库** —— 图片上传，服务端用 Pillow 处理
- **认证与后台** —— JWT 登录（PyJWT + argon2 密码哈希），独立管理后台
- **混合存储** —— 图片本地 + 阿里云 OSS 双写，本地优先读，本地缺失时从 OSS 回源并回填
- **明暗主题** —— next-themes 主题切换
- **全异步后端** —— aiosqlite 异步驱动，启动自动建表并创建初始管理员

## 🧱 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.14 · FastAPI · SQLModel · Pydantic v2 · SQLite(aiosqlite) · PyJWT · oss2 · Pillow · uv |
| 前端 | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · react-hook-form + zod · framer-motion |
| 工具 | 后端 ruff / mypy / pytest；前端 eslint |

## 📁 项目结构

```
ccwy_blog/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── api/            # 路由聚合 + 登录
│   │   ├── blog/           # 文章 / 分类 / 标签
│   │   ├── album/          # 相册
│   │   ├── media/          # 媒体上传
│   │   ├── storage/        # 存储抽象：本地 + OSS
│   │   ├── core/           # 配置、数据库、安全、依赖
│   │   └── main.py         # 应用入口
│   ├── seed.py             # 初始化 / 演示数据
│   └── pyproject.toml
└── frontend/               # Next.js 前端
    └── src/
        ├── app/            # 路由：(site) 站点 / admin 后台 / login
        ├── components/     # 组件（ui / admin / site / editor / auth）
        ├── hooks/
        └── lib/
```

## 🚀 快速开始

> 前置要求：Python 3.14+、[uv](https://docs.astral.sh/uv/)、Node.js 20+

前后端命令分别在各自子目录中运行。

### 后端（端口 8080）

```bash
cd backend
uv sync                                       # 安装依赖
cp .env.example .env                          # 配置环境变量（见下）
uv run fastapi dev app/main.py --port 8080    # 启动开发服务器
```

- API 前缀：`/api/v1`
- 交互式文档：http://localhost:8080/docs
- 首次启动会自动建表，并按 `.env` 中的 `FIRST_SUPERUSER` 创建初始管理员

### 前端（端口 3000）

```bash
cd frontend
npm install
npm run dev                                   # http://localhost:3000
```

前端通过 `next.config` 把 `/api` 与 `/uploads` 反向代理到后端（默认 `http://localhost:8080`，可用 `BACKEND_URL` 覆盖），因此本地开发直接访问 http://localhost:3000 即可。

## ⚙️ 环境变量

复制 `backend/.env.example` 为 `backend/.env` 并按需填写：

| 变量 | 说明 |
|------|------|
| `SECRET_KEY` | JWT 签名密钥，生产环境务必改为随机长字符串 |
| `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD` | 初始管理员账号 / 密码 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 令牌有效期（分钟） |
| `UPLOAD_DIR` / `MAX_UPLOAD_SIZE_MB` | 本地上传目录 / 单文件大小上限 |
| `OSS_ENDPOINT` / `OSS_BUCKET` / `OSS_ACCESS_KEY` / `OSS_ACCESS_SECRET` | 阿里云 OSS 配置，**留空则仅使用本地存储** |

> ⚠️ `.env` 含真实密钥，已被 `.gitignore` 排除，请勿提交。

前端可选环境变量（`frontend/.env.local`）：`BACKEND_URL`（后端地址）、`ALLOWED_DEV_ORIGINS`（局域网 IP 访问开发服务器时需配置）。

## 🧪 开发

```bash
# 后端（在 backend/ 下）
uv run pytest          # 测试
uv run ruff check .    # 代码检查
uv run mypy .          # 类型检查

# 前端（在 frontend/ 下）
npm run lint
npm run build          # 生产构建
```
