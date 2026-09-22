"""
FaceGate standalone local API
-----------------------------
Serves, from the kiosk PC itself, everything the cloud normally provides:

  /local/api/public/kiosk/*     the endpoints the face agent already calls
  /local/api/local/*            the local admin pages (people, scans, settings)
  /local/media/<path>           face photos and scan snapshots
  /kiosk  /admin                the offline screens

Nothing here talks to the internet. One PC = one school.
"""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
import io
import json
import os
import secrets
import shutil
import time
import zipfile
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import (FileResponse, HTMLResponse, JSONResponse, Response,
                               StreamingResponse)
from starlette.concurrency import run_in_threadpool

import localdb as db
import local_rules as rules
import local_voice


router = APIRouter()

# Injected by agent.py: jpeg bytes -> {"embedding": [...], "geometry": {...}, "quality": float}
EMBEDDER: Callable[[bytes], dict] | None = None

_sessions: dict[str, float] = {}
SESSION_HOURS = 12


def set_embedder(fn: Callable[[bytes], dict]) -> None:
    global EMBEDDER
    EMBEDDER = fn


# --------------------------------------------------------------------- auth


def issue_token() -> str:
    token = secrets.token_urlsafe(24)
    _sessions[token] = time.time() + SESSION_HOURS * 3600
    return token


def require_admin(token: str | None) -> None:
    expires = _sessions.get(token or "")
    if not expires or expires < time.time():
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง")


@router.get("/api/local/auth/status")
def auth_status():
    return {"configured": db.admin_configured()}


@router.post("/api/local/auth/setup")
async def auth_setup(request: Request):
    body = await request.json()
    password = str(body.get("password") or "")
    if db.admin_configured():
        raise HTTPException(status_code=400, detail="ตั้งรหัสผู้ดูแลไว้แล้ว")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร")
    db.set_admin_password(password)
    db.add_audit("ตั้งรหัสผู้ดูแลครั้งแรก", "admin")
    return {"token": issue_token()}


@router.post("/api/local/auth/login")
async def auth_login(request: Request):
    body = await request.json()
    if not db.check_admin_password(str(body.get("password") or "")):
        raise HTTPException(status_code=401, detail="รหัสผ่านไม่ถูกต้อง")
    return {"token": issue_token()}


@router.post("/api/local/auth/password")
async def auth_change(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    new = str(body.get("password") or "")
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร")
    db.set_admin_password(new)
    db.add_audit("เปลี่ยนรหัสผู้ดูแล", "admin")
    return {"ok": True}


# ------------------------------------------------------- kiosks on the LAN


LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}


