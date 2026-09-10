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
import os
import threading
import time
from typing import Any

import cv2
import numpy as np
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from insightface.app import FaceAnalysis
from pydantic import BaseModel

CLOUD_URL = os.environ.get("FACEGATE_CLOUD_URL", "https://project--8a2237fd-d733-4dca-9c68-fe5d05c002f8.lovable.app")
DEVICE_KEY = os.environ.get("FACEGATE_DEVICE_KEY", "")
SYNC_SECONDS = int(os.environ.get("FACEGATE_SYNC_SECONDS", "30"))
PORT = int(os.environ.get("FACEGATE_PORT", "8899"))

HEADERS = {"x-device-key": DEVICE_KEY, "content-type": "application/json"}

app = FastAPI(title="FaceGate Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ArcFace. det_size kept small so an Intel Atom can keep up.
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=-1, det_size=(320, 320))

state: dict[str, Any] = {
    "matrix": np.zeros((0, 512), dtype=np.float32),  # normalised embeddings
    "owners": [],  # student_id per row
    "students": {},
    "settings": {},
    "last_sync": None,
}
lock = threading.Lock()


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


def sync_once() -> None:
    res = requests.post(f"{CLOUD_URL}/api/public/kiosk/sync", headers=HEADERS, json={}, timeout=30)
    res.raise_for_status()
    data = res.json()

    rows, owners = [], []
    for item in data.get("embeddings", []):
        vec = np.array(item["embedding"], dtype=np.float32)
        if vec.size:
            rows.append(normalise(vec))
            owners.append(item["student_id"])

    with lock:
        state["matrix"] = np.vstack(rows) if rows else np.zeros((0, 512), dtype=np.float32)
        state["owners"] = owners
        state["students"] = {s["id"]: s for s in data.get("students", [])}
        state["settings"] = data.get("settings") or {}
        state["last_sync"] = time.time()

    pending = data.get("pending", [])
    if pending:
        process_pending(pending)


def process_pending(pending: list[dict]) -> None:
    """Compute embeddings for newly registered photos and send them back."""
    results = []
    for item in pending:
        try:
            img_bytes = requests.get(item["url"], timeout=30).content
            arr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
            face = embed_image(arr) if arr is not None else None
            if face is None:
                results.append({"face_id": item["id"], "error": "ไม่พบใบหน้าในรูปนี้"})
                continue
            results.append(
                {
                    "face_id": item["id"],
                    "embedding": normalise(face.normed_embedding).tolist(),
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
        return {
            "ok": True,
            "known_faces": int(state["matrix"].shape[0]),
            "students": len(state["students"]),
            "last_sync": state["last_sync"],
        }


@app.post("/scan")
def scan(req: ScanRequest):
    raw = req.image.split(",", 1)[-1]
    arr = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_COLOR)
    if arr is None:
        return {"result": "no_face", "message": ""}

    face = embed_image(arr)
    if face is None:
        return {"result": "no_face", "message": ""}

    with lock:
        matrix = state["matrix"]
        owners = list(state["owners"])
        settings = dict(state["settings"])

    threshold = float(settings.get("match_threshold") or 0.45)
    delay = int(settings.get("next_person_delay_seconds") or 3)

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
    scores = matrix @ query
    best = int(np.argmax(scores))
    confidence = float(scores[best])

    if confidence < threshold:
        return {
            "result": "denied",
            "message": "ไม่พบข้อมูลผู้ใช้ กรุณาลงทะเบียนก่อน",
            "speak": "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
            "next_delay_seconds": delay,
        }

    student_id = owners[best]
    res = requests.post(
        f"{CLOUD_URL}/api/public/kiosk/attendance",
        headers=HEADERS,
        json={"student_id": student_id, "confidence": round(confidence, 4)},
        timeout=20,
    )
    return res.json()


if __name__ == "__main__":
    import uvicorn

    if not DEVICE_KEY:
        raise SystemExit("ตั้งค่า FACEGATE_DEVICE_KEY ก่อนเริ่มโปรแกรม (ดูรหัสได้ในหน้าตั้งค่าระบบ)")
    threading.Thread(target=sync_loop, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT)
