from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

ALGORITHM = "HS256"

_password_hasher = PasswordHash.recommended()


def get_password_hash(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(
    password: str, hashed_password: str
) -> tuple[bool, str | None]:
    """
    验证密码。返回 (是否通过, 更新后的hash或None)
    如果哈希算法参数已过时需要更新，返回新的hash
    """
    verified, updated = _password_hasher.verify_and_update(password, hashed_password)
    return verified, updated


def create_access_token(
    subject: str | int, expires_delta: timedelta | None = None
) -> str:
    """
    创建 JWT access token
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(UTC) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
