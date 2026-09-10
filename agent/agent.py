"""
FaceGate local agent
--------------------
Runs on the kiosk PC (Intel Atom + webcam) next to the browser kiosk page.

Responsibilities
1. Sync students, settings and face embeddings from the cloud.
2. Compute ArcFace embeddings (InsightFace buffalo_l) for photos registered in
   the admin site, and upload them back.
3. Receive a webcam frame from the browser, match it against known embeddings,
   run a simple anti-spoof (liveness) check, and record attendance in the cloud.

Start with:  python agent.py
"""

import base64
import io
import json
import os
import threading
import time
from typing import Any

import cv2
import numpy as np
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from face_engine import FaceEngine
from pydantic import BaseModel

CLOUD_URL = os.environ.get("FACEGATE_CLOUD_URL", "https://project--8a2237fd-d733-4dca-9c68-fe5d05c002f8.lovable.app")
DEVICE_KEY = os.environ.get("FACEGATE_DEVICE_KEY", "")
SYNC_SECONDS = int(os.environ.get("FACEGATE_SYNC_SECONDS", "30"))
PORT = int(os.environ.get("FACEGATE_PORT", "8899"))


def default_cache_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.join(
        os.path.expanduser("~"), ".local", "share"
    )
    return os.path.join(base, "FaceGate", "cache")


CACHE_DIR = os.environ.get("FACEGATE_CACHE_DIR", default_cache_dir())
IMAGE_DIR = os.path.join(CACHE_DIR, "images")
FACES_FILE = os.path.join(CACHE_DIR, "faces.json")
STUDENTS_FILE = os.path.join(CACHE_DIR, "students.json")
SETTINGS_FILE = os.path.join(CACHE_DIR, "settings.json")
OUTBOX_FILE = os.path.join(CACHE_DIR, "outbox.jsonl")

os.makedirs(IMAGE_DIR, exist_ok=True)

HEADERS = {"x-device-key": DEVICE_KEY, "content-type": "application/json"}

