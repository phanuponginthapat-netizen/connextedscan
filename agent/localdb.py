"""
FaceGate standalone local database (SQLite)
-------------------------------------------
Used only by the standalone build: everything a school needs lives in one
folder on the kiosk PC, so the program works with no internet connection and
no central server. One school = one data folder = one database file.

Layout of the data folder:
    facegate.db          the database (people, scans, settings)
    faces/<id>.jpg       enrolled face photos
    snapshots/<..>.jpg   photos captured during a scan
    avatars/<id>.jpg     profile pictures
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from typing import Any

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None


def default_data_dir() -> str:
    base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
    if not base:
        base = os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "facegate", "data")


DATA_DIR = os.environ.get("FACEGATE_DATA_DIR", default_data_dir())
DB_PATH = os.path.join(DATA_DIR, "facegate.db")
FACE_DIR = os.path.join(DATA_DIR, "faces")
SNAPSHOT_DIR = os.path.join(DATA_DIR, "snapshots")
AVATAR_DIR = os.path.join(DATA_DIR, "avatars")

# Every setting the kiosk, the rules and the door controller read. Kept in one
# JSON row so a new option never needs a database migration on hundreds of
# school PCs.
DEFAULT_SETTINGS: dict[str, Any] = {
    "school_name": "โรงเรียนของเรา",
    "checkin_start": "06:00",
    "checkin_end": "10:00",
    "checkout_start": "14:00",
    "checkout_end": "19:00",
    "late_after": "08:00",
    "late_grace_minutes": 0,
    "early_leave_before": None,
    "work_days": "1,2,3,4,5",
    "block_non_work_days": True,
    # Check-in only schools: every scan is an arrival, the scan windows never
    # close and nobody is marked late or leaving early.
    "checkin_only_mode": False,
    # Rest the screen on the statistics board after this many quiet minutes
    # (0 = never). The camera keeps running the whole time.
    "idle_stats_minutes": 0,
    "match_threshold": 0.42,
    "geometry_min_score": 0.5,
    "geometry_weight": 0.3,
    "detector_min_score": 0.5,
    "min_face_coverage": 0.08,
    "require_liveness": True,
    "duplicate_cooldown_minutes": 300,
    "next_person_delay_seconds": 5,
    "save_snapshots": True,
    "snapshot_retention_days": 90,
    "retention_days": 365,
    "auto_enroll": True,
    "auto_enroll_min_confidence": 0.62,
    "auto_enroll_max_faces": 12,
    "auto_update_enabled": False,
    "failed_alert_threshold": 5,
    "visitor_mode": False,
    "second_camera_index": -1,
    "second_camera_direction": "out",
    "voice_enabled": True,
    "voice_rate": 1,
    "voice_volume": 1,
    "voice_template": "สแกนสำเร็จ {name} {direction}",
    "voice_late_suffix": "มาสายนะคะ",
    "voice_duplicate_template": "สแกนซ้ำ {name} บันทึกเวลาไปแล้ว",
    "voice_denied_text": "ท่านไม่ใช่บุคลากรหรือนักเรียนของเรา กรุณาติดต่อเจ้าหน้าที่",
    "voice_out_of_window_text": "ยังไม่ถึงเวลาสแกน กรุณาติดต่อเจ้าหน้าที่",
    "kiosk_show_recent": True,
    "kiosk_recent_limit": 20,
    "kiosk_mirror": True,
    "kiosk_show_clock": True,
    "kiosk_show_confidence": False,
    "kiosk_news_enabled": False,
    "kiosk_news_text": "",
    "screensaver_mode": "stats",
    # CCTV mode: the camera keeps running while the screen rests, and the PC is
    # never slept or powered off automatically (only the monitor is blanked).
    "cctv_always_on": True,
    "door_enabled": True,
    "door_open_seconds": 5,
    "door_angle_down": 10,
    "door_angle_up": 100,
    "door_move_step": 3,
    "door_move_delay_ms": 15,
    "door_hold_power": True,
    "door_invert_servo": False,
    "door_use_relay": False,
    "door_buzzer_enabled": True,
    "door_deny_alarm": True,
    "power_saving_enabled": False,
    "screen_idle_minutes": 15,
    "screen_off_start": None,
    "screen_off_end": None,
    "auto_power_off_enabled": False,
    "auto_power_off_time": "18:30",
    "auto_power_off_action": "shutdown",
    "power_off_workdays_only": True,
    # LAN mode: this PC becomes the hub other kiosks connect to.
    "live_view_enabled": True,
    "lan_enabled": True,
    "lan_port": 8899,
}

# Look-and-feel and wording of the kiosk screen and the printed reports — the
# offline twin of the cloud CMS.
DEFAULT_CONTENT: dict[str, Any] = {
    "brand_name": "FaceGate",
    "kiosk_title": "สแกนใบหน้าเข้า-ออกโรงเรียน",
    "kiosk_subtitle": "กรุณามองกล้องในกรอบวงรี",
    "kiosk_footer": "ระบบบันทึกเวลาด้วยใบหน้า",
    "kiosk_welcome": "ยินดีต้อนรับเข้าสู่",
    "kiosk_live_label": "กล้องสด",
    "kiosk_today_label": "วันนี้",
    "kiosk_comparison_title": "ผลการเปรียบเทียบใบหน้า",
    "kiosk_camera_image_label": "ภาพจากกล้อง",
    "kiosk_registered_image_label": "ภาพลงทะเบียน",
    "kiosk_match_score_label": "คะแนนตรงกัน",
    "kiosk_verified_label": "ยืนยันตัวตนแล้ว",
    "kiosk_class_label": "ชั้นเรียน",
    "kiosk_id_label": "รหัส",
    "kiosk_time_label": "เวลาเข้า-ออก",
    "kiosk_status_label": "สถานะ",
    "kiosk_success_label": "บันทึกสำเร็จ",
    "logo_path": None,
    "theme_primary": "#1d6fe0",
    "theme_accent": "#0ea5e9",
    "theme_ink": "#132a4f",
    "report_title": "รายงานรายบุคคล",
    "report_footer": "รายงานนี้ออกโดยระบบบันทึกเวลาด้วยใบหน้า",
    "signer_line": "ลงชื่อผู้รับรองรายงาน",
    "certificate_title": "ใบรับรองเวลาเรียน",
}


def get_content() -> dict[str, Any]:
    stored = kv_get("content", {}) or {}
    merged = dict(DEFAULT_CONTENT)
    if isinstance(stored, dict):
        merged.update({k: v for k, v in stored.items() if k in DEFAULT_CONTENT})
    return merged


def save_content(patch: dict[str, Any]) -> dict[str, Any]:
    stored = kv_get("content", {}) or {}
    if not isinstance(stored, dict):
        stored = {}
    for key, value in patch.items():
        if key in DEFAULT_CONTENT:
            stored[key] = value
    kv_set("content", stored)
    return get_content()


SCHEMA = """
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  nickname TEXT,
  class_room TEXT,
  guardian_phone TEXT,
  gender TEXT,
  person_type TEXT NOT NULL DEFAULT 'student',
  department TEXT,
  position TEXT,
  avatar_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS student_faces (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  image_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  embedding TEXT,
  geometry TEXT,
  quality REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS student_faces_student_idx ON student_faces(student_id);
CREATE TABLE IF NOT EXISTS attendance_logs (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  confidence REAL,
  geometry_score REAL,
  device_name TEXT,
  snapshot_path TEXT,
  scanned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attendance_scanned_idx ON attendance_logs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS attendance_student_idx ON attendance_logs(student_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS attendance_report_idx
  ON attendance_logs(status, direction, scanned_at, student_id);
CREATE TABLE IF NOT EXISTS visitor_logs (
  id TEXT PRIMARY KEY,
  direction TEXT,
  snapshot_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS security_alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  detail TEXT,
  snapshot_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_key TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL DEFAULT 'auto',
  location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT,
  last_scan_at TEXT,
  created_at TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            for folder in (DATA_DIR, FACE_DIR, SNAPSHOT_DIR, AVATAR_DIR):
                os.makedirs(folder, exist_ok=True)
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA busy_timeout=5000")
            _conn.executescript(SCHEMA)
            columns = {row[1] for row in _conn.execute("PRAGMA table_info(students)").fetchall()}
            if "gender" not in columns:
                _conn.execute("ALTER TABLE students ADD COLUMN gender TEXT")
            # LAN mode: remember which kiosk produced each row.
            for table in ("attendance_logs", "visitor_logs", "security_alerts"):
                cols = {row[1] for row in _conn.execute(f"PRAGMA table_info({table})").fetchall()}
                if "device_id" not in cols:
                    _conn.execute(f"ALTER TABLE {table} ADD COLUMN device_id TEXT")
                if "device_name" not in cols:
                    _conn.execute(f"ALTER TABLE {table} ADD COLUMN device_name TEXT")
            _conn.commit()
        return _conn


def query(sql: str, params: tuple | list = ()) -> list[dict]:
    with _lock:
        cur = connect().execute(sql, tuple(params))
        return [dict(row) for row in cur.fetchall()]


def one(sql: str, params: tuple | list = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def run(sql: str, params: tuple | list = ()) -> None:
    with _lock:
        conn = connect()
        conn.execute(sql, tuple(params))
        conn.commit()


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


# ---------------------------------------------------------------- key/value


def kv_get(key: str, fallback: Any = None) -> Any:
    row = one("SELECT value FROM kv WHERE key = ?", (key,))
    if not row:
        return fallback
    try:
        return json.loads(row["value"])
    except Exception:  # noqa: BLE001
        return fallback


def kv_set(key: str, value: Any) -> None:
    run(
        "INSERT INTO kv (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value, ensure_ascii=False)),
    )


def get_settings() -> dict[str, Any]:
    stored = kv_get("settings", {}) or {}
    merged = dict(DEFAULT_SETTINGS)
    if isinstance(stored, dict):
        merged.update({k: v for k, v in stored.items() if k in DEFAULT_SETTINGS})
    return merged


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    stored = kv_get("settings", {}) or {}
    if not isinstance(stored, dict):
        stored = {}
    for key, value in patch.items():
        if key in DEFAULT_SETTINGS:
            stored[key] = value
    kv_set("settings", stored)
    return get_settings()


# -------------------------------------------------------------------- auth


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


def admin_configured() -> bool:
    return bool(kv_get("admin_password"))


def set_admin_password(password: str) -> None:
    kv_set("admin_password", hash_password(password))


def check_admin_password(password: str) -> bool:
    stored = kv_get("admin_password")
    return bool(stored) and verify_password(password, stored)


# ------------------------------------------------------------------ people


def face_dict(row: dict) -> dict:
    return {
        "id": row["id"],
        "student_id": row["student_id"],
        "image_path": row["image_path"],
        "source": row["source"],
        "status": row["status"],
        "quality": row["quality"],
        "embedding": json.loads(row["embedding"]) if row.get("embedding") else None,
        "geometry": json.loads(row["geometry"]) if row.get("geometry") else None,
        "processed_at": row.get("processed_at"),
        "created_at": row["created_at"],
    }


def list_active_people() -> list[dict]:
    return query(
        "SELECT id, student_code, full_name, nickname, class_room, gender, person_type, department,"
        " position, avatar_path, is_active FROM students WHERE is_active = 1 ORDER BY full_name"
    )


def list_ready_faces() -> list[dict]:
    rows = query(
        "SELECT f.* FROM student_faces f JOIN students s ON s.id = f.student_id "
        "WHERE s.is_active = 1 AND f.embedding IS NOT NULL"
    )
    return [face_dict(r) for r in rows]


def add_audit(action: str, target: str | None = None, detail: str | None = None,
              actor_email: str | None = "ผู้ดูแลในเครื่อง") -> None:
    run(
        "INSERT INTO audit_logs (id, actor_email, action, target, detail, created_at)"
        " VALUES (?,?,?,?,?,?)",
        (new_id(), actor_email, action[:120], (target or "")[:200], (detail or "")[:1000], now_iso()),
    )


# ----------------------------------------------------------- kiosks on a LAN

HUB_DEVICE = {
    "id": "local",
    "name": "ตู้สแกนเครื่องแม่",
    "direction": "auto",
    "is_active": True,
}


def list_devices() -> list[dict]:
    rows = query("SELECT * FROM devices ORDER BY created_at")
    return [{**r, "is_active": bool(r["is_active"])} for r in rows]


def device_by_key(key: str) -> dict | None:
    if not key:
        return None
    row = one("SELECT * FROM devices WHERE device_key = ?", (key,))
    if not row or not row["is_active"]:
        return None
    return {**row, "is_active": True}


def create_device(name: str, direction: str = "auto", location: str | None = None) -> dict:
    device_id = new_id()
    key = secrets.token_urlsafe(18)
    run(
        "INSERT INTO devices (id, name, device_key, direction, location, is_active, created_at)"
        " VALUES (?,?,?,?,?,1,?)",
        (device_id, name[:80], key, direction if direction in ("in", "out", "auto") else "auto",
         (location or None), now_iso()),
    )
    return one("SELECT * FROM devices WHERE id = ?", (device_id,)) or {}


def update_device(device_id: str, patch: dict[str, Any]) -> None:
    fields, values = [], []
    for key in ("name", "direction", "location", "is_active"):
        if key not in patch:
            continue
        value = patch[key]
        if key == "direction" and value not in ("in", "out", "auto"):
            value = "auto"
        if key == "is_active":
            value = 1 if value else 0
        fields.append(f"{key} = ?")
        values.append(value)
    if not fields:
        return
    run(f"UPDATE devices SET {', '.join(fields)} WHERE id = ?", (*values, device_id))


def rotate_device_key(device_id: str) -> str:
    key = secrets.token_urlsafe(18)
    run("UPDATE devices SET device_key = ? WHERE id = ?", (key, device_id))
    return key


def delete_device(device_id: str) -> None:
    run("DELETE FROM devices WHERE id = ?", (device_id,))


def touch_device(device_id: str, scanned: bool = False) -> None:
    if device_id == "local":
        return
    if scanned:
        run("UPDATE devices SET last_seen = ?, last_scan_at = ? WHERE id = ?",
            (now_iso(), now_iso(), device_id))
    else:
        run("UPDATE devices SET last_seen = ? WHERE id = ?", (now_iso(), device_id))
