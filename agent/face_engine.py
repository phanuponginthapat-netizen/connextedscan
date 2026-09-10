"""
Self-contained ArcFace engine (no insightface package required).

Runs two ONNX models with onnxruntime only, so the whole program can be
shipped as a ready-to-run bundle without compiling anything:

  * det_500m.onnx   - SCRFD face detector (bbox + 5 keypoints)
  * w600k_mbf.onnx  - ArcFace recognition model (512-d embedding)

Model files are looked up in agent/models/ (or FACEGATE_MODEL_DIR).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import cv2
import numpy as np
import onnxruntime

MODEL_DIR = os.environ.get(
    "FACEGATE_MODEL_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
)

DET_MODEL = os.path.join(MODEL_DIR, "det_500m.onnx")
REC_MODEL = os.path.join(MODEL_DIR, "w600k_mbf.onnx")

# ArcFace canonical 5-point template for a 112x112 crop.
ARCFACE_DST = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


@dataclass
class Face:
    bbox: np.ndarray
    kps: np.ndarray
    det_score: float
    normed_embedding: np.ndarray = field(default_factory=lambda: np.zeros(512, dtype=np.float32))


def _distance2bbox(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack([x1, y1, x2, y2], axis=-1)


def _distance2kps(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    preds = []
    for i in range(0, distance.shape[1], 2):
        preds.append(points[:, 0] + distance[:, i])
        preds.append(points[:, 1] + distance[:, i + 1])
    return np.stack(preds, axis=-1)


def _nms(dets: np.ndarray, thresh: float = 0.4) -> list[int]:
    x1, y1, x2, y2, scores = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3], dets[:, 4]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[1:][ovr <= thresh]
    return keep


def _norm_crop(img: np.ndarray, kps: np.ndarray) -> np.ndarray:
    matrix, _ = cv2.estimateAffinePartial2D(
        kps.astype(np.float32), ARCFACE_DST, method=cv2.LMEDS
    )
    if matrix is None:
        matrix = cv2.getAffineTransform(kps[:3].astype(np.float32), ARCFACE_DST[:3])
    return cv2.warpAffine(img, matrix, (112, 112), borderValue=0.0)


class FaceEngine:
    """Minimal drop-in replacement for insightface's FaceAnalysis."""

    def __init__(self, det_size: tuple[int, int] = (320, 320), det_thresh: float = 0.5) -> None:
        for path in (DET_MODEL, REC_MODEL):
            if not os.path.exists(path):
                raise FileNotFoundError(
                    f"Model file missing: {path}. Run the installer again to download it."
                )

        opts = onnxruntime.SessionOptions()
        opts.log_severity_level = 3
        opts.intra_op_num_threads = max(1, min(4, (os.cpu_count() or 2)))
        providers = ["CPUExecutionProvider"]

        self.det = onnxruntime.InferenceSession(DET_MODEL, opts, providers=providers)
        self.rec = onnxruntime.InferenceSession(REC_MODEL, opts, providers=providers)
        self.det_input = self.det.get_inputs()[0].name
        self.det_outputs = [o.name for o in self.det.get_outputs()]
        self.rec_input = self.rec.get_inputs()[0].name
        self.det_size = det_size
        self.det_thresh = det_thresh
        # SCRFD 500m: 3 strides, 2 anchors each, batched outputs (score, bbox, kps)
        self.strides = [8, 16, 32]
        self.num_anchors = 2
        self._centers: dict[tuple[int, int, int], np.ndarray] = {}

    # -- detection -----------------------------------------------------
    def _centers_for(self, height: int, width: int, stride: int) -> np.ndarray:
        key = (height, width, stride)
        cached = self._centers.get(key)
        if cached is not None:
            return cached
        ys, xs = np.mgrid[:height, :width]
        centers = np.stack([xs, ys], axis=-1).astype(np.float32) * stride
        centers = centers.reshape(-1, 2)
        if self.num_anchors > 1:
            centers = np.stack([centers] * self.num_anchors, axis=1).reshape(-1, 2)
        self._centers[key] = centers
        return centers

    def detect(self, bgr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        model_w, model_h = self.det_size
        img_h, img_w = bgr.shape[:2]
        scale = min(model_w / img_w, model_h / img_h)
        resized = cv2.resize(bgr, (int(round(img_w * scale)), int(round(img_h * scale))))
        canvas = np.zeros((model_h, model_w, 3), dtype=np.uint8)
        canvas[: resized.shape[0], : resized.shape[1]] = resized

        blob = cv2.dnn.blobFromImage(
            canvas, 1.0 / 128.0, (model_w, model_h), (127.5, 127.5, 127.5), swapRB=True
        )
        outputs = self.det.run(self.det_outputs, {self.det_input: blob})

        scores_list, bboxes_list, kps_list = [], [], []
        fmc = len(self.strides)
        for idx, stride in enumerate(self.strides):
            scores = outputs[idx].reshape(-1)
            bbox_preds = outputs[idx + fmc].reshape(-1, 4) * stride
            kps_preds = outputs[idx + fmc * 2].reshape(-1, 10) * stride
            centers = self._centers_for(model_h // stride, model_w // stride, stride)

            keep = np.where(scores >= self.det_thresh)[0]
            if keep.size == 0:
                continue
            scores_list.append(scores[keep])
            bboxes_list.append(_distance2bbox(centers, bbox_preds)[keep])
            kps_list.append(_distance2kps(centers, kps_preds)[keep].reshape(-1, 5, 2))

        if not scores_list:
            return np.zeros((0, 5), dtype=np.float32), np.zeros((0, 5, 2), dtype=np.float32)

        scores = np.concatenate(scores_list)
        bboxes = np.concatenate(bboxes_list) / scale
        kpss = np.concatenate(kps_list) / scale
        dets = np.hstack([bboxes, scores[:, None]]).astype(np.float32)
        order = _nms(dets)
        return dets[order], kpss[order].astype(np.float32)

    # -- recognition ---------------------------------------------------
    def embed(self, bgr: np.ndarray, kps: np.ndarray) -> np.ndarray:
        crop = _norm_crop(bgr, kps)
        blob = cv2.dnn.blobFromImage(crop, 1.0 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
        vec = self.rec.run(None, {self.rec_input: blob})[0].reshape(-1)
        norm = np.linalg.norm(vec)
        return (vec / norm).astype(np.float32) if norm else vec.astype(np.float32)

    def get(self, bgr: np.ndarray) -> list[Face]:
        dets, kpss = self.detect(bgr)
        faces: list[Face] = []
        for i in range(dets.shape[0]):
            kps = kpss[i]
            faces.append(
                Face(
                    bbox=dets[i, :4],
                    kps=kps,
                    det_score=float(dets[i, 4]),
                    normed_embedding=self.embed(bgr, kps),
                )
            )
        return faces
