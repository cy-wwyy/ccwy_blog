from datetime import UTC, datetime

from ulid import ULID


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


def generate_ulid() -> str:
    return str(ULID())
