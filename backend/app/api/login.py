from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from app.core import security
from app.core.config import settings
from app.core.deps import CurrentUser, SessionDep
from app.core.models import Token, User, UserPublic

router = APIRouter(tags=["login"])


@router.post("/login/access-token")
async def login_access_token(
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    OAuth2 兼容的 token 登录 — 账号或邮箱均可
    """
    login_value = form_data.username
    statement = select(User).where(
        (User.username == login_value) | (User.email == login_value)
    )
    user = (await session.exec(statement)).first()
    if not user:
        raise HTTPException(status_code=400, detail="账号或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="账号已被禁用")

    verified, updated_hash = security.verify_password(form_data.password, user.hashed_password)
    if not verified:
        raise HTTPException(status_code=400, detail="账号或密码错误")
    if updated_hash:
        user.hashed_password = updated_hash
        session.add(user)
        await session.commit()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id, expires_delta=access_token_expires
        )
    )


@router.post("/login/test-token", response_model=UserPublic)
async def test_token(current_user: CurrentUser) -> Any:
    """
    测试 token 是否有效
    """
    return current_user
