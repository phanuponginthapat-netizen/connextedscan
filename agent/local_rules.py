"""
Check-in / check-out time rules for the standalone build.
Mirrors src/lib/attendance-rules.ts one for one, so a standalone school and a
cloud school behave identically.
"""

from __future__ import annotations

import datetime as _dt
from typing import Any

BANGKOK = _dt.timezone(_dt.timedelta(hours=7))


def bangkok_now() -> _dt.datetime:
    return _dt.datetime.now(BANGKOK)


def time_to_minutes(value: str | None) -> int:
    if not value:
        return 0
    parts = str(value).split(":")
    try:
        return int(parts[0]) * 60 + (int(parts[1]) if len(parts) > 1 else 0)
    except ValueError:
        return 0


def bangkok_minutes(now: _dt.datetime | None = None) -> int:
    now = now or bangkok_now()
    return now.hour * 60 + now.minute


def bangkok_weekday(now: _dt.datetime | None = None) -> int:
    """0 = Sunday … 6 = Saturday (same numbering as the cloud version)."""
    now = now or bangkok_now()
    return (now.weekday() + 1) % 7


def bangkok_date_iso(now: _dt.datetime | None = None) -> str:
    return (now or bangkok_now()).strftime("%Y-%m-%d")


def parse_work_days(value: str | None) -> list[int]:
    days = []
    for part in str(value or "").split(","):
        part = part.strip()
        if part.isdigit() and 0 <= int(part) <= 6:
            days.append(int(part))
    return days or [1, 2, 3, 4, 5]


def is_work_day(settings: dict[str, Any], weekday: int) -> bool:
    if not settings.get("block_non_work_days"):
        return True
    return weekday in parse_work_days(settings.get("work_days"))


def is_checkin_only(settings: dict[str, Any]) -> bool:
    """Schools that only record arrivals: no check-out, no late marking."""
    return bool(settings.get("checkin_only_mode"))


def late_limit(settings: dict[str, Any]) -> float:
    """Minute after which an arrival counts as late (never, in check-in mode)."""
    if is_checkin_only(settings):
        return float("inf")
    return time_to_minutes(settings.get("late_after")) + int(
        settings.get("late_grace_minutes") or 0
    )


def decide_direction(settings: dict[str, Any], minutes: int, requested: str | None,
                     weekday: int | None = None) -> dict:
    if weekday is not None and not is_work_day(settings, weekday):
        return {"allowed": False, "direction": requested or "in", "reason": "non_work_day"}

    # Check-in only: always an arrival, at any time of the working day.
    if is_checkin_only(settings):
        return {"allowed": True, "direction": "in", "reason": None}

    in_open = (
        time_to_minutes(settings.get("checkin_start")) <= minutes
        <= time_to_minutes(settings.get("checkin_end"))
    )
    out_open = (
        time_to_minutes(settings.get("checkout_start")) <= minutes
        <= time_to_minutes(settings.get("checkout_end"))
    )

    if requested in ("in", "out"):
        open_now = in_open if requested == "in" else out_open
        return {"allowed": open_now, "direction": requested,
                "reason": None if open_now else "out_of_window"}

    if in_open:
        return {"allowed": True, "direction": "in", "reason": None}
    if out_open:
        return {"allowed": True, "direction": "out", "reason": None}
    return {"allowed": False, "direction": "in" if minutes < 720 else "out",
            "reason": "out_of_window"}


def is_late(settings: dict[str, Any], minutes: int, direction: str) -> bool:
    if direction != "in":
        return False
    grace = int(settings.get("late_grace_minutes") or 0)
    return minutes > time_to_minutes(settings.get("late_after")) + grace


def is_early_leave(settings: dict[str, Any], minutes: int, direction: str) -> bool:
    before = settings.get("early_leave_before")
    if direction != "out" or not before:
        return False
    return minutes < time_to_minutes(before)
