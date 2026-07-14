"""大模型交互入口：OpenAI 兼容格式。

所有 AI 功能通过此模块调用，避免分散调用第三方 API。
配置从 SiteSetting 表读取（由后台设置页管理），
独立于 .env 的 Settings，方便运行时热修改。
"""

import json
import logging

from openai import AsyncOpenAI
from sqlmodel.ext.asyncio.session import AsyncSession

from app.settings.crud import get_site_settings

logger = logging.getLogger(__name__)

# 默认值 — 只在外部未配置时兜底
_DEFAULT_BASE = "https://api.openai.com/v1"
_DEFAULT_MODEL = "gpt-4o-mini"
_REQUEST_TIMEOUT = 5.0  # slug 是短文本，5 秒足够


async def _client(session: AsyncSession) -> AsyncOpenAI | None:
    """按当前 SiteSetting 构建客户端；未启用或无 key 时返回 None。"""
    config = await get_site_settings(session=session)
    enabled = config.get("ai_enabled", "")
    api_key = config.get("ai_api_key", "")
    if enabled != "true" or not api_key:
        return None
    base = config.get("ai_api_base", "") or _DEFAULT_BASE
    return AsyncOpenAI(base_url=base, api_key=api_key, timeout=_REQUEST_TIMEOUT)


def _parse_extra_body(raw: str) -> dict | None:
    """解析 JSON 字符串为 extra_body dict；非法 JSON 记日志并忽略。"""
    if not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        logger.warning("ai_extra_body 不是 JSON 对象，已忽略")
        return None
    except json.JSONDecodeError:
        logger.warning("ai_extra_body 不是合法 JSON，已忽略")
        return None


async def _build_kwargs(session: AsyncSession) -> dict:
    """从 SiteSetting 构建 chat.completions.create 的额外参数。"""
    config = await get_site_settings(session=session)
    kwargs: dict = {}

    effort = config.get("ai_reasoning_effort", "").strip()
    if effort:
        kwargs["reasoning_effort"] = effort

    extra = _parse_extra_body(config.get("ai_extra_body", ""))
    if extra:
        kwargs["extra_body"] = extra

    return kwargs


async def generate_slug(
    *, session: AsyncSession, title: str, lang: str = "zh"
) -> str:
    """根据标题调用 LLM 生成英文 slug。

    Args:
        session: 数据库会话（用于读取 SiteSetting）
        title: 文章/分类/标签/相册的标题
        lang: 标题语言，提示 LLM 是否需要翻译

    Returns:
        slug 字符串（已过滤非法字符并限长）

    Raises:
        RuntimeError: LLM 不可用或调用失败
    """
    from app.ai.prompts import SLUG_PROMPT

    client = await _client(session)
    if client is None:
        raise RuntimeError("AI 服务未启用或未配置 API Key")

    config = await get_site_settings(session=session)
    model = config.get("ai_model", "") or _DEFAULT_MODEL
    prompt = SLUG_PROMPT.format(title=title, lang=lang)

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=50,
            temperature=0.3,
            **await _build_kwargs(session),
        )
    except Exception as e:
        logger.warning("LLM slug generation failed: %s", e)
        raise RuntimeError(f"AI 调用失败: {e}") from e

    raw = response.choices[0].message.content or ""
    slug = _sanitize(raw.strip())
    if not slug:
        raise RuntimeError("AI 返回了无效的 slug，请手动填写")
    return slug


def _sanitize(raw: str) -> str:
    """过滤非法字符并限长，符合项目 slug 规则。"""
    import re

    # 只保留小写字母、数字、连字符
    cleaned = re.sub(r"[^a-z0-9-]", "", raw.lower())
    # 合并连续连字符
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    # 去掉首尾连字符
    cleaned = cleaned.strip("-")
    # 限长 200（兼顾各模型最大长度，最宽的是 Post 256）
    return cleaned[:200]
