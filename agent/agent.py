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
import door
from face_engine import Face, FaceEngine
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


# Size of the on-screen oval guide, as a share of the camera picture.
# Faces outside this oval belong to people walking past, not to the person
# being scanned, so they are ignored.
GUIDE_RX = 0.30
GUIDE_RY = 0.36
# Anyone whose face reaches within this much of the oval counts as crowding it.
GUIDE_MARGIN = 1.25


def inside_guide_margin(dets, i: int, cx: float, cy: float, rx: float, ry: float) -> bool:
    fx = (float(dets[i, 0]) + float(dets[i, 2])) / 2.0
    fy = (float(dets[i, 1]) + float(dets[i, 3])) / 2.0
    return ((fx - cx) / (rx * GUIDE_MARGIN)) ** 2 + ((fy - cy) / (ry * GUIDE_MARGIN)) ** 2 <= 1.0



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


def detection_payload(dets: np.ndarray, kpss: np.ndarray, index: int, width: float, height: float):
    """Small visual payload for the kiosk overlay; recognition stays local."""
    x1, y1, x2, y2 = [float(value) for value in dets[index, :4]]
    return {
        "box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
        "landmarks": [{"x": float(point[0]), "y": float(point[1])} for point in kpss[index]],
        "frame": {"width": width, "height": height},
        "score": round(float(dets[index, 4]), 4),
    }


def door_react(body: dict) -> dict:
    """Drive the micro:bit door lock from the decision made in the cloud."""
    with lock:
        settings = dict(state["settings"])
    if not settings.get("door_enabled", True):
        return body
    seconds = float(settings.get("door_open_seconds") or 0) or None
    result = body.get("result")
    try:
        if result == "ok":
            body["door"] = "opened" if door.open_door(seconds) else "offline"
        elif result in ("denied", "duplicate", "out_of_window", "multiple_faces"):
            if settings.get("door_deny_alarm", True):
                door.deny()
            body["door"] = "locked"
    except Exception as exc:  # noqa: BLE001
        print(f"[door] control failed: {exc}")
    return body


class DoorRequest(BaseModel):
    seconds: float | None = None


@app.get("/door/status")
def door_status():
    return door.status()


@app.post("/door/test")
def door_test(req: DoorRequest):
    ok = door.open_door(req.seconds)
    return {"ok": ok, **door.status()}


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
    stale = last_sync is None or (time.time() - float(last_sync)) > SYNC_SECONDS * 3
    return {
        "ok": True,
        "known_faces": known_faces,
        "students": students,
        "last_sync": last_sync,
        "stale": stale,
        "cached_images": cached_images,
        "pending_uploads": outbox_count(),
        "cache_dir": CACHE_DIR,
        "door": door.status(),
    }




_motion: dict[str, Any] = {"prev": None, "visual": None, "skips": 0}

_clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))


def scene_is_static(bgr: np.ndarray) -> bool:
    """True when the frame looks the same as the previous one (nobody there).

    Detection + recognition are by far the heaviest part on a low-power CPU,
    so an unchanged frame is skipped before any model runs. A full detection is
    forced every few skipped frames so a person standing perfectly still (or a
    slow/dim camera with little frame-to-frame noise) is never missed.
    """
    small = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), (64, 48))
    prev = _motion.get("prev")
    _motion["prev"] = small
    if prev is None:
        _motion["skips"] = 0
        return False
    diff = float(np.mean(cv2.absdiff(prev, small)))
    if diff >= 1.0:
        _motion["skips"] = 0
        return False
    skips = int(_motion.get("skips") or 0) + 1
    if skips >= 6:  # roughly once a second: re-check even a frozen scene
        _motion["skips"] = 0
        return False
    _motion["skips"] = skips
    return True


def normalize_lighting(bgr: np.ndarray) -> np.ndarray:
    """Even out day/night, backlit and shadowed frames before detection.

    Auto gamma pulls very dark or very bright frames back to a mid exposure and
    CLAHE lifts local contrast (faces against a bright window, half-shadowed
    faces, warm evening light), which is what the detector actually needs.
    """
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    light, a_ch, b_ch = cv2.split(lab)
    mean = float(np.mean(light))
    if mean < 5.0:
        mean = 5.0
    # target a mid-grey exposure of ~128
    gamma = float(np.clip(np.log(128.0 / 255.0) / np.log(mean / 255.0), 0.45, 2.2))
    if abs(gamma - 1.0) > 0.08:
        table = np.array(
            [((i / 255.0) ** (1.0 / gamma)) * 255 for i in range(256)], dtype=np.uint8
        )
        light = cv2.LUT(light, table)
    light = _clahe.apply(light)
    return cv2.cvtColor(cv2.merge((light, a_ch, b_ch)), cv2.COLOR_LAB2BGR)


