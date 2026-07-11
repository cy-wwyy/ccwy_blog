"""一次性：把 GitHub 2FA (TOTP) 密钥加密成 .env 用的密文。

用法（口令与密钥都不回显、不落盘）：
    uv run python scripts/totp_encrypt.py

按提示输入 base32 密钥和一个口令（可用你的后台登录密码），
把输出的 TOTP_SECRET_ENC=... 一行粘进 backend/.env 即可。
换口令或换密钥时重跑本脚本、替换该行。
"""

import getpass
import sys

from app.tools import crypto


def main() -> None:
    secret = getpass.getpass("GitHub 2FA base32 密钥（不回显）: ").replace(
        " ", ""
    ).strip()
    if not secret:
        print("密钥为空，已取消", file=sys.stderr)
        raise SystemExit(1)
    p1 = getpass.getpass("设置解密口令（可用登录密码，不回显）: ")
    p2 = getpass.getpass("再输一次口令: ")
    if p1 != p2:
        print("两次口令不一致，已取消", file=sys.stderr)
        raise SystemExit(1)
    if not p1:
        print("口令为空，已取消", file=sys.stderr)
        raise SystemExit(1)

    blob = crypto.encrypt(secret, p1)
    # 自检：确保能用同一口令解回
    assert crypto.decrypt(blob, p1) == secret
    print("\n把下面这行粘进 backend/.env：\n")
    print(f"TOTP_SECRET_ENC={blob}")


if __name__ == "__main__":
    main()
