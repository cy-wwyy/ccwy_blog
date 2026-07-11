import mimetypes
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.routing import APIRoute
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.main import api_router
from app.core.config import settings
from app.core.db import engine, init_db
from app.storage import storage


def custom_generate_unique_id(route: APIRoute) -> str:
    tag = route.tags[0] if route.tags else "api"
    return f"{tag}-{route.name}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 表结构由 Alembic 管理（部署/启动前先 `alembic upgrade head`），
    # 应用启动只负责播种初始数据（权限/角色/管理员，幂等）。
    async with AsyncSession(engine) as session:
        await init_db(session)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

# CORS — 本地开发放开所有来源，staging/production 仅允许白名单
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

# 上传文件访问 —— 本地优先，本地缺失则从 OSS 回源（storage.read 会顺带回填本地）
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
_UPLOAD_BASE = os.path.realpath(settings.UPLOAD_DIR)
# 文件名随机(uuid)且内容去重，内容不可变 → 长缓存
_CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}


@app.get("/uploads/{file_path:path}")
async def serve_upload(file_path: str) -> Response:
    target = os.path.realpath(os.path.join(_UPLOAD_BASE, file_path))
    # 防路径穿越：解析后必须仍在 uploads 目录内
    if target != _UPLOAD_BASE and not target.startswith(_UPLOAD_BASE + os.sep):
        raise HTTPException(status_code=404)

    # 本地存在 → 高效流式返回
    if os.path.isfile(target):
        return FileResponse(target, headers=_CACHE_HEADERS)

    # 本地缺失 → OSS 回源（storage.read 命中后会回填本地）
    data = await storage.read(file_path)
    if data is None:
        raise HTTPException(status_code=404)
    media_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    return Response(content=data, media_type=media_type, headers=_CACHE_HEADERS)
