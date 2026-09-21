"""
Trusted clock for FaceGate.

The PC clock in a school can be wrong (dead CMOS battery, wrong timezone,
someone changed it by hand). Attendance times must not depend on that, so we
measure the difference between this PC and real internet time once in a while
and keep the offset in memory. Everything that records or compares times goes
through now_utc() / now_tz() here.

When there is no internet the offset simply stays at whatever we measured last
(0 on a fresh offline start), so the standalone build keeps working.
"""

from __future__ import annotations

import datetime as _dt
import email.utils as _eut
import os
import threading
import time
import urllib.request

# Public endpoints that return an accurate HTTP `Date` header.
_SOURCES = [
    os.environ.get("FACEGATE_TIME_URL") or "",
    (os.environ.get("FACEGATE_CLOUD_URL") or "https://connextedscan.lovable.app").rstrip("/") + "/",
    "https://www.google.com/generate_204",
    "https://cloudflare.com/cdn-cgi/trace",
]

_lock = threading.Lock()
_offset = 0.0          # seconds to add to the PC clock
_synced_at = 0.0       # PC monotonic-ish timestamp of the last good sync
_synced = False

SYNC_SECONDS = 1800    # re-check every 30 minutes


def offset_seconds() -> float:
    with _lock:
        return _offset


def is_synced() -> bool:
    with _lock:
        return _synced


def status() -> dict:
    with _lock:
        return {
            "synced": _synced,
            "offset_seconds": round(_offset, 1),
            "checked_at": (
                _dt.datetime.fromtimestamp(_synced_at, _dt.timezone.utc).isoformat()
                if _synced_at else None
            ),
            "pc_clock_wrong": _synced and abs(_offset) > 60,
        }


def now_utc() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(seconds=offset_seconds())


def now_tz(tz: _dt.tzinfo) -> _dt.datetime:
    return now_utc().astimezone(tz)


def timestamp() -> float:
    """Corrected wall-clock epoch seconds (use time.monotonic for durations)."""
    return time.time() + offset_seconds()


def _fetch(url: str) -> float | None:
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "FaceGate"})
        with urllib.request.urlopen(req, timeout=8) as res:  # noqa: S310
            raw = res.headers.get("Date")
    except Exception:  # noqa: BLE001
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FaceGate"})
            with urllib.request.urlopen(req, timeout=8) as res:  # noqa: S310
                raw = res.headers.get("Date")
        except Exception:  # noqa: BLE001
            return None
    if not raw:
        return None
    try:
        parsed = _eut.parsedate_to_datetime(raw)
    except Exception:  # noqa: BLE001
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_dt.timezone.utc)
    return parsed.timestamp()


def sync_now() -> bool:
    """Measure the PC clock against internet time. Returns True on success."""
    global _offset, _synced, _synced_at
    for url in _SOURCES:
        if not url:
            continue
        before = time.time()
        remote = _fetch(url)
        if remote is None:
            continue
        after = time.time()
        # Date headers only carry whole seconds; centre on the request window.
        offset = remote + 0.5 - (before + after) / 2
        with _lock:
            _offset = offset
            _synced = True
            _synced_at = time.time()
        if abs(offset) > 60:
            print(f"[clock] PC clock is off by {offset:.0f}s — using internet time instead")
        else:
            print(f"[clock] time checked against internet (offset {offset:.1f}s)")
        return True
    print("[clock] no internet time source reachable — using PC clock")
    return False


def _loop() -> None:
    while True:
        try:
            sync_now()
        except Exception as exc:  # noqa: BLE001
            print(f"[clock] time check failed: {exc}")
        time.sleep(SYNC_SECONDS)


def start() -> None:
    threading.Thread(target=_loop, daemon=True).start()
