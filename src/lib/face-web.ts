/**
 * Browser-side face measurement (face-api / TF.js).
 * Only measures the face; every match/allow decision happens on the server.
 * Import this module dynamically — it must never run during SSR.
 */
type FaceApi = typeof import("@vladmandic/face-api");

let apiPromise: Promise<FaceApi> | null = null;

export type FaceBox = { x: number; y: number; width: number; height: number };

export type FaceMeasurement = {
  descriptor: number[];
  geometry: Record<string, number>;
  box: FaceBox;
  /** Detector confidence 0-1. */
  score: number;
  /** Fraction of the frame covered by the face box (0-1). */
  coverage: number;
  /** Frame size the box refers to. */
  frame: { width: number; height: number };
};

export async function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      const url = "/models";
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return faceapi;
    })();
  }
  return apiPromise;
}

type Point = { x: number; y: number };

function center(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Distances between eyes, nose, mouth and jaw, normalised by the inter-ocular
 * distance so the numbers stay stable regardless of how close the person
 * stands to the camera.
 */
function buildGeometry(landmarks: {
  getLeftEye: () => Point[];
  getRightEye: () => Point[];
  getNose: () => Point[];
  getMouth: () => Point[];
  getJawOutline: () => Point[];
}): Record<string, number> {
  const leftEye = center(landmarks.getLeftEye());
  const rightEye = center(landmarks.getRightEye());
  const nose = center(landmarks.getNose());
  const mouth = center(landmarks.getMouth());
  const jaw = landmarks.getJawOutline();
  const chin = jaw[Math.floor(jaw.length / 2)] ?? nose;
  const jawLeft = jaw[0] ?? leftEye;
  const jawRight = jaw[jaw.length - 1] ?? rightEye;

  const eyeDistance = dist(leftEye, rightEye) || 1;
  const eyeMid = center([leftEye, rightEye]);

  return {
    eye_to_nose: dist(eyeMid, nose) / eyeDistance,
    eye_to_mouth: dist(eyeMid, mouth) / eyeDistance,
    nose_to_mouth: dist(nose, mouth) / eyeDistance,
    nose_to_chin: dist(nose, chin) / eyeDistance,
    face_width: dist(jawLeft, jawRight) / eyeDistance,
    left_eye_to_nose: dist(leftEye, nose) / eyeDistance,
    right_eye_to_nose: dist(rightEye, nose) / eyeDistance,
    mouth_width: dist(landmarks.getMouth()[0] ?? mouth, landmarks.getMouth()[6] ?? mouth) / eyeDistance,
  };
}

export type DetectOutcome =
  | { status: "no_face" }
  | { status: "multiple_faces"; count: number; boxes: FaceBox[]; frame: { width: number; height: number } }
  | { status: "ok"; face: FaceMeasurement };

function frameSize(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
  if (input instanceof HTMLVideoElement) return { width: input.videoWidth, height: input.videoHeight };
  if (input instanceof HTMLImageElement) return { width: input.naturalWidth, height: input.naturalHeight };
  return { width: input.width, height: input.height };
}

/** Measures exactly one face in the frame; rejects empty or crowded frames. */
export async function measureSingleFace(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<DetectOutcome> {
  const faceapi = await loadFaceApi();
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const results = await faceapi
    .detectAllFaces(input as HTMLCanvasElement, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const frame = frameSize(input);
  if (results.length === 0) return { status: "no_face" };
  if (results.length > 1) {
    return {
      status: "multiple_faces",
      count: results.length,
      frame,
      boxes: results.map((r) => ({
        x: r.detection.box.x,
        y: r.detection.box.y,
        width: r.detection.box.width,
        height: r.detection.box.height,
      })),
    };
  }

  const first = results[0]!;
  const box = {
    x: first.detection.box.x,
    y: first.detection.box.y,
    width: first.detection.box.width,
    height: first.detection.box.height,
  };
  const area = Math.max(1, frame.width * frame.height);
  return {
    status: "ok",
    face: {
      descriptor: Array.from(first.descriptor),
      geometry: buildGeometry(first.landmarks as never),
      box,
      score: first.detection.score,
      coverage: (box.width * box.height) / area,
      frame,
    },
  };
}

/** Measures a face from an image URL (used to prepare enrolled photos). */
export async function measureImageUrl(url: string): Promise<DetectOutcome> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return measureSingleFace(img);
}
