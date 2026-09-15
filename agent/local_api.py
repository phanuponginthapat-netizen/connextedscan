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

import base64
import io
import json
import os
import secrets
import shutil
import time
import zipfile
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response

import localdb as db
import local_rules as rules

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
async def kiosk_sync(request: Request):
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
        "device": {"id": "local", "name": "ตู้สแกนในเครื่อง", "default_direction": "auto"},
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
async def kiosk_embeddings(request: Request):
    """The agent sends back embeddings it computed for newly registered photos."""
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
async def kiosk_attendance(request: Request):
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

    if not rules.is_work_day(settings, weekday):
        return {
            "result": "denied",
            "message": "วันนี้ไม่ใช่วันทำการ ระบบปิดรับการสแกน",
            "speak": settings.get("voice_out_of_window_text"),
            "next_delay_seconds": delay,
        }

    geometry_score = body.get("geometry_score")
    if geometry_score is not None and float(geometry_score) < float(settings.get("geometry_min_score") or 0):
        insert_log(student_id, "in", "geometry_reject", confidence, geometry_score, None)
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

    decision = rules.decide_direction(settings, minutes, body.get("direction"), weekday)
    if not decision["allowed"]:
        insert_log(student_id, decision["direction"], "out_of_window", confidence,
                   geometry_score, snapshot_path)
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
    display_name = (student["nickname"] or "").strip() or student["full_name"]

    cooldown = int(settings.get("duplicate_cooldown_minutes") or 300)
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - cooldown * 60))
    recent = db.one(
        "SELECT id FROM attendance_logs WHERE student_id = ? AND direction = ? AND status = 'ok'"
        " AND scanned_at >= ? ORDER BY scanned_at DESC LIMIT 1",
        (student_id, direction, since),
    )

    avatar_url = media_url(student["avatar_path"])
    snapshot_url = media_url(snapshot_path)

    if recent:
        insert_log(student_id, direction, "duplicate", confidence, geometry_score, snapshot_path)
        template = settings.get("voice_duplicate_template") or "สแกนซ้ำ {name} บันทึกเวลาไปแล้ว"
        return {
            "result": "duplicate",
            "student": dict(student),
            "direction": direction,
            "avatar_url": avatar_url,
            "snapshot_url": snapshot_url,
            "message": f"{student['full_name']} สแกนซ้ำ — บันทึกเวลา{direction_label}ไปแล้ว",
            "speak": template.replace("{name}", display_name).replace("{direction}", direction_label),
            "next_delay_seconds": delay,
        }

    late = rules.is_late(settings, minutes, direction)
    early = rules.is_early_leave(settings, minutes, direction)
    log_id = insert_log(student_id, direction, "ok", confidence, geometry_score, snapshot_path)

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
        "snapshot_url": snapshot_url,
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
               geometry_score: Any, snapshot_path: str | None) -> str:
    log_id = db.new_id()
    db.run(
        "INSERT INTO attendance_logs (id, student_id, direction, status, confidence,"
        " geometry_score, device_name, snapshot_path, scanned_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (log_id, student_id, direction, status, confidence,
         float(geometry_score) if geometry_score is not None else None,
         "ตู้สแกนในเครื่อง", snapshot_path, db.now_iso()),
    )
    return log_id


@router.post("/api/public/kiosk/alert")
async def kiosk_alert(request: Request):
    body = await request.json()
    path = None
    data = decode_jpeg(body.get("snapshot"))
    if data:
        path = save_jpeg(os.path.join(db.SNAPSHOT_DIR, "alerts"), f"{int(time.time()*1000)}.jpg", data)
    db.run(
        "INSERT INTO security_alerts (id, kind, detail, snapshot_path, created_at) VALUES (?,?,?,?,?)",
        (db.new_id(), str(body.get("kind") or "failed_scan")[:40],
         str(body.get("detail") or "")[:300], path, db.now_iso()),
    )
    return {"ok": True}