def seen_recently(stamp: str | None, seconds: int = 120) -> bool:
    """A kiosk counts as online while it keeps polling the hub."""
    if not stamp:
        return False
    try:
        import calendar

        seen = calendar.timegm(time.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S"))
    except Exception:  # noqa: BLE001
        return False
    return (time.time() - seen) < seconds


def lan_addresses() -> list[str]:
    """Best-effort list of this PC's LAN addresses, for the setup instructions."""
    import socket

    found: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            addr = info[4][0]
            if addr not in found and not addr.startswith("127."):
                found.append(addr)
    except Exception:  # noqa: BLE001
        pass
    if not found:
        try:
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            probe.connect(("8.8.8.8", 80))
            found.append(probe.getsockname()[0])
            probe.close()
        except Exception:  # noqa: BLE001
            pass
    return found


def resolve_device(request: Request, device_key: str | None) -> dict:
    """Which kiosk is calling? The hub PC itself, or a registered LAN kiosk."""
    key = (device_key or "").strip()
    client = (request.client.host if request.client else "") or ""
    if not key or key == "local":
        if client in LOOPBACK:
            return dict(db.HUB_DEVICE)
        raise HTTPException(status_code=401, detail="ตู้สแกนนี้ยังไม่ได้ลงทะเบียนกับเครื่องแม่")
    device = db.device_by_key(key)
    if not device:
        raise HTTPException(status_code=401, detail="รหัสเชื่อมต่อของตู้สแกนไม่ถูกต้องหรือถูกปิดใช้งาน")
    return device


# -------------------------------------------------------------------- media


def media_url(path: str | None) -> str | None:
    return f"/local/media/{path}" if path else None


@router.get("/media/{path:path}")
def media(path: str):
    full = os.path.normpath(os.path.join(db.DATA_DIR, path))
    if not full.startswith(os.path.normpath(db.DATA_DIR)) or not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(full, media_type="image/jpeg")


def save_jpeg(folder: str, name: str, data: bytes) -> str:
    os.makedirs(folder, exist_ok=True)
    full = os.path.join(folder, name)
    with open(full, "wb") as fh:
        fh.write(data)
    return os.path.relpath(full, db.DATA_DIR).replace(os.sep, "/")


def decode_jpeg(value: str | None) -> bytes | None:
    if not value:
        return None
    raw = value.split(",", 1)[1] if "," in value else value
    try:
        data = base64.b64decode(raw)
    except Exception:  # noqa: BLE001
        return None
    return data if 0 < len(data) < 5_000_000 else None


# ------------------------------------------------------------ kiosk: agent


@router.post("/api/public/kiosk/sync")
async def kiosk_sync(request: Request, x_device_key: str | None = Header(None)):
    device = resolve_device(request, x_device_key)
    db.touch_device(device["id"])
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    known = body.get("known") if isinstance(body.get("known"), dict) else {}
    incremental = bool(known)

    settings = db.get_settings()
    people = db.list_active_people()
    faces = db.list_ready_faces()

    ready = []
    for face in faces:
        version = face.get("processed_at") or face["created_at"]
        if incremental and known.get(face["id"]) == version:
            continue
        ready.append({
            "id": face["id"],
            "student_id": face["student_id"],
            "embedding": face["embedding"],
            "geometry": face["geometry"],
            "version": version,
        })

    live_ids = {f["id"] for f in faces}
    removed = [fid for fid in known if fid not in live_ids] if incremental else []

    pending_rows = db.query(
        "SELECT f.id, f.student_id, f.image_path FROM student_faces f "
        "JOIN students s ON s.id = f.student_id "
        "WHERE s.is_active = 1 AND f.embedding IS NULL"
    )
    pending = [
        {"id": r["id"], "student_id": r["student_id"], "url": media_url(r["image_path"])}
        for r in pending_rows
    ]

    return {
        "device": {"id": device["id"], "name": device["name"],
                   "default_direction": device.get("direction") or "auto"},
        "settings": settings,
        "students": [{**p, "is_active": bool(p["is_active"])} for p in people],
        "embeddings": ready,
        "removed": removed,
        "incremental": incremental,
        "total_embeddings": len(faces),
        "pending": pending,
        "standalone": True,
        "server_time": db.now_iso(),
    }


@router.post("/api/public/kiosk/embeddings")
async def kiosk_embeddings(request: Request, x_device_key: str | None = Header(None)):
    """The agent sends back embeddings it computed for newly registered photos."""
    resolve_device(request, x_device_key)
    body = await request.json()
    saved = 0
    for item in body.get("items", []) or []:
        face_id = item.get("id")
        embedding = item.get("embedding")
        if not face_id or not embedding:
            db.run("UPDATE student_faces SET status = 'error' WHERE id = ?", (face_id,))
            continue
        db.run(
            "UPDATE student_faces SET embedding = ?, geometry = ?, quality = ?, status = 'ready',"
            " processed_at = ? WHERE id = ?",
            (
                json.dumps(embedding),
                json.dumps(item.get("geometry")) if item.get("geometry") else None,
                item.get("quality"),
                db.now_iso(),
                face_id,
            ),
        )
        saved += 1
    return {"saved": saved}


def person_row(student_id: str) -> dict | None:
    return db.one("SELECT * FROM students WHERE id = ?", (student_id,))


@router.post("/api/public/kiosk/attendance")
async def kiosk_attendance(request: Request, x_device_key: str | None = Header(None)):
    device = resolve_device(request, x_device_key)
    body = await request.json()
    student_id = body.get("student_id")
    confidence = float(body.get("confidence") or 0)
    settings = db.get_settings()
    delay = int(settings.get("next_person_delay_seconds") or 5)
    student = person_row(student_id) if student_id else None

    if not student or not student["is_active"]:
        return {
            "result": "denied",
            "message": "ไม่พบข้อมูลในระบบ หรือถูกระงับการใช้งาน",
            "speak": settings.get("voice_denied_text"),
            "next_delay_seconds": delay,
        }

    weekday = rules.bangkok_weekday()
    minutes = rules.bangkok_minutes()

    # Visitors register themselves through the kiosk QR code and may only
    # enter on the day they registered. Otherwise they follow exactly the same
    # scan rules as the school (check-in only or check-in/out, days, windows).
    is_visitor = (student["person_type"] or "") == "visitor"
    if is_visitor and (student["visit_date"] or "") != rules.bangkok_date_iso():
        return {
            "result": "denied",
            "message": "สิทธิ์ผู้มาเยือนหมดอายุแล้ว กรุณาลงทะเบียนใหม่ผ่าน QR code",
            "speak": "สิทธิ์ผู้มาเยือนหมดอายุ กรุณาลงทะเบียนใหม่",
            "next_delay_seconds": delay,
        }

    if not rules.is_work_day(settings, weekday):
        return {
            "result": "denied",
            "message": "วันนี้ไม่ใช่วันทำการ ระบบปิดรับการสแกน",
            "speak": settings.get("voice_out_of_window_text"),
            "next_delay_seconds": delay,
        }

    geometry_score = body.get("geometry_score")
    if geometry_score is not None and float(geometry_score) < float(settings.get("geometry_min_score") or 0):
        insert_log(student_id, "in", "geometry_reject", confidence, geometry_score, None, device)
        return {
            "result": "denied",
            "message": "สัดส่วนใบหน้าไม่ตรงกับข้อมูลที่ลงทะเบียน",
            "speak": settings.get("voice_denied_text"),
            "next_delay_seconds": delay,
        }

    snapshot_path = None
    if settings.get("save_snapshots", True):
        data = decode_jpeg(body.get("snapshot"))
        if data:
            snapshot_path = save_jpeg(
                os.path.join(db.SNAPSHOT_DIR, student_id), f"{int(time.time()*1000)}.jpg", data
            )

    wanted = body.get("direction")
    if wanted not in ("in", "out"):
        preferred = device.get("direction") or "auto"
        wanted = preferred if preferred in ("in", "out") else None
    decision = rules.decide_direction(settings, minutes, wanted, weekday)
    if not decision["allowed"]:
        insert_log(student_id, decision["direction"], "out_of_window", confidence,
                   geometry_score, snapshot_path, device)
        fmt = lambda v: str(v)[:5]  # noqa: E731
        return {
            "result": "denied",
            "message": (
                f"นอกช่วงเวลาที่กำหนด (เข้า {fmt(settings['checkin_start'])}-"
                f"{fmt(settings['checkin_end'])} / ออก {fmt(settings['checkout_start'])}-"
                f"{fmt(settings['checkout_end'])})"
            ),
            "speak": settings.get("voice_out_of_window_text"),
            "next_delay_seconds": delay,
        }

    direction = decision["direction"]
    direction_label = "เข้าโรงเรียน" if direction == "in" else "ออกจากโรงเรียน"
    # Speak the full name (first + last). Nickname is opt-in via {nickname}
    # in the voice template — preferring it made the kiosk speak only a
    # surname when the nickname column held one.
    display_name = (student["full_name"] or "").strip() or (student["nickname"] or "").strip()
    nickname = (student["nickname"] or "").strip()

    cooldown = int(settings.get("duplicate_cooldown_minutes") or 300)
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - cooldown * 60))
    recent = db.one(
        "SELECT id FROM attendance_logs WHERE student_id = ? AND direction = ? AND status = 'ok'"
        " AND scanned_at >= ? ORDER BY scanned_at DESC LIMIT 1",
        (student_id, direction, since),
    )

    avatar_url = media_url(student["avatar_path"])
    snapshot_url = media_url(snapshot_path)
    # Use a real enrolled face in the comparison panel. A live scan must never
    # be reused as the registered image when the profile photo is missing.
    registered_face = db.one(
        "SELECT image_path FROM student_faces WHERE student_id = ? AND status = 'ready'"
        " ORDER BY CASE WHEN source = 'auto' THEN 1 ELSE 0 END, created_at LIMIT 1",
        (student_id,),
    )
    registered_face_url = media_url((registered_face or {}).get("image_path")) or avatar_url

    if recent:
        insert_log(student_id, direction, "duplicate", confidence, geometry_score, snapshot_path, device)
        template = settings.get("voice_duplicate_template") or "สแกนซ้ำ {name} บันทึกเวลาไปแล้ว"
        return {
            "result": "duplicate",
            "student": dict(student),
            "direction": direction,
            "avatar_url": avatar_url,
            "registered_face_url": registered_face_url,
            "snapshot_url": snapshot_url,
            "confidence": confidence,
            "message": f"{student['full_name']} สแกนซ้ำ — บันทึกเวลา{direction_label}ไปแล้ว",
            "speak": (
                template.replace("{name}", display_name)
                .replace("{nickname}", nickname)
                .replace("{direction}", direction_label)
            ),
            "next_delay_seconds": delay,
        }

    late = rules.is_late(settings, minutes, direction)
    early = rules.is_early_leave(settings, minutes, direction)
    log_id = insert_log(student_id, direction, "ok", confidence, geometry_score, snapshot_path, device)

    auto_enrolled = False
    if (
        settings.get("auto_enroll", True)
        and snapshot_path
        and body.get("embedding")
        and confidence >= float(settings.get("auto_enroll_min_confidence") or 0.62)
    ):
        count = db.one(
            "SELECT COUNT(*) AS n FROM student_faces WHERE student_id = ? AND source = 'auto'",
            (student_id,),
        )
        if (count or {}).get("n", 0) < int(settings.get("auto_enroll_max_faces") or 12):
            db.run(
                "INSERT INTO student_faces (id, student_id, image_path, source, embedding, geometry,"
                " quality, status, processed_at, created_at) VALUES (?,?,?,'auto',?,?,?,'ready',?,?)",
                (
                    db.new_id(), student_id, snapshot_path,
                    json.dumps(body.get("embedding")),
                    json.dumps(body.get("geometry")) if body.get("geometry") else None,
                    confidence, db.now_iso(), db.now_iso(),
                ),
            )
            auto_enrolled = True

    template = settings.get("voice_template") or "สแกนสำเร็จ {name} {direction}"
    speak = (
        template.replace("{name}", display_name)
        .replace("{nickname}", nickname)
        .replace("{direction}", direction_label)
        .replace("{code}", student["student_code"] or "")
        .replace("{class}", student["class_room"] or "")
    )
    if late:
        speak = f"{speak} {settings.get('voice_late_suffix') or ''}".strip()

    return {
        "result": "ok",
        "student": dict(student),
        "direction": direction,
        "avatar_url": avatar_url,
        "registered_face_url": registered_face_url,
        "snapshot_url": snapshot_url,
        "confidence": confidence,
        "late": late,
        "early_leave": early,
        "log": {"id": log_id},
        "auto_enrolled": auto_enrolled,
        "message": (
            f"สแกนสำเร็จ: {student['full_name']} ({direction_label})"
            f"{' • มาสาย' if late else ''}{' • ออกก่อนเวลา' if early else ''}"
        ),
        "speak": speak,
        "next_delay_seconds": delay,
    }


def insert_log(student_id: str | None, direction: str, status: str, confidence: float | None,
               geometry_score: Any, snapshot_path: str | None,
               device: dict | None = None) -> str:
    device = device or dict(db.HUB_DEVICE)
    log_id = db.new_id()
    db.run(
        "INSERT INTO attendance_logs (id, student_id, direction, status, confidence,"
        " geometry_score, device_id, device_name, snapshot_path, scanned_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (log_id, student_id, direction, status, confidence,
         float(geometry_score) if geometry_score is not None else None,
         device["id"], device["name"], snapshot_path, db.now_iso()),
    )
    db.touch_device(device["id"], scanned=status == "ok")
    return log_id


