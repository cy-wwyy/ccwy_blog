"""个人工具（与博客业务无关）：GitHub 2FA (TOTP) 验证码生成。

密钥三种来源，优先级：请求直接传 secret > 加密密文(TOTP_SECRET_ENC)+口令 > 明文(TOTP_SECRET)。
口令走 POST 请求体，不进 URL / 访问日志。
"""

import time

import pyotp
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel

from app.core.config import settings
from app.core.deps import require_permission
from app.core.models import User
from app.tools import crypto

router = APIRouter(prefix="/admin/tools", tags=["admin-tools"])


class TotpRequest(SQLModel):
    passphrase: str | None = None  # 解密 TOTP_SECRET_ENC 用（可用登录密码）
    secret: str | None = None  # 直接给 base32 明文密钥（覆盖，最高优先）


class TotpCode(SQLModel):
    code: str
    expires_in: int  # 当前验证码还有几秒失效
    period: int


def _normalize(secret: str) -> str:
    return secret.replace(" ", "").strip().upper()


def _resolve_secret(body: TotpRequest) -> str:
    if body.secret:
        return _normalize(body.secret)
    if settings.TOTP_SECRET_ENC:
        if not body.passphrase:
            raise HTTPException(status_code=400, detail="需要口令以解密密钥")
        try:
            return _normalize(
                crypto.decrypt(settings.TOTP_SECRET_ENC, body.passphrase)
            )
        except (crypto.InvalidToken, ValueError):
            # InvalidToken=口令错；ValueError/binascii=密文损坏，都归 400
            raise HTTPException(
                status_code=400, detail="口令错误或密文损坏"
            ) from None
    if settings.TOTP_SECRET:
        return _normalize(settings.TOTP_SECRET)
    raise HTTPException(
        status_code=400,
        detail="未配置 2FA 密钥（设置 .env 的 TOTP_SECRET_ENC / TOTP_SECRET 或传 secret）",
    )


@router.post("/totp", response_model=TotpCode)
async def get_totp(
    body: TotpRequest,
    _: User = Depends(require_permission("settings:manage")),
) -> TotpCode:
    """按 TOTP(RFC 6238) 算出当前 6 位验证码，与 Authenticator App 一致。"""
    raw = _resolve_secret(body)
    now = int(time.time())
    try:
        totp = pyotp.TOTP(raw)
        code = totp.at(now)  # 与 expires_in 用同一时间基准，避免跨槽错位
    except Exception:
        raise HTTPException(
            status_code=400, detail="密钥无效（应为 base32）"
        ) from None
    period = int(totp.interval)
    expires_in = period - now % period
    return TotpCode(code=code, expires_in=expires_in, period=period)
