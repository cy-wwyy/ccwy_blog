"""口令加解密：密文存 .env，解密口令调用时手动提供，不落盘。

用 scrypt 从口令派生密钥 + Fernet 认证加密（口令错 → 解密直接失败）。
密文格式：base64( salt(16B) || fernet_token )，salt 随密文走、非机密。
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken

_SALT_LEN = 16


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    dk = hashlib.scrypt(
        passphrase.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return base64.urlsafe_b64encode(dk)


def encrypt(plaintext: str, passphrase: str) -> str:
    salt = os.urandom(_SALT_LEN)
    token = Fernet(_derive_key(passphrase, salt)).encrypt(plaintext.encode())
    return base64.urlsafe_b64encode(salt + token).decode()


def decrypt(blob: str, passphrase: str) -> str:
    """解密；口令错或密文损坏抛 InvalidToken。"""
    raw = base64.urlsafe_b64decode(blob.encode())
    salt, token = raw[:_SALT_LEN], raw[_SALT_LEN:]
    return Fernet(_derive_key(passphrase, salt)).decrypt(token).decode()


__all__ = ["encrypt", "decrypt", "InvalidToken"]
