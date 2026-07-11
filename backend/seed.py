"""插入测试数据 — 运行前确保数据库已初始化"""
import asyncio
import sys
from datetime import UTC, datetime, timedelta

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.blog.models import Category, Post, PostTag, Tag
from app.core.db import create_db_and_tables, engine, init_db
from app.core.models import User
from app.core.utils import generate_ulid


async def seed():
    await create_db_and_tables()

    async with AsyncSession(engine) as session:
        await init_db(session)

        author = (
            await session.exec(
                select(User).where(User.email == "admin@ccwy.com")
            )
        ).first()
        if not author:
            print("请先运行应用初始化数据库")
            sys.exit(1)

        # 创建分类
        cats = {}
        for name, slug in [("技术", "tech"), ("生活", "life"), ("开源", "opensource")]:
            c = (
                await session.exec(
                    select(Category).where(Category.slug == slug)
                )
            ).first()
            if not c:
                c = Category(id=generate_ulid(), name=name, slug=slug)
                session.add(c)
                await session.flush()
            cats[slug] = c

        # 创建标签
        tag_names = [
            "Python", "FastAPI", "Next.js", "Tailwind", "shadcn",
            "Docker", "Git", "前端", "后端", "生活",
        ]
        tag_map = {}
        for name in tag_names:
            slug = name.lower().replace(".", "-")
            t = (await session.exec(select(Tag).where(Tag.slug == slug))).first()
            if not t:
                t = Tag(id=generate_ulid(), name=name, slug=slug)
                session.add(t)
                await session.flush()
            tag_map[name] = t

        await session.flush()

        # 文章数据
        posts_data = [
            {
                "title": "使用 FastAPI + SQLModel 搭建后端",
                "slug": "fastapi-sqlmodel-backend",
                "content": "# FastAPI + SQLModel\n\n这是一篇关于如何使用 FastAPI 和 SQLModel 搭建后端服务的文章...",
                "excerpt": "介绍 FastAPI 和 SQLModel 的核心用法",
                "status": "published",
                "category": cats["tech"],
                "tags": [tag_map["Python"], tag_map["FastAPI"], tag_map["后端"]],
                "days_ago": 0,
            },
            {
                "title": "Next.js 16 新特性探索",
                "slug": "nextjs-16-features",
                "content": "# Next.js 16\n\nNext.js 16 带来了许多令人兴奋的新特性...",
                "excerpt": "Next.js 16 的主要更新和实战体验",
                "status": "published",
                "category": cats["tech"],
                "tags": [tag_map["Next.js"], tag_map["前端"]],
                "days_ago": 1,
            },
            {
                "title": "Tailwind CSS v4 与 shadcn/ui 配合使用",
                "slug": "tailwind-v4-shadcn",
                "content": "# Tailwind CSS v4 + shadcn/ui\n\nTailwind CSS v4 的 API 变化...",
                "excerpt": "Tailwind v4 的新 API 和 shadcn/ui 集成",
                "status": "published",
                "category": cats["tech"],
                "tags": [tag_map["Tailwind"], tag_map["shadcn"], tag_map["前端"]],
                "days_ago": 2,
            },
            {
                "title": "Docker 多阶段构建最佳实践",
                "slug": "docker-multi-stage-build",
                "content": "# Docker 多阶段构建\n\n多阶段构建可以大幅减小镜像体积...",
                "excerpt": "如何用多阶段构建优化 Docker 镜像",
                "status": "published",
                "category": cats["tech"],
                "tags": [tag_map["Docker"]],
                "days_ago": 4,
            },
            {
                "title": "Git 工作流：从入门到团队协作",
                "slug": "git-workflow-guide",
                "content": "# Git 工作流\n\nGit 是现代软件开发的基础工具...",
                "excerpt": "Git 分支策略和团队协作规范",
                "status": "published",
                "category": cats["opensource"],
                "tags": [tag_map["Git"]],
                "days_ago": 5,
            },
            {
                "title": "周末徒步日记",
                "slug": "weekend-hiking",
                "content": "# 周末徒步\n\n这个周末去了郊外徒步，天气很好...",
                "excerpt": "记录一次愉快的周末徒步",
                "status": "published",
                "category": cats["life"],
                "tags": [tag_map["生活"]],
                "days_ago": 6,
            },
            {
                "title": "我的 2026 上半年总结",
                "slug": "2026-half-year-review",
                "content": "# 2026 上半年总结\n\n转眼 2026 已经过半...",
                "excerpt": "回顾上半年的工作和生活",
                "status": "published",
                "category": cats["life"],
                "tags": [tag_map["生活"]],
                "days_ago": 7,
            },
            {
                "title": "Python 异步编程深入理解",
                "slug": "python-async-deep",
                "content": "# Python 异步编程\n\nasync/await 是 Python 异步的核心...",
                "excerpt": "深入理解 Python asyncio",
                "status": "published",
                "category": cats["tech"],
                "tags": [tag_map["Python"], tag_map["后端"]],
                "days_ago": 8,
            },
            {
                "title": "博客搭建记录（草稿）",
                "slug": "blog-setup-draft",
                "content": "# 博客搭建\n\n记录这个博客从零开始搭建的全过程...",
                "excerpt": "博客搭建过程记录",
                "status": "draft",
                "category": cats["tech"],
                "tags": [tag_map["FastAPI"], tag_map["Next.js"]],
                "days_ago": 1,
            },
            {
                "title": "前端性能优化 checklist",
                "slug": "frontend-perf-checklist",
                "content": "# 前端性能优化\n\n一些常用的前端性能优化技巧...",
                "excerpt": "前端性能优化的实用清单",
                "status": "draft",
                "category": cats["tech"],
                "tags": [tag_map["前端"], tag_map["Next.js"]],
                "days_ago": 0,
            },
        ]

        now = datetime.now(UTC)
        for i, data in enumerate(posts_data):
            existing = (
                await session.exec(
                    select(Post).where(Post.slug == data["slug"])
                )
            ).first()
            if existing:
                continue

            days_ago = data["days_ago"]
            created = now - timedelta(days=days_ago, hours=i)
            published = created if data["status"] == "published" else None

            post = Post(
                id=generate_ulid(),
                title=data["title"],
                slug=data["slug"],
                content=data["content"],
                excerpt=data["excerpt"],
                status=data["status"],
                author_id=author.id,
                category_id=data["category"].id,
                published_at=published,
                created_at=created,
                updated_at=created,
            )
            session.add(post)
            await session.flush()

            for tag in data["tags"]:
                pt = (
                    await session.exec(
                        select(PostTag).where(
                            PostTag.post_id == post.id,
                            PostTag.tag_id == tag.id,
                        )
                    )
                ).first()
                if not pt:
                    session.add(PostTag(post_id=post.id, tag_id=tag.id))

        await session.commit()
        print(f"插入完成！{len(posts_data)} 篇文章，{len(tag_names)} 个标签，{len(cats)} 个分类")


if __name__ == "__main__":
    asyncio.run(seed())

