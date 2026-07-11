from fastapi import APIRouter

from app.album.admin_router import router as album_admin_router
from app.album.public_router import router as album_public_router
from app.api.login import router as login_router
from app.blog.admin_categories import router as categories_admin_router
from app.blog.admin_router import router as blog_admin_router
from app.blog.admin_tags import router as tags_admin_router
from app.blog.public_router import posts_router as blog_posts_router
from app.blog.public_router import router as blog_public_router
from app.media.admin_router import router as media_admin_router
from app.settings.admin_router import router as settings_admin_router
from app.settings.public_router import router as settings_public_router

api_router = APIRouter()
api_router.include_router(login_router)
api_router.include_router(blog_public_router)
api_router.include_router(blog_posts_router)
api_router.include_router(blog_admin_router)
api_router.include_router(categories_admin_router)
api_router.include_router(tags_admin_router)
api_router.include_router(media_admin_router)
api_router.include_router(album_admin_router)
api_router.include_router(album_public_router)
api_router.include_router(settings_admin_router)
api_router.include_router(settings_public_router)