@router.post("/api/public/kiosk/alert")
async def kiosk_alert(request: Request, x_device_key: str | None = Header(None)):
    device = resolve_device(request, x_device_key)
    body = await request.json()
    path = None
    data = decode_jpeg(body.get("snapshot"))
    if data:
        path = save_jpeg(os.path.join(db.SNAPSHOT_DIR, "alerts"), f"{int(time.time()*1000)}.jpg", data)
    db.run(
        "INSERT INTO security_alerts (id, kind, detail, snapshot_path, device_id, device_name,"
        " created_at) VALUES (?,?,?,?,?,?,?)",
        (db.new_id(), str(body.get("kind") or "failed_scan")[:40],
         str(body.get("message") or body.get("detail") or "")[:300], path, device["id"], device["name"], db.now_iso()),
    )
    return {"ok": True}


@router.post("/api/public/kiosk/visitor")
async def kiosk_visitor(request: Request, x_device_key: str | None = Header(None)):
    device = resolve_device(request, x_device_key)
    body = await request.json()
    path = None
    data = decode_jpeg(body.get("snapshot"))
    if data:
        path = save_jpeg(os.path.join(db.SNAPSHOT_DIR, "visitors"), f"{int(time.time()*1000)}.jpg", data)
    visitor_id = db.new_id()
    db.run(
        "INSERT INTO visitor_logs (id, direction, snapshot_path, device_id, device_name,"
        " created_at) VALUES (?,?,?,?,?,?)",
        (visitor_id, body.get("direction"), path, device["id"], device["name"], db.now_iso()),
    )
    return {"ok": True, "id": visitor_id}


@router.post("/api/public/kiosk/door-command")
def kiosk_door_command(request: Request, x_device_key: str | None = Header(None)):
    device = resolve_device(request, x_device_key)
    db.touch_device(device["id"])
    key = door_command_key(device["id"])
    command = db.kv_get(key)
    if command:
        db.kv_set(key, None)
    settings = db.get_settings()
    return {"command": command, "door_enabled": settings.get("door_enabled", True)}


def door_command_key(device_id: str) -> str:
    return "door_command" if device_id == "local" else f"door_command:{device_id}"


def power_command_key(device_id: str) -> str:
    return "power_command" if device_id == "local" else f"power_command:{device_id}"


@router.post("/api/public/kiosk/power-command")
def kiosk_power_command(request: Request, x_device_key: str | None = Header(None)):
    device = resolve_device(request, x_device_key)
    settings = db.get_settings()
    key = power_command_key(device["id"])
    command = db.kv_get(key)
    if command:
        db.kv_set(key, None)
    # In CCTV mode the machine must stay awake so the camera keeps watching, so
    # sleep / shutdown requests are downgraded to blanking the monitor.
    cctv = bool(settings.get("cctv_always_on", True))
    if cctv and command and str(command.get("command")) in ("sleep", "shutdown"):
        command = {**command, "command": "screen_off"}
    minutes = rules.bangkok_minutes()
    weekday = rules.bangkok_weekday()

    screen_off_window = False
    start, end = settings.get("screen_off_start"), settings.get("screen_off_end")
    if settings.get("power_saving_enabled") and start and end:
        s, e = rules.time_to_minutes(start), rules.time_to_minutes(end)
        screen_off_window = (s <= minutes < e) if s < e else (minutes >= s or minutes < e)

    power_off_due = False
    if settings.get("auto_power_off_enabled"):
        if not settings.get("power_off_workdays_only") or rules.is_work_day(settings, weekday):
            power_off_due = minutes >= rules.time_to_minutes(settings.get("auto_power_off_time"))

    power_off_action = str(settings.get("auto_power_off_action") or "shutdown")
    if cctv and power_off_action in ("sleep", "shutdown"):
        power_off_action = "screen_off"

    return {
        "command": command,
        "settings": {
            "power_saving_enabled": settings.get("power_saving_enabled"),
            "screen_idle_minutes": settings.get("screen_idle_minutes"),
            "auto_power_off_action": settings.get("auto_power_off_action"),
        },
        "power_saving_enabled": settings.get("power_saving_enabled"),
        "screen_idle_minutes": settings.get("screen_idle_minutes"),
        "cctv_always_on": cctv,
        "screen_off_window": screen_off_window,
        "power_off_due": power_off_due,
        "power_off_action": power_off_action,
        "wake_mac": None,
    }


@router.get("/api/public/kiosk/recent")
def kiosk_recent():
    settings = db.get_settings()
    limit = min(max(int(settings.get("kiosk_recent_limit") or 20), 1), 50)
    display = {
        "show_recent": settings.get("kiosk_show_recent", True),
        "recent_limit": limit,
        "mirror": settings.get("kiosk_mirror", True),
        "rotate": int(settings.get("kiosk_camera_rotate") or 0) % 360,
        "show_clock": settings.get("kiosk_show_clock", True),
        "show_confidence": settings.get("kiosk_show_confidence", False),
        "news_enabled": settings.get("kiosk_news_enabled", False),
        "news_text": settings.get("kiosk_news_text") or "",
        "next_delay_seconds": settings.get("next_person_delay_seconds", 5),
        "voice_enabled": settings.get("voice_enabled", True),
        "voice_rate": settings.get("voice_rate", 1),
        "voice_volume": settings.get("voice_volume", 1),
        "live_view": settings.get("live_view_enabled", True),
    }
    today = rules.bangkok_date_iso()
    rows = db.query(
        "SELECT l.id, l.scanned_at, l.direction, l.snapshot_path, s.full_name, s.nickname,"
        " s.student_code, s.class_room, s.person_type, s.department, s.position, s.avatar_path"
        " FROM attendance_logs l LEFT JOIN students s ON s.id = l.student_id"
        " WHERE l.status = 'ok' AND date(l.scanned_at, '+7 hours') = ?"
        " ORDER BY l.scanned_at DESC LIMIT ?",
        (today, limit),
    )
    items = []
    for row in rows:
        staff = row.get("person_type") == "staff"
        detail = " • ".join(
            [p for p in [row.get("student_code"),
                         (" / ".join([x for x in [row.get("department"), row.get("position")] if x])
                          if staff else row.get("class_room"))] if p]
        )
        items.append({
            "id": row["id"],
            "name": row.get("full_name") or "ไม่ทราบชื่อ",
            "detail": detail,
            "role": "บุคลากร" if staff else "นักเรียน",
            "direction": "out" if row["direction"] == "out" else "in",
            "scanned_at": row["scanned_at"],
            "avatar_url": media_url(row.get("avatar_path")),
            "snapshot_url": media_url(row.get("snapshot_path")),
        })
    return {"items": items, "display": display, "school_name": settings.get("school_name"),
            "server_time": db.now_iso()}


def today_stats() -> dict:
    settings = db.get_settings()
    people = db.list_active_people()
    rows = db.query(
        "SELECT student_id, direction, scanned_at FROM attendance_logs"
        " WHERE status = 'ok' AND date(scanned_at, '+7 hours') = ? ORDER BY scanned_at",
        (rules.bangkok_date_iso(),),
    )
    late_limit = rules.late_limit(settings)
    first_in: dict[str, str] = {}
    left: set[str] = set()
    for row in rows:
        sid = row["student_id"]
        if not sid:
            continue
        if row["direction"] == "in":
            first_in.setdefault(sid, row["scanned_at"])
        else:
            left.add(sid)

    late = 0
    for stamp in first_in.values():
        try:
            hour = int(stamp[11:13]) + 7
            minute = int(stamp[14:16])
            if (hour % 24) * 60 + minute > late_limit:
                late += 1
        except Exception:  # noqa: BLE001
            pass

    minutes = rules.bangkok_minutes()
    is_workday = rules.is_work_day(settings, rules.bangkok_weekday())
    checkin_only = rules.is_checkin_only(settings)
    person_types = {person["id"]: person.get("person_type") for person in people}
    # Visitors are counted on their own and never mixed into school figures.
    people = [person for person in people if person.get("person_type") != "visitor"]
    students_present = sum(
        1 for person_id in first_in if person_types.get(person_id) not in ("staff", "visitor")
    )
    staff_present = sum(1 for person_id in first_in if person_types.get(person_id) == "staff")
    visitors_present = sum(1 for person_id in first_in if person_types.get(person_id) == "visitor")
    # Check-in only schools never close the scan window.
    checkin_closed = (
        False
        if checkin_only
        else minutes > rules.time_to_minutes(settings.get("checkin_end") or "10:00")
    )
    checkout_closed = (
        False
        if checkin_only
        else minutes > rules.time_to_minutes(settings.get("checkout_end") or "19:00")
    )
    return {
        "checkin_only": checkin_only,
        "idle_stats_minutes": int(settings.get("idle_stats_minutes") or 0),
        "school_name": settings.get("school_name"),
        "screensaver_mode": settings.get("screensaver_mode") or "stats",
        "people": len(people),
        "present": len(first_in),
        "students_present": students_present,
        "staff_present": staff_present,
        "visitors_present": visitors_present,
        "visitor_register_enabled": bool(settings.get("visitor_register_enabled")),
        "late": late,
        "on_time": len(first_in) - late,
        "absent": max(len(people) - len(first_in), 0) if is_workday else 0,
        "left": len(left),
        "checkin_closed": checkin_closed,
        "checkout_closed": checkout_closed,
        "windows_closed": checkin_closed and checkout_closed,
        "is_workday": is_workday,
        "server_time": db.now_iso(),
    }


