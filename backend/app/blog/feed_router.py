"""RSS 2.0 订阅源。

RSS（Really Simple Syndication）是一种 XML 格式，让阅读器 / 播客客户端
能「订阅」站点更新：读者把 https://你的站点/feed 加进 Feedly、Inoreader、
NetNewsWire 之类的阅读器，你发新文章时阅读器会自动拉到新条目，
读者不用反复打开网站。

这里只输出**已发布且公开**的文章，按发布时间倒序，最多 30 条。
"""

import re
from datetime import UTC, datetime
from email.utils import format_datetime
from xml.sax.saxutils import escape

from fastapi import APIRouter, Request, Response

from app.blog import crud
from app.core.config import settings
from app.core.deps import SessionDep

router = APIRouter(tags=["feed"])

MAX_ITEMS = 30
MAX_DESCRIPTION = 320

# 极简 markdown / HTML 清理：RSS 里的 description 只需要纯文本摘要
_MD_PATTERNS = [
    (re.compile(r"```.*?```", re.S), " "),          # 代码块
    (re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "),     # 图片
    (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"),  # 链接保留文字
    (re.compile(r"<[^>]+>"), " "),                  # HTML 标签
    (re.compile(r"^[#>\-\*\+]+\s*", re.M), ""),     # 标题/引用/列表符号
    (re.compile(r"[*_`~]+"), ""),                   # 强调符号
]


def _plain(text: str) -> str:
    for pattern, repl in _MD_PATTERNS:
        text = pattern.sub(repl, text)
    return re.sub(r"\s+", " ", text).strip()


def _truncate(text: str, limit: int = MAX_DESCRIPTION) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _site_base(request: Request) -> str:
    """站点根地址。

    生产环境走 Nginx 反代，`request.base_url` 可能是内网地址，
    所以优先用反向代理透传的 Host / X-Forwarded-*，保证 RSS 里的链接可点。
    """
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    )
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{scheme}://{host}".rstrip("/")


def _rfc822(dt: datetime | None) -> str:
    """RSS 的 pubDate 必须是 RFC 822 格式（如 Tue, 14 Jul 2026 13:24:41 +0000）。"""
    value = dt or datetime.now(UTC)
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return format_datetime(value.astimezone(UTC), usegmt=True)


@router.get("/feed")
async def rss_feed(request: Request, session: SessionDep) -> Response:
    items, _ = await crud.list_posts(
        session=session,
        skip=0,
        limit=MAX_ITEMS,
        status="published",
        is_public=True,
        sort_by="published_at",
        sort_order="desc",
    )

    base = _site_base(request)
    site_title = settings.PROJECT_NAME
    site_desc = ""
    try:
        # 站点标题/副标题来自后台「网页设置」，取不到就退回默认值
        site_conf = await _load_site_settings(session)
        site_title = site_conf.get("site_title") or site_title
        site_desc = site_conf.get("site_subtitle") or site_conf.get("footer_text") or ""
    except Exception:  # noqa: BLE001 - 配置缺失不应导致订阅源 500
        pass

    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{escape(site_title)}</title>",
        f"    <link>{escape(base)}</link>",
        f"    <description>{escape(site_desc or site_title)}</description>",
        "    <language>zh-CN</language>",
        f"    <lastBuildDate>{_rfc822(None)}</lastBuildDate>",
        "    <generator>ccwy_blog</generator>",
        '    <atom:link href="'
        + escape(f"{base}/feed")
        + '" rel="self" type="application/rss+xml" />',
    ]

    for post in items:
        link = f"{base}/blog/{post.slug}"
        summary = _truncate(_plain(post.excerpt or post.content or ""))
        lines += [
            "    <item>",
            f"      <title>{escape(post.title)}</title>",
            f"      <link>{escape(link)}</link>",
            f'      <guid isPermaLink="true">{escape(link)}</guid>',
            f"      <pubDate>{_rfc822(post.published_at or post.created_at)}</pubDate>",
            f"      <description>{escape(summary)}</description>",
            "    </item>",
        ]

    lines += ["  </channel>", "</rss>", ""]
    xml = "\n".join(lines)

    return Response(
        content=xml,
        media_type="application/rss+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=600"},
    )


async def _load_site_settings(session) -> dict[str, str]:
    from app.settings import crud as settings_crud  # 局部导入避免循环依赖

    return await settings_crud.get_site_settings(session=session)
