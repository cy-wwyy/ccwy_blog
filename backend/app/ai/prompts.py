"""AI 功能 prompt 模板集中管理。

每个 prompt 定义为独立常量，接受 format() 参数。
"""

# ── Slug 生成 ──────────────────────────────────────────

SLUG_PROMPT = """\
You are a URL slug generator. Convert the given title to a clean, concise English slug.

Rules:
- Output ONLY the slug string — no explanation, no markdown, no quotes
- Lowercase all letters
- Separate words with single hyphens
- Keep it short (at most 6 words)
- Remove punctuation, special characters, and stop words (a, an, the, etc.)
- If the title is already in English, preserve key words; if in another language, translate meaningfully

Title: {title}
Language: {lang}

slug:"""