@router.get("/api/public/visit/qr.svg")
def visit_qr(request: Request):
    """QR code of the visitor registration page, drawn offline as an SVG."""
    base = str(request.base_url).rstrip("/")
    url = f"{base}/visit"
    try:
        import io

        import qrcode
        import qrcode.image.svg as qrsvg

        img = qrcode.make(url, image_factory=qrsvg.SvgPathImage, box_size=12, border=2)
        buf = io.BytesIO()
        img.save(buf)
        return Response(
            content=buf.getvalue(),
            media_type="image/svg+xml",
            headers={"cache-control": "no-store"},
        )
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="ยังไม่รองรับการสร้าง QR code") from None


@router.get("/api/public/visit/status")
def visit_status():
    """Tells the visitor registration page whether the school is accepting visitors."""
    settings = db.get_settings()
    return {
        "enabled": bool(settings.get("visitor_register_enabled")),
        "school_name": settings.get("school_name"),
    }


@router.post("/api/public/visit/register")
async def visit_register(request: Request):
    """Self-service registration: a visitor fills the form and takes a photo."""
    settings = db.get_settings()
    if not settings.get("visitor_register_enabled"):
        raise HTTPException(status_code=403, detail="ยังไม่เปิดรับลงทะเบียนผู้มาเยือน")

    body = await request.json()
    full_name = (body.get("full_name") or "").strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อ-นามสกุล")
    data = decode_jpeg(body.get("photo"))
    if not data:
        raise HTTPException(status_code=400, detail="กรุณาถ่ายภาพใบหน้าให้ชัดเจน")
    if EMBEDDER is None:
        raise HTTPException(status_code=503, detail="ตัวประมวลผลใบหน้ายังไม่พร้อม กรุณารอสักครู่")
    try:
        result = EMBEDDER(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    today = rules.bangkok_date_iso()
    gender = body.get("gender")
    gender = gender if gender in ("male", "female") else None
    seq = db.one(
        "SELECT COUNT(*) AS n FROM students WHERE person_type = 'visitor' AND visit_date = ?",
        (today,),
    )
    code = f"V{today.replace('-', '')[2:]}-{int((seq or {}).get('n', 0)) + 1:03d}"
    person_id = db.new_id()
    now = db.now_iso()
    db.run(
        "INSERT INTO students (id, student_code, full_name, nickname, class_room, guardian_phone,"
        " gender, person_type, department, position, avatar_path, is_active, created_at, updated_at,"
        " visit_reason, visit_date) VALUES (?,?,?,NULL,NULL,NULL,?,'visitor',?,NULL,NULL,1,?,?,?,?)",
        (person_id, code, full_name, gender, (body.get("affiliation") or "").strip() or None,
         now, now, (body.get("reason") or "").strip() or None, today),
    )
    avatar = save_jpeg(db.AVATAR_DIR, f"{person_id}.jpg", data)
    db.run("UPDATE students SET avatar_path = ? WHERE id = ?", (avatar, person_id))
    face_id = db.new_id()
    path = save_jpeg(db.FACE_DIR, f"{face_id}.jpg", data)
    db.run(
        "INSERT INTO student_faces (id, student_id, image_path, source, embedding, geometry,"
        " quality, status, processed_at, created_at) VALUES (?,?,?,'visitor',?,?,?,'ready',?,?)",
        (face_id, person_id, path, json.dumps(result["embedding"]),
         json.dumps(result.get("geometry")) if result.get("geometry") else None,
         result.get("quality"), now, now),
    )
    db.add_audit("ลงทะเบียนผู้มาเยือน", person_id, full_name)
    return {"ok": True, "code": code, "full_name": full_name, "valid_date": today}


@router.get("/api/local/visitor-people")
def visitor_people(x_local_token: str | None = Header(None)):
    """Visitor dashboard: everybody who registered through the QR code."""
    require_admin(x_local_token)
    rows = db.query(
        "SELECT s.id, s.student_code, s.full_name, s.gender, s.department, s.visit_reason,"
        " s.visit_date, s.created_at, s.avatar_path,"
        " (SELECT MIN(scanned_at) FROM attendance_logs l WHERE l.student_id = s.id"
        "   AND l.status = 'ok' AND l.direction = 'in') AS entered_at,"
        " (SELECT MAX(scanned_at) FROM attendance_logs l WHERE l.student_id = s.id"
        "   AND l.status = 'ok' AND l.direction = 'out') AS left_at"
        " FROM students s WHERE s.person_type = 'visitor'"
        " ORDER BY s.created_at DESC LIMIT 500"
    )
    today = rules.bangkok_date_iso()
    return {
        "today": today,
        "enabled": bool(db.get_settings().get("visitor_register_enabled")),
        "items": [{**r, "avatar_url": media_url(r.get("avatar_path"))} for r in rows],
    }


@router.get("/api/public/kiosk/today-stats")
@router.post("/api/public/kiosk/today-stats")
def kiosk_today_stats():
    return today_stats()


@router.get("/api/public/agent/manifest.json")
def agent_manifest():
    """Standalone installs never auto-update from a server."""
    return {"appVersion": "standalone", "baseUrl": "", "files": {}}


# ------------------------------------------------------------- admin: people


@router.get("/api/local/people")
def people_list(x_local_token: str | None = Header(None), q: str = ""):
    require_admin(x_local_token)
    like = f"%{q.strip()}%"
    rows = db.query(
        "SELECT * FROM students WHERE (? = '' OR full_name LIKE ? OR student_code LIKE ?"
        " OR IFNULL(class_room,'') LIKE ?) ORDER BY full_name LIMIT 500",
        (q.strip(), like, like, like),
    )
    counts = {
        r["student_id"]: r["n"]
        for r in db.query("SELECT student_id, COUNT(*) AS n FROM student_faces GROUP BY student_id")
    }
    return {"items": [
        {**r, "is_active": bool(r["is_active"]), "faces": counts.get(r["id"], 0),
         "avatar_url": media_url(r["avatar_path"])}
        for r in rows
    ]}


@router.post("/api/local/people")
async def people_save(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    person_id = body.get("id")
    fields = {
        "student_code": str(body.get("student_code") or "").strip(),
        "full_name": str(body.get("full_name") or "").strip(),
        "nickname": (body.get("nickname") or None),
        "class_room": (body.get("class_room") or None),
        "guardian_phone": (body.get("guardian_phone") or None),
        "gender": body.get("gender") if body.get("gender") in ("male", "female", "unspecified") else "unspecified",
        "person_type": "staff" if body.get("person_type") == "staff" else "student",
        "department": (body.get("department") or None),
        "position": (body.get("position") or None),
        "is_active": 1 if body.get("is_active", True) else 0,
    }
    if not fields["student_code"] or not fields["full_name"]:
        raise HTTPException(status_code=400, detail="กรุณากรอกรหัสและชื่อ-นามสกุล")

    if person_id:
        db.run(
            "UPDATE students SET student_code=?, full_name=?, nickname=?, class_room=?,"
            " guardian_phone=?, gender=?, person_type=?, department=?, position=?, is_active=?, updated_at=?"
            " WHERE id=?",
            (*fields.values(), db.now_iso(), person_id),
        )
        db.add_audit("แก้ไขข้อมูลบุคคล", person_id, fields["full_name"])
    else:
        exists = db.one("SELECT id FROM students WHERE student_code = ?", (fields["student_code"],))
        if exists:
            person_id = exists["id"]
            db.run(
                "UPDATE students SET full_name=?, nickname=?, class_room=?, guardian_phone=?, gender=?,"
                " person_type=?, department=?, position=?, is_active=?, updated_at=? WHERE id=?",
                (fields["full_name"], fields["nickname"], fields["class_room"],
                 fields["guardian_phone"], fields["gender"], fields["person_type"], fields["department"],
                 fields["position"], fields["is_active"], db.now_iso(), person_id),
            )
        else:
            person_id = db.new_id()
            db.run(
                "INSERT INTO students (id, student_code, full_name, nickname, class_room,"
                " guardian_phone, gender, person_type, department, position, is_active, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (person_id, *fields.values(), db.now_iso(), db.now_iso()),
            )
            db.add_audit("เพิ่มบุคคลใหม่", person_id, fields["full_name"])
    return {"id": person_id}


@router.delete("/api/local/people/{person_id}")
def people_delete(person_id: str, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    db.run("DELETE FROM student_faces WHERE student_id = ?", (person_id,))
    db.run("DELETE FROM students WHERE id = ?", (person_id,))
    db.add_audit("ลบบุคคลออกจากระบบ", person_id)
    return {"ok": True}


@router.get("/api/local/people/{person_id}/faces")
def faces_list(person_id: str, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    rows = db.query(
        "SELECT id, image_path, source, status, quality, created_at FROM student_faces"
        " WHERE student_id = ? ORDER BY created_at DESC",
        (person_id,),
    )
    return {"items": [{**r, "url": media_url(r["image_path"])} for r in rows]}


@router.post("/api/local/people/{person_id}/faces")
async def faces_add(person_id: str, request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    if not person_row(person_id):
        raise HTTPException(status_code=404, detail="ไม่พบบุคคลนี้")
    body = await request.json()
    data = decode_jpeg(body.get("image"))
    if not data:
        raise HTTPException(status_code=400, detail="รูปภาพไม่ถูกต้อง")
    if EMBEDDER is None:
        raise HTTPException(status_code=503, detail="ตัวประมวลผลใบหน้ายังไม่พร้อม กรุณารอสักครู่")

    try:
        result = EMBEDDER(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    face_id = db.new_id()
    path = save_jpeg(db.FACE_DIR, f"{face_id}.jpg", data)
    db.run(
        "INSERT INTO student_faces (id, student_id, image_path, source, embedding, geometry,"
        " quality, status, processed_at, created_at) VALUES (?,?,?,?,?,?,?,'ready',?,?)",
        (face_id, person_id, path, body.get("source") or "upload",
         json.dumps(result["embedding"]),
         json.dumps(result.get("geometry")) if result.get("geometry") else None,
         result.get("quality"), db.now_iso(), db.now_iso()),
    )

    person = person_row(person_id)
    if person and not person["avatar_path"]:
        avatar = save_jpeg(db.AVATAR_DIR, f"{person_id}.jpg", data)
        db.run("UPDATE students SET avatar_path = ? WHERE id = ?", (avatar, person_id))

    db.add_audit("ลงทะเบียนใบหน้า", person_id, f"คุณภาพ {result.get('quality')}")
    return {"id": face_id, "quality": result.get("quality"), "url": media_url(path)}


@router.delete("/api/local/faces/{face_id}")
def faces_delete(face_id: str, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    row = db.one("SELECT image_path FROM student_faces WHERE id = ?", (face_id,))
    db.run("DELETE FROM student_faces WHERE id = ?", (face_id,))
    if row:
        try:
            os.remove(os.path.join(db.DATA_DIR, row["image_path"]))
        except OSError:
            pass
    db.add_audit("ลบภาพใบหน้า", face_id)
    return {"ok": True}


# --------------------------------------------------------- admin: attendance


@router.get("/api/local/attendance")
def attendance_list(x_local_token: str | None = Header(None), start: str = "", end: str = "",
                    q: str = ""):
    require_admin(x_local_token)
    start = start or rules.bangkok_date_iso()
    end = end or rules.bangkok_date_iso()
    like = f"%{q.strip()}%"
    rows = db.query(
        "SELECT l.id, l.scanned_at, l.direction, l.status, l.confidence, l.snapshot_path,"
        " l.device_name,"
        " s.full_name, s.student_code, s.class_room, s.person_type FROM attendance_logs l"
        " LEFT JOIN students s ON s.id = l.student_id"
        " WHERE l.status NOT IN ('duplicate','out_of_window')"
        " AND date(l.scanned_at, '+7 hours') BETWEEN ? AND ?"
        " AND (? = '' OR s.full_name LIKE ? OR s.student_code LIKE ?)"
        " ORDER BY l.scanned_at DESC LIMIT 2000",
        (start, end, q.strip(), like, like),
    )
    return {"items": [{**r, "snapshot_url": media_url(r["snapshot_path"])} for r in rows],
            "start": start, "end": end}


@router.delete("/api/local/attendance/{log_id}")
def attendance_delete(log_id: str, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    db.run("DELETE FROM attendance_logs WHERE id = ?", (log_id,))
    db.add_audit("ลบประวัติการสแกน", log_id)
    return {"ok": True}


@router.get("/api/local/report")
def report(x_local_token: str | None = Header(None), start: str = "", end: str = "",
           q: str = "", group: str = "all", class_room: str = ""):
    require_admin(x_local_token)
    start = start or rules.bangkok_date_iso()
    end = end or rules.bangkok_date_iso()
    try:
        start_date = dt.date.fromisoformat(start)
        end_date = dt.date.fromisoformat(end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="รูปแบบวันที่ไม่ถูกต้อง") from exc
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น")
    if (end_date - start_date).days > 366:
        raise HTTPException(status_code=400, detail="เลือกช่วงเวลาได้ไม่เกิน 1 ปี")
    settings = db.get_settings()
    late_limit = rules.late_limit(settings)
    work_days = rules.parse_work_days(settings.get("work_days"))
    counted_days: list[str] = []
    cursor = start_date
    while cursor <= end_date:
        weekday = (cursor.weekday() + 1) % 7
        if not settings.get("block_non_work_days") or weekday in work_days:
            counted_days.append(cursor.isoformat())
        cursor += dt.timedelta(days=1)

    local_tz = dt.timezone(dt.timedelta(hours=7))
    utc = dt.timezone.utc
    start_utc = dt.datetime.combine(start_date, dt.time.min, local_tz).astimezone(utc).isoformat()
    end_exclusive = dt.datetime.combine(end_date + dt.timedelta(days=1), dt.time.min, local_tz).astimezone(utc).isoformat()
    rows = db.query(
        "SELECT date(scanned_at, '+7 hours') AS day, student_id, MIN(scanned_at) AS scanned_at"
        " FROM attendance_logs WHERE status = 'ok' AND direction = 'in'"
        " AND scanned_at >= ? AND scanned_at < ? GROUP BY day, student_id ORDER BY day",
        (start_utc, end_exclusive),
    )
    # Visitors have their own dashboard and never appear in school reports.
    people = [p for p in db.list_active_people() if (p.get("person_type") or "") != "visitor"]
    term = q.strip().casefold()
    filtered = []
    for person in people:
        person_group = person.get("person_type") or "student"
        place = person.get("department") if person_group == "staff" else person.get("class_room")
        haystack = " ".join(str(person.get(k) or "") for k in ("student_code", "full_name", "class_room", "department")).casefold()
        if group in ("student", "staff") and person_group != group:
            continue
        if class_room and (place or "") != class_room:
            continue
        if term and term not in haystack:
            continue
        filtered.append(person)

    allowed_ids = {person["id"] for person in filtered}
    day_seen: dict[str, set[str]] = {day: set() for day in counted_days}
    day_late: dict[str, int] = {day: 0 for day in counted_days}
    per_person = {
        person["id"]: {
            "id": person["id"], "name": person.get("full_name") or "",
            "code": person.get("student_code") or "", "person_type": person.get("person_type") or "student",
            "class_room": person.get("department") if person.get("person_type") == "staff" else person.get("class_room"),
            "present": 0, "late": 0,
        }
        for person in filtered
    }
    for row in rows:
        if row["day"] not in day_seen or row["student_id"] not in allowed_ids:
            continue
        day_seen[row["day"]].add(row["student_id"])
        hour = (int(row["scanned_at"][11:13]) + 7) % 24
        minute = int(row["scanned_at"][14:16])
        late = hour * 60 + minute > late_limit
        if late:
            day_late[row["day"]] += 1
        person = per_person[row["student_id"]]
        person["present"] += 1
        person["late"] += 1 if late else 0

    day_list = [
        {"date": day, "present": len(day_seen[day]), "late": day_late[day],
         "absent": max(len(filtered) - len(day_seen[day]), 0)}
        for day in counted_days
    ]
    persons = list(per_person.values())
    for person in persons:
        person["absent"] = max(len(counted_days) - person["present"], 0)
        person["rate"] = round(person["present"] * 100 / len(counted_days)) if counted_days else 0
    persons.sort(key=lambda p: (p["rate"], -p["absent"], p["name"]))
    options = sorted({
        (person.get("department") if person.get("person_type") == "staff" else person.get("class_room")) or ""
        for person in people
    } - {""})
    total_late = sum(person["late"] for person in persons)
    total_absent = sum(person["absent"] for person in persons)
    average_rate = round(sum(person["rate"] for person in persons) / len(persons)) if persons else 0
    return {"start": start, "end": end, "people": len(filtered), "working_days": len(counted_days),
            "average_rate": average_rate, "total_late": total_late, "total_absent": total_absent,
            "days": day_list, "persons": persons, "class_options": options}


def _gender_counts():
    return {"male": 0, "female": 0, "unspecified": 0, "all": 0}


@router.get("/api/local/report/class")
def class_report(x_local_token: str | None = Header(None), date: str = ""):
    require_admin(x_local_token)
    date = date or rules.bangkok_date_iso()
    settings = db.get_settings()
    late_limit = rules.late_limit(settings)
    people = db.query(
        "SELECT id, student_code, full_name, IFNULL(NULLIF(class_room,''),'ไม่ระบุชั้น') AS class_room,"
        " CASE WHEN gender IN ('male','female') THEN gender ELSE 'unspecified' END AS gender"
        " FROM students WHERE is_active = 1 AND person_type = 'student'"
        " ORDER BY class_room, full_name"
    )
    scans = db.query(
        "SELECT student_id, MIN(scanned_at) AS scanned_at FROM attendance_logs"
        " WHERE direction = 'in' AND status = 'ok' AND date(scanned_at, '+7 hours') = ?"
        " GROUP BY student_id", (date,)
    )
    first_scan = {row["student_id"]: row["scanned_at"] for row in scans}
    rooms = {}
    absent_people = []
    for person in people:
        room = rooms.setdefault(person["class_room"], {
            "class_room": person["class_room"], "total": _gender_counts(),
            "present": _gender_counts(), "late": _gender_counts(),
            "absent": _gender_counts(),
        })
        gender = person["gender"]
        for key in (gender, "all"):
            room["total"][key] += 1
        scan = first_scan.get(person["id"])
        bucket = "present" if scan else "absent"
        for key in (gender, "all"):
            room[bucket][key] += 1
        if scan:
            hour = (int(scan[11:13]) + 7) % 24
            minute = int(scan[14:16])
            if hour * 60 + minute > late_limit:
                for key in (gender, "all"):
                    room["late"][key] += 1
        else:
            absent_people.append({k: person[k] for k in
                                  ("student_code", "full_name", "class_room", "gender")})

    classes = sorted(rooms.values(), key=lambda item: item["class_room"])
    totals = {name: _gender_counts() for name in ("total", "present", "late", "absent")}
    for room in classes:
        room["rate"] = round(room["present"]["all"] * 100 / room["total"]["all"])
        for name in totals:
            for gender in totals[name]:
                totals[name][gender] += room[name][gender]
    total_count = totals["total"]["all"]
    totals["rate"] = round(totals["present"]["all"] * 100 / total_count) if total_count else 0
    content = db.get_content()
    return {"date": date, "school_name": content.get("school_name") or "โรงเรียนของเรา",
            "classes": classes, "totals": totals, "absent_people": absent_people}


# ----------------------------------------------------------- admin: settings


@router.get("/api/local/settings")
def settings_get(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    return {"settings": db.get_settings(), "data_dir": db.DATA_DIR}


@router.post("/api/local/settings")
async def settings_post(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    before = db.get_settings()
    settings = db.save_settings(body if isinstance(body, dict) else {})
    db.add_audit("แก้ไขการตั้งค่าระบบ", "settings")
    # The program already answers the school LAN whenever it starts, so no
    # restart is needed when this switch changes.
    return {"settings": settings, "restarting": False}


@router.get("/api/local/devices")
def devices_list(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    settings = db.get_settings()
    items = [{**device, "online": seen_recently(device.get("last_seen"))}
             for device in db.list_devices()]
    port = int(settings.get("lan_port") or 8899)
    return {
        "items": items,
        "lan_enabled": bool(settings.get("lan_enabled")),
        "lan_port": port,
        "addresses": [f"http://{addr}:{port}" for addr in lan_addresses()],
        "hub": dict(db.HUB_DEVICE),
    }


@router.post("/api/local/devices")
async def devices_save(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    device_id = body.get("id")
    if device_id:
        db.update_device(str(device_id), body)
        db.add_audit("แก้ไขตู้สแกนในวง LAN", str(device_id), str(body.get("name") or ""))
        return {"id": device_id}
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="กรุณาตั้งชื่อตู้สแกน")
    device = db.create_device(name, str(body.get("direction") or "auto"), body.get("location"))
    db.add_audit("เพิ่มตู้สแกนในวง LAN", device.get("id"), name)
    return {"device": device}


@router.post("/api/local/devices/{device_id}/key")
def devices_rotate(device_id: str, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    key = db.rotate_device_key(device_id)
    db.add_audit("เปลี่ยนรหัสเชื่อมต่อตู้สแกน", device_id)
    return {"device_key": key}


@router.delete("/api/local/devices/{device_id}")
def devices_delete(device_id: str, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    db.delete_device(device_id)
    db.add_audit("ลบตู้สแกนในวง LAN", device_id)
    return {"ok": True}


@router.post("/api/local/door/command")
async def door_command(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    action = body.get("action")
    if action not in ("open", "close", "deny"):
        raise HTTPException(status_code=400, detail="คำสั่งไม่ถูกต้อง")
    device_id = str(body.get("device_id") or "local")
    db.kv_set(door_command_key(device_id), {"id": db.new_id(), "action": action,
                                            "seconds": body.get("seconds") or 5})
    return {"ok": True}


@router.post("/api/local/power/command")
async def power_command(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    action = body.get("action")
    if action not in ("screen_off", "screen_on", "sleep", "shutdown", "cancel"):
        raise HTTPException(status_code=400, detail="คำสั่งไม่ถูกต้อง")
    device_id = str(body.get("device_id") or "local")
    db.kv_set(power_command_key(device_id), {"id": db.new_id(), "command": action})
    return {"ok": True}


@router.get("/api/local/audit")
def audit_list(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    return {"items": db.query(
        "SELECT actor_email, action, target, detail, created_at FROM audit_logs"
        " ORDER BY created_at DESC LIMIT 200"
    )}


@router.get("/api/local/overview")
def overview(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    stats = today_stats()
    faces = db.one("SELECT COUNT(*) AS n FROM student_faces WHERE embedding IS NOT NULL")
    total, used, free = shutil.disk_usage(db.DATA_DIR)
    return {
        "stats": stats,
        "faces": (faces or {}).get("n", 0),
        "data_dir": db.DATA_DIR,
        "disk_free_mb": int(free / (1024 * 1024)),
        "db_size_mb": round(os.path.getsize(db.DB_PATH) / (1024 * 1024), 1)
        if os.path.exists(db.DB_PATH) else 0,
    }


# ------------------------------------------------------------ backup/restore


@router.get("/api/local/backup")
def backup(x_local_token: str | None = Header(None), token: str = ""):
    require_admin(x_local_token or token)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(db.DATA_DIR):
            for name in files:
                if name.endswith(("-wal", "-shm")):
                    continue
                full = os.path.join(root, name)
                zf.write(full, os.path.relpath(full, db.DATA_DIR))
    db.add_audit("สำรองข้อมูล", "backup")
    stamp = time.strftime("%Y%m%d-%H%M")
    return Response(
        buffer.getvalue(),
        media_type="application/zip",
        headers={"content-disposition": f'attachment; filename="FaceGate-Backup-{stamp}.zip"'},
    )


@router.post("/api/local/restore")
async def restore(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="ไม่พบไฟล์สำรอง")
    try:
        with zipfile.ZipFile(io.BytesIO(body)) as zf:
            names = zf.namelist()
            if "facegate.db" not in names:
                raise HTTPException(status_code=400, detail="ไฟล์นี้ไม่ใช่ไฟล์สำรองของ FaceGate")
            zf.extractall(db.DATA_DIR)
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="ไฟล์สำรองเสียหาย") from exc
    return {"ok": True, "restart_required": True}



# ------------------------------------------------------- admin: bulk import


@router.post("/api/local/people/import")
async def people_import(request: Request, x_local_token: str | None = Header(None)):
    """Adds or updates many people at once (name + class + code in one go)."""
    require_admin(x_local_token)
    body = await request.json()
    rows = body.get("rows") if isinstance(body, dict) else None
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="ไม่พบรายชื่อที่จะนำเข้า")

    added = updated = skipped = 0
    errors: list[str] = []
    for index, row in enumerate(rows[:5000], start=1):
        code = str((row or {}).get("student_code") or "").strip()
        name = str((row or {}).get("full_name") or "").strip()
        if not code or not name:
            skipped += 1
            if len(errors) < 10:
                errors.append(f"บรรทัดที่ {index}: ไม่มีรหัสหรือชื่อ")
            continue
        values = (
            name,
            (row.get("nickname") or None),
            (row.get("class_room") or None),
            (row.get("guardian_phone") or None),
            row.get("gender") if row.get("gender") in ("male", "female", "unspecified") else "unspecified",
            "staff" if row.get("person_type") == "staff" else "student",
            (row.get("department") or None),
            (row.get("position") or None),
        )
        exists = db.one("SELECT id FROM students WHERE student_code = ?", (code,))
        if exists:
            db.run(
                "UPDATE students SET full_name=?, nickname=?, class_room=?, guardian_phone=?, gender=?,"
                " person_type=?, department=?, position=?, is_active=1, updated_at=? WHERE id=?",
                (*values, db.now_iso(), exists["id"]),
            )
            updated += 1
        else:
            db.run(
                "INSERT INTO students (id, student_code, full_name, nickname, class_room,"
                " guardian_phone, gender, person_type, department, position, is_active, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (db.new_id(), code, *values, db.now_iso(), db.now_iso()),
            )
            added += 1

    db.add_audit("นำเข้ารายชื่อ", "import", f"เพิ่ม {added} แก้ไข {updated} ข้าม {skipped}")
    return {"added": added, "updated": updated, "skipped": skipped, "errors": errors}


@router.get("/api/local/classes")
def class_list(x_local_token: str | None = Header(None)):
    """Distinct class/department values, for the filter dropdowns."""
    require_admin(x_local_token)
    rows = db.query(
        "SELECT DISTINCT IFNULL(NULLIF(class_room,''), NULLIF(department,'')) AS name"
        " FROM students WHERE is_active = 1 ORDER BY name"
    )
    return {"items": [r["name"] for r in rows if r["name"]]}


# ---------------------------------------------------- admin: look and feel


@router.get("/api/local/content")
def content_get(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    content = db.get_content()
    return {"content": {**content, "logo_url": media_url(content.get("logo_path"))}}


@router.post("/api/local/content")
async def content_post(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    logo = body.pop("logo_image", None) if isinstance(body, dict) else None
    if logo:
        data = decode_jpeg(logo)
        if data:
            body["logo_path"] = save_jpeg(db.AVATAR_DIR, "brand-logo.jpg", data)
    content = db.save_content(body if isinstance(body, dict) else {})
    db.add_audit("แก้ไขเนื้อหาและธีม", "content")
    return {"content": {**content, "logo_url": media_url(content.get("logo_path"))}}


@router.get("/api/public/kiosk/content")
def kiosk_content(request: Request, x_device_key: str | None = Header(None)):
    """Branding the offline kiosk screen reads on every refresh."""
    content = db.get_content()
    settings = db.get_settings()
    try:
        device = resolve_device(request, x_device_key)
    except HTTPException:
        device = dict(db.HUB_DEVICE)
    return {**content, "logo_url": media_url(content.get("logo_path")),
            "school_name": settings.get("school_name"),
            "device_name": device["name"],
            "device_direction": device.get("direction") or "auto"}


# ------------------------------------------------------- live camera view


# Kept in memory only: the last small preview frame each kiosk sent, so the
# admin can watch the queue over the school LAN without storing video.
LIVE_FRAMES: dict[str, dict] = {}
# While someone watches the live page we ask kiosks for many more frames per
# second, so the picture moves like a CCTV feed instead of a slideshow.
LIVE_WATCH: dict[str, float] = {}


def live_watched(device_id: str) -> bool:
    now = time.time()
    return any(seen > now - 6 for key, seen in LIVE_WATCH.items()
               if key in ("*", device_id))


def frame_jpeg(frame: dict) -> bytes | None:
    raw = str(frame.get("image") or "")
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw)
    except Exception:
        return None


@router.post("/api/public/kiosk/live")
async def kiosk_live_frame(request: Request, x_device_key: str | None = Header(None)):
    """A kiosk posts a small preview image; faster while someone is watching."""
    device = resolve_device(request, x_device_key)
    body = await request.json()
    image = str(body.get("image") or "")
    if not image:
        raise HTTPException(status_code=400, detail="ไม่มีภาพ")
    if len(image) > 400_000:
        raise HTTPException(status_code=413, detail="ภาพใหญ่เกินไป")
    LIVE_FRAMES[device["id"]] = {
        "device_id": device["id"],
        "device_name": device["name"],
        "image": image,
        "status": str(body.get("status") or "")[:160],
        "faces": int(body.get("faces") or 0),
        "at": db.now_iso(),
        "seq": int(time.time() * 1000),
    }
    if len(LIVE_FRAMES) > 24:
        oldest = sorted(LIVE_FRAMES.items(), key=lambda kv: kv[1]["at"])[0][0]
        LIVE_FRAMES.pop(oldest, None)
    watched = live_watched(device["id"])
    return {"ok": True, "watch": watched, "interval_ms": 120 if watched else 2000}


@router.get("/api/local/live")
def live_frames(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    # Watching this page is enough to ask the kiosks for many frames a second,
    # even before a picture arrives, so the first view is already moving.
    LIVE_WATCH["*"] = time.time()
    now_ms = time.time() * 1000
    frames = [
        {**{k: v for k, v in frame.items() if k != "image"},
         "has_image": bool(frame.get("image")),
         "age_seconds": max(0, int((now_ms - float(frame.get("seq") or 0)) / 1000)),
         "online": seen_recently(frame.get("at"), 15)}
        for frame in sorted(LIVE_FRAMES.values(), key=lambda f: f["device_name"])
    ]
    # Always list this PC and every registered kiosk, so staff see a panel with
    # the reason instead of an empty page while a kiosk is still starting up.
    known = {frame["device_id"] for frame in frames}
    for device in [dict(db.HUB_DEVICE), *db.list_devices()]:
        if device["id"] in known:
            continue
        frames.append({
            "device_id": device["id"],
            "device_name": device.get("name") or "ตู้สแกน",
            "status": "", "faces": 0, "at": "", "seq": 0,
            "has_image": False, "online": False,
        })
    recent = db.query(
        "SELECT l.scanned_at, l.direction, l.status, l.device_name, s.full_name, s.class_room"
        " FROM attendance_logs l LEFT JOIN students s ON s.id = l.student_id"
        " ORDER BY l.scanned_at DESC LIMIT 10",
    )
    return {
        "frames": frames,
        "recent": recent,
        "enabled": bool(db.get_settings().get("live_view_enabled", True)),
    }


@router.get("/api/local/live/frame")
def live_frame_jpeg(device: str, token: str = "",
                    x_local_token: str | None = Header(None)):
    """One fresh picture of a kiosk.

    Some browsers and phones refuse the continuous stream, so the live page
    falls back to asking for single pictures very quickly instead. Nothing is
    written to disk either way.
    """
    require_admin(token or x_local_token)
    LIVE_WATCH[device or "*"] = time.time()
    frame = LIVE_FRAMES.get(device)
    data = frame_jpeg(frame) if frame else None
    if not data:
        raise HTTPException(status_code=404, detail="ยังไม่มีภาพจากตู้สแกนนี้")
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


@router.get("/api/local/live/stream")
async def live_stream(device: str, token: str = "",
                      x_local_token: str | None = Header(None)):
    """Continuous moving picture of one kiosk, like a CCTV/RTSP view.

    An image tag cannot send headers, so the admin token may arrive in the
    query string. Frames pass straight through; nothing is written to disk.
    """
    require_admin(token or x_local_token)
    boundary = "facegateframe"

    async def frames():
        last_seq, idle = 0, 0
        while True:
            LIVE_WATCH[device or "*"] = time.time()
            frame = LIVE_FRAMES.get(device)
            data = frame_jpeg(frame) if frame else None
            if frame and data and frame.get("seq", 0) != last_seq:
                last_seq, idle = frame.get("seq", 0), 0
                yield (b"--" + boundary.encode() + b"\r\n"
                       b"Content-Type: image/jpeg\r\n"
                       b"Content-Length: " + str(len(data)).encode() + b"\r\n\r\n"
                       + data + b"\r\n")
            else:
                idle += 1
                if idle > 3000:
                    break
            await asyncio.sleep(0.06)

    return StreamingResponse(
        frames(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------- admin: certificate & logs


@router.get("/api/local/certificate")
def certificate(person_id: str, x_local_token: str | None = Header(None), start: str = "",
                end: str = ""):
    require_admin(x_local_token)
    person = person_row(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="ไม่พบบุคคลนี้")
    start = start or rules.bangkok_date_iso()
    end = end or rules.bangkok_date_iso()
    settings = db.get_settings()
    late_limit = rules.late_limit(settings)
    rows = db.query(
        "SELECT date(scanned_at, '+7 hours') AS day, scanned_at FROM attendance_logs"
        " WHERE student_id = ? AND status = 'ok' AND direction = 'in'"
        " AND date(scanned_at, '+7 hours') BETWEEN ? AND ? ORDER BY scanned_at",
        (person_id, start, end),
    )
    seen: dict[str, bool] = {}
    for row in rows:
        if row["day"] in seen:
            continue
        hour = (int(row["scanned_at"][11:13]) + 7) % 24
        minute = int(row["scanned_at"][14:16])
        seen[row["day"]] = hour * 60 + minute > late_limit

    work_days = rules.parse_work_days(settings.get("work_days"))
    import datetime as _dt

    d0 = _dt.date.fromisoformat(start)
    d1 = _dt.date.fromisoformat(end)
    working = 0
    day = d0
    while day <= d1:
        if not settings.get("block_non_work_days") or ((day.weekday() + 1) % 7) in work_days:
            working += 1
        day += _dt.timedelta(days=1)

    present = len(seen)
    late = sum(1 for v in seen.values() if v)
    return {
        "person": dict(person),
        "start": start,
        "end": end,
        "working_days": working,
        "present": present,
        "late": late,
        "on_time": present - late,
        "absent": max(working - present, 0),
        "percent": round(present / working * 100, 1) if working else 0,
        "content": db.get_content(),
    }


@router.get("/api/local/visitors")
def visitors_list(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    rows = db.query(
        "SELECT id, direction, snapshot_path, created_at FROM visitor_logs"
        " ORDER BY created_at DESC LIMIT 200"
    )
    alerts = db.query(
        "SELECT id, kind, detail, snapshot_path, created_at FROM security_alerts"
        " ORDER BY created_at DESC LIMIT 200"
    )
    return {
        "visitors": [{**r, "snapshot_url": media_url(r["snapshot_path"])} for r in rows],
        "alerts": [{**r, "snapshot_url": media_url(r["snapshot_path"])} for r in alerts],
    }


@router.post("/api/local/cleanup")
def cleanup(x_local_token: str | None = Header(None)):
    """Deletes old scan photos and old scan history, per the retention settings."""
    require_admin(x_local_token)
    settings = db.get_settings()
    photo_days = int(settings.get("snapshot_retention_days") or 90)
    log_days = int(settings.get("retention_days") or 365)

    old_shots = db.query(
        "SELECT id, snapshot_path FROM attendance_logs WHERE snapshot_path IS NOT NULL"
        f" AND scanned_at < datetime('now', '-{photo_days} days')"
    )
    removed_photos = 0
    for row in old_shots:
        try:
            os.remove(os.path.join(db.DATA_DIR, row["snapshot_path"]))
        except OSError:
            pass
        db.run("UPDATE attendance_logs SET snapshot_path = NULL WHERE id = ?", (row["id"],))
        removed_photos += 1

    old_logs = db.one(
        "SELECT COUNT(*) AS n FROM attendance_logs"
        f" WHERE scanned_at < datetime('now', '-{log_days} days')"
    )
    db.run(f"DELETE FROM attendance_logs WHERE scanned_at < datetime('now', '-{log_days} days')")
    db.add_audit("ล้างข้อมูลเก่า", "cleanup", f"รูป {removed_photos} ประวัติ {(old_logs or {}).get('n', 0)}")
    return {"removed_photos": removed_photos, "removed_logs": (old_logs or {}).get("n", 0)}


# --------------------------------------------------------------------- voice


@router.post("/api/public/kiosk/tts")
async def kiosk_tts(request: Request):
    """Thai speech for one sentence: stored clip, online voice, or PC voice."""
    body = await request.json()
    text = str(body.get("text") or "").strip()[:300]
    if not text:
        return json_error(400, "ไม่มีข้อความให้อ่าน")
    clip = await run_in_threadpool(local_voice.synthesize, text)
    if not clip:
        return json_error(503, "เครื่องนี้ยังไม่มีเสียงพูดไทยที่ใช้ได้")
    audio, media_type = clip
    return Response(
        content=audio,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/api/public/kiosk/voice-status")
def kiosk_voice_status():
    return {"engine_available": local_voice.available(), **local_voice.status()}


@router.get("/api/local/voice/status")
def voice_status(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    return local_voice.status()


@router.post("/api/local/voice/prepare")
async def voice_prepare(x_local_token: str | None = Header(None)):
    """Stores every spoken sentence so the kiosk speaks Thai without internet."""
    require_admin(x_local_token)
    result = await run_in_threadpool(local_voice.prepare_offline_voice)
    db.add_audit(
        "เตรียมเสียงพูดไทยไว้ใช้ออฟไลน์",
        "voice",
        f"ดาวน์โหลด {result.get('downloaded', 0)} / ทั้งหมด {result.get('total', 0)}",
    )
    return result


@router.post("/api/local/voice/clear-cache")
def voice_clear_cache(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    return {"removed": local_voice.clear_cache(), **local_voice.status()}


# ------------------------------------------------------------------- screens



@router.get("/health")
def local_health():
    return {"standalone": True, "data_dir": db.DATA_DIR, "admin_configured": db.admin_configured()}



def json_error(status: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status)


def html(page: str) -> HTMLResponse:
    return HTMLResponse(page)