def detect_adaptive(bgr: np.ndarray, det_min: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Detect faces, retrying with light correction and a larger input.

    Pass 1 is the cheap everyday path. Only when nothing usable is found do the
    heavier passes run, so an Intel Atom keeps its speed in good light and still
    finds faces in poor light.
    """
    dets, kpss = face_app.detect(bgr)
    if any(float(dets[i, 4]) >= det_min for i in range(dets.shape[0])):
        return dets, kpss, bgr

    fixed = normalize_lighting(bgr)
    dets2, kpss2 = face_app.detect(fixed)
    if any(float(dets2[i, 4]) >= det_min for i in range(dets2.shape[0])):
        return dets2, kpss2, fixed

    # Last resort: bigger detector input finds smaller / farther faces.
    dets3, kpss3 = face_app.detect(fixed, det_size=(512, 512))
    if dets3.shape[0]:
        return dets3, kpss3, fixed
    return dets2 if dets2.shape[0] else dets, kpss2 if dets2.shape[0] else kpss, fixed


@app.post("/scan")
def scan(req: ScanRequest):
    raw = req.image.split(",", 1)[-1]
    arr = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
    if arr is None:
        return {"result": "no_face", "message": ""}

    with lock:
        matrix = state["matrix"]
        owners = list(state["owners"])
        geoms = list(state["geoms"])
        settings = dict(state["settings"])

    threshold = float(settings.get("match_threshold") or 0.45)
    delay = int(settings.get("next_person_delay_seconds") or 5)
    det_min = float(settings.get("detector_min_score") or 0.5)
    min_coverage = float(settings.get("min_face_coverage") or 0.0)

    if scene_is_static(arr):
        return {
            "result": "no_face",
            "message": "",
            "face_detection": _motion.get("visual"),
        }

    # Detect only (cheap); the expensive embedding runs for one face at most.
    dets, kpss = face_app.detect(arr)
    strong = [i for i in range(dets.shape[0]) if float(dets[i, 4]) >= det_min]
    if not strong:
        _motion["visual"] = None
        return {"result": "no_face", "message": ""}

    frame_h, frame_w = float(arr.shape[0]), float(arr.shape[1])
    frame_area = frame_h * frame_w
    areas = {
        i: float((dets[i, 2] - dets[i, 0]) * (dets[i, 3] - dets[i, 1])) for i in strong
    }
    # Only faces big enough to matter count as "people standing at the kiosk".
    big = [i for i in strong if areas[i] / frame_area >= max(min_coverage, 0.01)]
    if not big:
        return {
            "result": "no_face",
            "message": "กรุณาเข้าใกล้กล้องอีกนิด",
        }

    # Anyone walking past behind the person being scanned is simply ignored:
    # only faces sitting inside the on-screen oval guide are considered.
    cx, cy = frame_w / 2.0, frame_h / 2.0
    rx, ry = frame_w * GUIDE_RX, frame_h * GUIDE_RY

    def inside_guide(i: int) -> bool:
        fx = (float(dets[i, 0]) + float(dets[i, 2])) / 2.0
        fy = (float(dets[i, 1]) + float(dets[i, 3])) / 2.0
        return ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2 <= 1.0

    present = [i for i in big if inside_guide(i)]
    if not present:
        return {
            "result": "no_face",
            "message": "กรุณาจัดใบหน้าให้อยู่ในกรอบ",
        }
    if len(present) > 1:
        visual_index = max(present, key=lambda i: areas[i])
        return {
            "result": "multiple_faces",
            "message": "พบหลายใบหน้าในกรอบ กรุณาแสกนทีละคน",
            "speak": "พบหลายใบหน้า กรุณาเข้ามาคนเดียว",
            "next_delay_seconds": 3,
            "face_detection": detection_payload(dets, kpss, visual_index, frame_w, frame_h),
        }
    # A second person inside the frame but outside the oval is fine; someone
    # crowding right at the edge of the oval is not.
    idx_main = max(present, key=lambda i: areas[i])
    for i in big:
        if i == idx_main:
            continue
        if areas[i] >= areas[idx_main] * 0.6 and inside_guide_margin(dets, i, cx, cy, rx, ry):
            return {
                "result": "multiple_faces",
                "message": "มีคนอื่นอยู่ใกล้กรอบเกินไป กรุณาแสกนทีละคน",
                "speak": "กรุณาเข้ามาคนเดียว",
                "next_delay_seconds": 3,
            }

    idx = present[0]
    visual = detection_payload(dets, kpss, idx, frame_w, frame_h)
    _motion["visual"] = visual
    face = Face(
        bbox=dets[idx, :4],
        kps=kpss[idx],
        det_score=float(dets[idx, 4]),
        normed_embedding=face_app.embed(arr, kpss[idx]),
    )

    if settings.get("require_liveness") and not looks_like_a_real_person(arr, face):
        return {
            "result": "denied",
            "message": "ตรวจพบว่าไม่ใช่บุคคลจริง",
            "speak": "ไม่สามารถยืนยันตัวตนได้ กรุณามองกล้องอีกครั้ง",
            "next_delay_seconds": delay,
            "face_detection": visual,
        }

    if matrix.shape[0] == 0:
        return {
            "result": "denied",
            "message": "ยังไม่มีข้อมูลใบหน้าในระบบ",
            "speak": "ยังไม่มีข้อมูลใบหน้าในระบบ",
            "next_delay_seconds": delay,
            "face_detection": visual,
        }

    query = normalise(face.normed_embedding)
    live_geometry = geometry_features(face)
    geo_weight = float(settings.get("geometry_weight") or 0.0)

    scores = matrix @ query
    combined = scores.astype(np.float32, copy=True)
    geo_per_row: list[float | None] = [None] * len(owners)

    # Geometry is only worth computing for the few rows that already look close
    # to the live face — comparing every photo wastes CPU on the kiosk PC.
    if live_geometry and geo_weight > 0:
        top = np.argsort(scores)[::-1][: min(len(owners), 30)]
        for i in top:
            sim = geometry_similarity(live_geometry, geoms[int(i)])
            geo_per_row[int(i)] = sim
            if sim is not None:
                combined[int(i)] = (1.0 - geo_weight) * scores[int(i)] + geo_weight * sim

    # Decide per person, not per photo: a student with several good photos
    # should beat a stranger who happens to match one odd-angle photo.
    per_student: dict[str, float] = {}
    for i, owner in enumerate(owners):
        value = float(combined[i])
        if value > per_student.get(owner, -2.0):
            per_student[owner] = value

    ranked = sorted(per_student.items(), key=lambda kv: kv[1], reverse=True)
    student_id, best_score = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else -1.0

    if best_score < threshold:
        return door_react({
            "result": "denied",
            "message": "ไม่พบข้อมูลผู้ใช้ กรุณาลงทะเบียนก่อน",
            "speak": settings.get("voice_denied_text") or "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
            "next_delay_seconds": delay,
            "face_detection": visual,
        })

    # Two people scoring almost the same means the frame is not good enough to
    # tell them apart — ask for another scan instead of guessing.
    if best_score - runner_up < 0.04 and runner_up > 0:
        return {
            "result": "denied",
            "message": "ภาพไม่ชัดพอ กรุณามองกล้องตรงๆ อีกครั้ง",
            "speak": "กรุณามองกล้องอีกครั้ง",
            "next_delay_seconds": 2,
            "face_detection": visual,
        }

    rows_of_student = [i for i, owner in enumerate(owners) if owner == student_id]
    confidence = float(max(scores[i] for i in rows_of_student))
    geometry_score = None
    if live_geometry:
        sims = [
            geometry_similarity(live_geometry, geoms[i]) for i in rows_of_student
        ]
        sims = [s for s in sims if s is not None]
        if sims:
            geometry_score = max(sims)

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

    last_error = None
    for attempt in range(2):
        try:
            res = requests.post(
                f"{CLOUD_URL}/api/public/kiosk/attendance",
                headers=HEADERS,
                json=payload,
                timeout=15,
            )
            res.raise_for_status()
            return door_react({**res.json(), "face_detection": visual})
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt == 0:
                time.sleep(0.6)

    # Offline: keep the scan on disk and retry in the background so the
    # kiosk can still greet the person straight away.
    print(f"[agent] upload failed, queued offline: {last_error}")
    outbox_append(payload)
    with lock:
        person = state["students"].get(student_id) or {}
    name = person.get("full_name") or "ผู้ใช้งาน"
    return door_react({
        "result": "ok",
        "offline": True,
        "message": f"บันทึกเวลาแบบออฟไลน์ให้ {name} แล้ว",
        "speak": f"สแกนสำเร็จ {name}",
        "next_delay_seconds": delay,
        "face_detection": visual,
    })



if __name__ == "__main__":
    import uvicorn

    if not DEVICE_KEY:
        raise SystemExit("ตั้งค่า FACEGATE_DEVICE_KEY ก่อนเริ่มโปรแกรม (ดูรหัสได้ในหน้าตั้งค่าระบบ)")
    load_cache()
    door.start()
    threading.Thread(target=sync_loop, daemon=True).start()
    threading.Thread(target=outbox_loop, daemon=True).start()

    uvicorn.run(app, host="127.0.0.1", port=PORT)
