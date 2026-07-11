"""为存量媒体补生成缩略图（幂等）。

加缩略图功能之前上传的图片 thumb_path 为空，前台会回退显示原图。
本脚本扫描所有栅格图媒体，缺缩略图的读取原图、生成 webp 缩略图、
双写存储并回填 thumb_path（顺带补 width/height）。可安全重复运行。

用法（在 backend 目录）：uv run python scripts/backfill_thumbnails.py
"""

import asyncio

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.db import engine
from app.core.models import Media
from app.media.admin_router import (
    _THUMBNAILABLE,
    _generate_thumbnail,
    _thumb_key,
)
from app.storage import storage


async def main() -> None:
    done = skipped = 0
    async with AsyncSession(engine) as session:
        medias = (await session.exec(select(Media))).all()
        for m in medias:
            ext = m.path.rsplit(".", 1)[-1].lower() if "." in m.path else ""
            if m.thumb_path or ext not in _THUMBNAILABLE:
                continue

            data = await storage.read(m.path)
            if data is None:
                print(f"  跳过（读不到原图）: {m.path}")
                skipped += 1
                continue

            loop = asyncio.get_running_loop()
            thumb, width, height = await loop.run_in_executor(
                None, _generate_thumbnail, data
            )
            if width and not m.width:
                m.width = width
            if height and not m.height:
                m.height = height
            if thumb is None:
                print(f"  跳过（无法生成）: {m.path}")
                skipped += 1
                session.add(m)  # 仍回填尺寸
                continue

            key = _thumb_key(m.path)
            await storage.save(key, thumb, "image/webp")
            m.thumb_path = key
            session.add(m)
            done += 1
            print(f"  补缩略图: {m.path} -> {key}")

        await session.commit()
    print(f"完成：新增 {done} 张缩略图，跳过 {skipped} 张")


if __name__ == "__main__":
    asyncio.run(main())
