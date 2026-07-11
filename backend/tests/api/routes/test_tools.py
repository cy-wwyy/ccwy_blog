import pyotp
from httpx import AsyncClient

from app.core.config import settings
from app.tools import crypto

API = settings.API_V1_STR
SECRET = "JBSWY3DPEHPK3PXP"  # RFC 测试密钥


def test_crypto_roundtrip() -> None:
    blob = crypto.encrypt(SECRET, "pw-123")
    assert crypto.decrypt(blob, "pw-123") == SECRET


def test_crypto_wrong_passphrase() -> None:
    blob = crypto.encrypt(SECRET, "right")
    import pytest

    with pytest.raises(crypto.InvalidToken):
        crypto.decrypt(blob, "wrong")


async def test_totp_with_param(client: AsyncClient, auth: dict[str, str]) -> None:
    r = await client.post(
        f"{API}/admin/tools/totp", headers=auth, json={"secret": SECRET}
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["code"]) == 6 and d["code"].isdigit()
    assert pyotp.TOTP(SECRET).verify(d["code"])
    assert 1 <= d["expires_in"] <= 30
    assert d["period"] == 30


async def test_totp_accepts_spaced_secret(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    r = await client.post(
        f"{API}/admin/tools/totp",
        headers=auth,
        json={"secret": "JBSW Y3DP EHPK 3PXP"},
    )
    assert r.status_code == 200, r.text
    assert pyotp.TOTP(SECRET).verify(r.json()["code"])


async def test_totp_encrypted_secret(
    client: AsyncClient, auth: dict[str, str], monkeypatch
) -> None:
    # 模拟 .env 里配置了加密密文
    blob = crypto.encrypt(SECRET, "my-pass")
    monkeypatch.setattr(settings, "TOTP_SECRET_ENC", blob)

    # 正确口令 → 出码
    r = await client.post(
        f"{API}/admin/tools/totp", headers=auth, json={"passphrase": "my-pass"}
    )
    assert r.status_code == 200, r.text
    assert pyotp.TOTP(SECRET).verify(r.json()["code"])

    # 错误口令 → 400
    r2 = await client.post(
        f"{API}/admin/tools/totp", headers=auth, json={"passphrase": "nope"}
    )
    assert r2.status_code == 400

    # 有密文但不给口令 → 400
    r3 = await client.post(f"{API}/admin/tools/totp", headers=auth, json={})
    assert r3.status_code == 400


async def test_totp_invalid_secret(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    r = await client.post(
        f"{API}/admin/tools/totp", headers=auth, json={"secret": "not base32 !!"}
    )
    assert r.status_code == 400


async def test_totp_corrupted_ciphertext(
    client: AsyncClient, auth: dict[str, str], monkeypatch
) -> None:
    # 密文被写坏（非法 base64）→ 应 400 而非 500
    monkeypatch.setattr(settings, "TOTP_SECRET_ENC", "!!!not-base64!!!")
    r = await client.post(
        f"{API}/admin/tools/totp", headers=auth, json={"passphrase": "x"}
    )
    assert r.status_code == 400


async def test_totp_requires_auth(client: AsyncClient) -> None:
    r = await client.post(f"{API}/admin/tools/totp", json={"secret": SECRET})
    assert r.status_code == 401