app = FastAPI(title="FaceGate Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ArcFace. det_size kept small so an Intel Atom can keep up.
face_app = FaceEngine(det_size=(320, 320))

state: dict[str, Any] = {
    "faces": {},  # face_id -> {student_id, embedding, geometry, version}
    "matrix": np.zeros((0, 512), dtype=np.float32),  # normalised embeddings
    "owners": [],  # student_id per row
    "geoms": [],  # landmark geometry per row
    "students": {},
    "settings": {},
    "last_sync": None,
}
lock = threading.Lock()
outbox_lock = threading.Lock()


# --- Local cache -----------------------------------------------------------
def write_json_atomic(path: str, payload: Any) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    os.replace(tmp, path)


def read_json(path: str, fallback: Any) -> Any:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:  # noqa: BLE001
        return fallback


def rebuild_matrix_locked() -> None:
    """Rebuild the search matrix from state['faces']. Caller holds the lock."""
    rows, owners, geoms = [], [], []
    for face in state["faces"].values():
        vec = np.array(face.get("embedding") or [], dtype=np.float32)
        if vec.size:
            rows.append(normalise(vec))
            owners.append(face["student_id"])
            geoms.append(face.get("geometry") or None)
    state["matrix"] = np.vstack(rows) if rows else np.zeros((0, 512), dtype=np.float32)
    state["owners"] = owners
    state["geoms"] = geoms


def save_cache() -> None:
    with lock:
        faces = dict(state["faces"])
        students = list(state["students"].values())
        settings = dict(state["settings"])
    try:
        write_json_atomic(FACES_FILE, faces)
        write_json_atomic(STUDENTS_FILE, students)
        write_json_atomic(SETTINGS_FILE, settings)
    except Exception as exc:  # noqa: BLE001
        print(f"[agent] cache write failed: {exc}")


def load_cache() -> None:
    faces = read_json(FACES_FILE, {}) or {}
    students = read_json(STUDENTS_FILE, []) or []
    settings = read_json(SETTINGS_FILE, {}) or {}
    with lock:
        state["faces"] = {k: v for k, v in faces.items() if isinstance(v, dict)}
        state["students"] = {s["id"]: s for s in students if isinstance(s, dict)}
        state["settings"] = settings
        rebuild_matrix_locked()
    print(f"[agent] loaded {len(faces)} cached faces from {CACHE_DIR}")


def prune_images(valid_ids: set[str]) -> None:
    try:
        for name in os.listdir(IMAGE_DIR):
            if os.path.splitext(name)[0] not in valid_ids:
                os.remove(os.path.join(IMAGE_DIR, name))
    except Exception:  # noqa: BLE001
        pass


def cache_image(face_id: str, data: bytes) -> None:
    try:
        tmp = os.path.join(IMAGE_DIR, f"{face_id}.tmp")
        with open(tmp, "wb") as fh:
            fh.write(data)
        os.replace(tmp, os.path.join(IMAGE_DIR, f"{face_id}.jpg"))
    except Exception:  # noqa: BLE001
        pass


def cached_image(face_id: str) -> bytes | None:
    path = os.path.join(IMAGE_DIR, f"{face_id}.jpg")
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except Exception:  # noqa: BLE001
        return None


# --- Offline outbox --------------------------------------------------------
def outbox_count() -> int:
    with outbox_lock:
        try:
            with open(OUTBOX_FILE, encoding="utf-8") as fh:
                return sum(1 for line in fh if line.strip())
        except Exception:  # noqa: BLE001
            return 0


def outbox_append(payload: dict) -> None:
    with outbox_lock:
        try:
            with open(OUTBOX_FILE, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
        except Exception as exc:  # noqa: BLE001
            print(f"[agent] outbox write failed: {exc}")


def outbox_flush() -> None:
    with outbox_lock:
        try:
            with open(OUTBOX_FILE, encoding="utf-8") as fh:
                lines = [line for line in fh if line.strip()]
        except Exception:  # noqa: BLE001
            return
        if not lines:
            return
        remaining: list[str] = []
        for line in lines:
            try:
                requests.post(
                    f"{CLOUD_URL}/api/public/kiosk/attendance",
                    headers=HEADERS,
                    data=line.encode("utf-8"),
                    timeout=20,
                ).raise_for_status()
            except Exception:  # noqa: BLE001
                remaining.append(line)
        try:
            if remaining:
                with open(f"{OUTBOX_FILE}.tmp", "w", encoding="utf-8") as fh:
                    fh.writelines(remaining)
                os.replace(f"{OUTBOX_FILE}.tmp", OUTBOX_FILE)
            else:
                os.remove(OUTBOX_FILE)
        except Exception:  # noqa: BLE001
            pass


def outbox_loop() -> None:
    while True:
        try:
            outbox_flush()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(30)



def normalise(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    return vec / norm if norm else vec


# --- Facial geometry -------------------------------------------------------
# ArcFace gives 5 landmarks: left eye, right eye, nose, left mouth, right mouth.
# We turn them into scale-invariant ratios (every distance divided by the
# eye-to-eye distance), which describe the individual layout of the face:
# how far the nose sits from each eye, mouth width, nose-to-mouth distance and
# so on. This is used as a second opinion on top of the ArcFace embedding.
GEOMETRY_KEYS = [
    "nose_left_eye",
    "nose_right_eye",
    "nose_eye_mid",
    "mouth_width",
    "nose_mouth_mid",
    "eye_mid_mouth_mid",
    "left_eye_mouth_left",
    "right_eye_mouth_right",
    "face_width",
    "face_height",
    "eye_asymmetry",
]


def geometry_features(face) -> dict[str, float] | None:
    kps = getattr(face, "kps", None)
    if kps is None or len(kps) < 5:
        return None
    pts = np.array(kps, dtype=np.float32)
    left_eye, right_eye, nose, mouth_l, mouth_r = pts[0], pts[1], pts[2], pts[3], pts[4]
    eye_dist = float(np.linalg.norm(right_eye - left_eye))
    if eye_dist < 1e-3:
        return None

    eye_mid = (left_eye + right_eye) / 2.0
    mouth_mid = (mouth_l + mouth_r) / 2.0
    x1, y1, x2, y2 = [float(v) for v in face.bbox]

    d = lambda a, b: float(np.linalg.norm(a - b)) / eye_dist  # noqa: E731
    nose_l = d(nose, left_eye)
    nose_r = d(nose, right_eye)

    feats = {
        "nose_left_eye": nose_l,
        "nose_right_eye": nose_r,
        "nose_eye_mid": d(nose, eye_mid),
        "mouth_width": d(mouth_l, mouth_r),
        "nose_mouth_mid": d(nose, mouth_mid),
        "eye_mid_mouth_mid": d(eye_mid, mouth_mid),
        "left_eye_mouth_left": d(left_eye, mouth_l),
        "right_eye_mouth_right": d(right_eye, mouth_r),
        "face_width": (x2 - x1) / eye_dist,
        "face_height": (y2 - y1) / eye_dist,
        "eye_asymmetry": abs(nose_l - nose_r) / max(nose_l + nose_r, 1e-3),
    }
    return {k: round(float(v), 5) for k, v in feats.items()}


def geometry_similarity(a: dict | None, b: dict | None) -> float | None:
    """1.0 = identical proportions. Relative difference, averaged."""
    if not a or not b:
        return None
    diffs = []
    for key in GEOMETRY_KEYS:
        av, bv = a.get(key), b.get(key)
        if av is None or bv is None:
            continue
        denom = abs(av) + abs(bv)
        if denom < 1e-6:
            continue
        diffs.append(abs(av - bv) / denom)
    if not diffs:
        return None
    return float(max(0.0, 1.0 - 2.0 * (sum(diffs) / len(diffs))))


def embed_image(bgr: np.ndarray):
    faces = face_app.get(bgr)
    if not faces:
        return None
    # Largest face wins (the person standing at the kiosk).
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return face


def laplacian_sharpness(bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def looks_like_a_real_person(bgr: np.ndarray, face) -> bool:
    """Cheap anti-spoof: printed photos / phone screens are flat and blurry."""
    x1, y1, x2, y2 = [int(v) for v in face.bbox]
    crop = bgr[max(y1, 0):y2, max(x1, 0):x2]
    if crop.size == 0:
        return False
    sharpness = laplacian_sharpness(crop)
    colour_spread = float(np.std(crop.reshape(-1, 3), axis=0).mean())
    return sharpness > 45 and colour_spread > 18


def crop_face_jpeg(bgr: np.ndarray, face, margin: float = 0.35) -> str | None:
    """JPEG (base64) of the scanned face, kept as evidence in the cloud."""
    x1, y1, x2, y2 = [int(v) for v in face.bbox]
    w, h = x2 - x1, y2 - y1
    mx, my = int(w * margin), int(h * margin)
    crop = bgr[max(y1 - my, 0): y2 + my, max(x1 - mx, 0): x2 + mx]
    if crop.size == 0:
        return None
    if crop.shape[0] > 480:
        scale = 480 / crop.shape[0]
        crop = cv2.resize(crop, (int(crop.shape[1] * scale), 480))
    ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return base64.b64encode(buf).decode() if ok else None


def sync_once() -> None:
    with lock:
        known = {fid: f.get("version") or "" for fid, f in state["faces"].items()}

    res = requests.post(
        f"{CLOUD_URL}/api/public/kiosk/sync",
        headers=HEADERS,
        json={"known": known},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()

    incremental = bool(data.get("incremental"))
    changed = data.get("embeddings", []) or []
    removed = data.get("removed", []) or []

    with lock:
        faces = dict(state["faces"]) if incremental else {}
        for item in changed:
            if not item.get("embedding"):
                continue
            faces[item["id"]] = {
                "student_id": item["student_id"],
                "embedding": item["embedding"],
                "geometry": item.get("geometry") or None,
                "version": item.get("version") or "",
            }
        for face_id in removed:
            faces.pop(face_id, None)
        state["faces"] = faces
        state["students"] = {s["id"]: s for s in data.get("students", [])}
        state["settings"] = data.get("settings") or {}
        state["last_sync"] = time.time()
        rebuild_matrix_locked()
        valid_ids = set(faces.keys())

    save_cache()
    prune_images(valid_ids)
    if changed or removed:
        print(f"[agent] sync: +{len(changed)} / -{len(removed)} faces (total {len(valid_ids)})")

    pending = data.get("pending", [])
    if pending:
        process_pending(pending)


def process_pending(pending: list[dict]) -> None:
    """Compute embeddings for newly registered photos and send them back.

    Photos are kept on disk so the embeddings can be recomputed later without
    downloading them again.
    """
    results = []
    for item in pending:
        try:
            img_bytes = cached_image(item["id"])
            if img_bytes is None:
                img_bytes = requests.get(item["url"], timeout=30).content
                cache_image(item["id"], img_bytes)
            arr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
            face = embed_image(arr) if arr is not None else None
            if face is None:
                results.append({"face_id": item["id"], "error": "ไม่พบใบหน้าในรูปนี้"})
                continue
            results.append(
                {
                    "face_id": item["id"],
                    "embedding": normalise(face.normed_embedding).tolist(),
                    "geometry": geometry_features(face),
                    "quality": float(getattr(face, "det_score", 0.0)),
                }
            )
        except Exception as exc:  # noqa: BLE001
            results.append({"face_id": item["id"], "error": str(exc)[:200]})

    requests.post(
        f"{CLOUD_URL}/api/public/kiosk/embeddings",
        headers=HEADERS,
        json={"results": results},
        timeout=60,
    )
    print(f"[agent] processed {len(results)} registration photos")


def sync_loop() -> None:
    while True:
        try:
            sync_once()
        except Exception as exc:  # noqa: BLE001
            print(f"[agent] sync failed: {exc}")
        time.sleep(SYNC_SECONDS)


class ScanRequest(BaseModel):
    image: str


@app.get("/health")
def health():
    with lock:
        known_faces = int(state["matrix"].shape[0])
        students = len(state["students"])
        last_sync = state["last_sync"]
    try:
        cached_images = len(os.listdir(IMAGE_DIR))
    except Exception:  # noqa: BLE001
        cached_images = 0
    return {
        "ok": True,
        "known_faces": known_faces,
        "students": students,
        "last_sync": last_sync,
        "cached_images": cached_images,
        "pending_uploads": outbox_count(),
        "cache_dir": CACHE_DIR,
    }




@app.post("/scan")
def scan(req: ScanRequest):
    raw = req.image.split(",", 1)[-1]
    arr = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
    if arr is None:
        return {"result": "no_face", "message": ""}

    faces = face_app.get(arr)
    if not faces:
        return {"result": "no_face", "message": ""}

    # The kiosk is meant for one person at a time. Reject frames with
    # more than one clearly-detected face to prevent accidental cross-matches.
    if len(faces) > 1:
        return {
            "result": "multiple_faces",
            "message": "พบหลายใบหน้า กรุณาแสกนทีละคน",
            "speak": "พบหลายใบหน้า กรุณาเข้ามาคนเดียว",
            "next_delay_seconds": 3,
        }

    face = faces[0]

    with lock:
        matrix = state["matrix"]
        owners = list(state["owners"])
        geoms = list(state["geoms"])
        settings = dict(state["settings"])

    threshold = float(settings.get("match_threshold") or 0.45)
    delay = int(settings.get("next_person_delay_seconds") or 5)

    if settings.get("require_liveness") and not looks_like_a_real_person(arr, face):
        return {
            "result": "denied",
            "message": "ตรวจพบว่าไม่ใช่บุคคลจริง",
            "speak": "ไม่สามารถยืนยันตัวตนได้ กรุณามองกล้องอีกครั้ง",
            "next_delay_seconds": delay,
        }

    if matrix.shape[0] == 0:
        return {
            "result": "denied",
            "message": "ยังไม่มีข้อมูลใบหน้าในระบบ",
            "speak": "ยังไม่มีข้อมูลใบหน้าในระบบ",
            "next_delay_seconds": delay,
        }

    query = normalise(face.normed_embedding)
    live_geometry = geometry_features(face)
    geo_weight = float(settings.get("geometry_weight") or 0.0)

    scores = matrix @ query
    # Blend in the landmark-geometry similarity so that a look-alike with a
    # different eye/nose/mouth layout scores lower than the real student.
    combined = scores.copy()
    geo_per_row = [None] * len(owners)
    if live_geometry and geo_weight > 0:
        for i, g in enumerate(geoms):
            sim = geometry_similarity(live_geometry, g)
            geo_per_row[i] = sim
            if sim is not None:
                combined[i] = (1.0 - geo_weight) * scores[i] + geo_weight * sim

    best = int(np.argmax(combined))
    confidence = float(scores[best])
    geometry_score = geo_per_row[best]

    # Best geometry match among all photos of the chosen student.
    if live_geometry:
        student_geo = [
            geometry_similarity(live_geometry, geoms[i])
            for i, owner in enumerate(owners)
            if owner == owners[best]
        ]
        student_geo = [s for s in student_geo if s is not None]
        if student_geo:
            geometry_score = max(student_geo)

    if float(combined[best]) < threshold:
        return {
            "result": "denied",
            "message": "ไม่พบข้อมูลผู้ใช้ กรุณาลงทะเบียนก่อน",
            "speak": "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
            "next_delay_seconds": delay,
        }

    student_id = owners[best]
    payload = {
        "student_id": student_id,
        "confidence": round(confidence, 4),
        "embedding": query.tolist(),
    }
    if geometry_score is not None:
        payload["geometry_score"] = round(float(geometry_score), 4)
    if live_geometry:
        payload["geometry"] = live_geometry
    snapshot = crop_face_jpeg(arr, face)
    if snapshot:
        payload["snapshot"] = snapshot

    res = requests.post(
        f"{CLOUD_URL}/api/public/kiosk/attendance",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    return res.json()


if __name__ == "__main__":
    import uvicorn

    if not DEVICE_KEY:
        raise SystemExit("ตั้งค่า FACEGATE_DEVICE_KEY ก่อนเริ่มโปรแกรม (ดูรหัสได้ในหน้าตั้งค่าระบบ)")
    threading.Thread(target=sync_loop, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT)