@router.post("/api/public/kiosk/visitor")
async def kiosk_visitor(request: Request):
    body = await request.json()
    path = None
    data = decode_jpeg(body.get("snapshot"))
    if data:
        path = save_jpeg(os.path.join(db.SNAPSHOT_DIR, "visitors"), f"{int(time.time()*1000)}.jpg", data)
    visitor_id = db.new_id()
    db.run(
        "INSERT INTO visitor_logs (id, direction, snapshot_path, created_at) VALUES (?,?,?,?)",
        (visitor_id, body.get("direction"), path, db.now_iso()),
    )
    return {"ok": True, "id": visitor_id}


@router.post("/api/public/kiosk/door-command")
def kiosk_door_command():
    command = db.kv_get("door_command")
    if command:
        db.kv_set("door_command", None)
    return {"command": command}


@router.post("/api/public/kiosk/power-command")
def kiosk_power_command():
    settings = db.get_settings()
    command = db.kv_get("power_command")
    if command:
        db.kv_set("power_command", None)
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

    return {
        "command": command,
        "settings": {
            "power_saving_enabled": settings.get("power_saving_enabled"),
            "screen_idle_minutes": settings.get("screen_idle_minutes"),
            "auto_power_off_action": settings.get("auto_power_off_action"),
        },
        "screen_off_window": screen_off_window,
        "power_off_due": power_off_due,
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
        "show_clock": settings.get("kiosk_show_clock", True),
        "show_confidence": settings.get("kiosk_show_confidence", False),
        "news_enabled": settings.get("kiosk_news_enabled", False),
        "news_text": settings.get("kiosk_news_text") or "",
        "next_delay_seconds": settings.get("next_person_delay_seconds", 5),
        "voice_enabled": settings.get("voice_enabled", True),
        "voice_rate": settings.get("voice_rate", 1),
        "voice_volume": settings.get("voice_volume", 1),
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
    late_limit = rules.time_to_minutes(settings.get("late_after")) + int(
        settings.get("late_grace_minutes") or 0
    )
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
    checkin_closed = minutes > rules.time_to_minutes(settings.get("checkin_end") or "10:00")
    checkout_closed = minutes > rules.time_to_minutes(settings.get("checkout_end") or "19:00")
    return {
        "school_name": settings.get("school_name"),
        "screensaver_mode": settings.get("screensaver_mode") or "stats",
        "people": len(people),
        "present": len(first_in),
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
            " guardian_phone=?, person_type=?, department=?, position=?, is_active=?, updated_at=?"
            " WHERE id=?",
            (*fields.values(), db.now_iso(), person_id),
        )
        db.add_audit("แก้ไขข้อมูลบุคคล", person_id, fields["full_name"])
    else:
        exists = db.one("SELECT id FROM students WHERE student_code = ?", (fields["student_code"],))
        if exists:
            person_id = exists["id"]
            db.run(
                "UPDATE students SET full_name=?, nickname=?, class_room=?, guardian_phone=?,"
                " person_type=?, department=?, position=?, is_active=?, updated_at=? WHERE id=?",
                (fields["full_name"], fields["nickname"], fields["class_room"],
                 fields["guardian_phone"], fields["person_type"], fields["department"],
                 fields["position"], fields["is_active"], db.now_iso(), person_id),
            )
        else:
            person_id = db.new_id()
            db.run(
                "INSERT INTO students (id, student_code, full_name, nickname, class_room,"
                " guardian_phone, person_type, department, position, is_active, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
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
def report(x_local_token: str | None = Header(None), start: str = "", end: str = ""):
    require_admin(x_local_token)
    start = start or rules.bangkok_date_iso()
    end = end or rules.bangkok_date_iso()
    settings = db.get_settings()
    late_limit = rules.time_to_minutes(settings.get("late_after")) + int(
        settings.get("late_grace_minutes") or 0
    )
    rows = db.query(
        "SELECT date(l.scanned_at, '+7 hours') AS day, l.student_id, l.direction, l.scanned_at,"
        " s.full_name, s.student_code, s.class_room FROM attendance_logs l"
        " LEFT JOIN students s ON s.id = l.student_id"
        " WHERE l.status = 'ok' AND date(l.scanned_at, '+7 hours') BETWEEN ? AND ?"
        " ORDER BY l.scanned_at",
        (start, end),
    )
    people_total = len(db.list_active_people())
    days: dict[str, dict] = {}
    per_person: dict[str, dict] = {}
    for row in rows:
        day = days.setdefault(row["day"], {"date": row["day"], "present": set(), "late": 0})
        if row["direction"] != "in" or not row["student_id"]:
            continue
        if row["student_id"] in day["present"]:
            continue
        day["present"].add(row["student_id"])
        hour = (int(row["scanned_at"][11:13]) + 7) % 24
        minute = int(row["scanned_at"][14:16])
        late = hour * 60 + minute > late_limit
        if late:
            day["late"] += 1
        person = per_person.setdefault(row["student_id"], {
            "name": row["full_name"], "code": row["student_code"],
            "class_room": row["class_room"], "present": 0, "late": 0,
        })
        person["present"] += 1
        person["late"] += 1 if late else 0

    day_list = [
        {"date": d["date"], "present": len(d["present"]), "late": d["late"],
         "absent": max(people_total - len(d["present"]), 0)}
        for d in sorted(days.values(), key=lambda x: x["date"])
    ]
    top_late = sorted(per_person.values(), key=lambda p: -p["late"])[:20]
    return {"start": start, "end": end, "people": people_total, "days": day_list,
            "top_late": [p for p in top_late if p["late"] > 0], "persons": list(per_person.values())}


# ----------------------------------------------------------- admin: settings


@router.get("/api/local/settings")
def settings_get(x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    return {"settings": db.get_settings(), "data_dir": db.DATA_DIR}


@router.post("/api/local/settings")
async def settings_post(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    settings = db.save_settings(body if isinstance(body, dict) else {})
    db.add_audit("แก้ไขการตั้งค่าระบบ", "settings")
    return {"settings": settings}


@router.post("/api/local/door/command")
async def door_command(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    action = body.get("action")
    if action not in ("open", "close", "deny"):
        raise HTTPException(status_code=400, detail="คำสั่งไม่ถูกต้อง")
    db.kv_set("door_command", {"id": db.new_id(), "action": action,
                               "seconds": body.get("seconds") or 5})
    return {"ok": True}


@router.post("/api/local/power/command")
async def power_command(request: Request, x_local_token: str | None = Header(None)):
    require_admin(x_local_token)
    body = await request.json()
    action = body.get("action")
    if action not in ("screen_off", "screen_on", "sleep", "shutdown", "cancel"):
        raise HTTPException(status_code=400, detail="คำสั่งไม่ถูกต้อง")
    db.kv_set("power_command", {"id": db.new_id(), "command": action})
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
            "staff" if row.get("person_type") == "staff" else "student",
            (row.get("department") or None),
            (row.get("position") or None),
        )
        exists = db.one("SELECT id FROM students WHERE student_code = ?", (code,))
        if exists:
            db.run(
                "UPDATE students SET full_name=?, nickname=?, class_room=?, guardian_phone=?,"
                " person_type=?, department=?, position=?, is_active=1, updated_at=? WHERE id=?",
                (*values, db.now_iso(), exists["id"]),
            )
            updated += 1
        else:
            db.run(
                "INSERT INTO students (id, student_code, full_name, nickname, class_room,"
                " guardian_phone, person_type, department, position, is_active, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
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
def kiosk_content():
    """Branding the offline kiosk screen reads on every refresh."""
    content = db.get_content()
    settings = db.get_settings()
    return {**content, "logo_url": media_url(content.get("logo_path")),
            "school_name": settings.get("school_name")}


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
    late_limit = rules.time_to_minutes(settings.get("late_after")) + int(
        settings.get("late_grace_minutes") or 0
    )
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


# ------------------------------------------------------------------- screens



@router.get("/health")
def local_health():
    return {"standalone": True, "data_dir": db.DATA_DIR, "admin_configured": db.admin_configured()}


def json_error(status: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status)


def html(page: str) -> HTMLResponse:
    return HTMLResponse(page)
