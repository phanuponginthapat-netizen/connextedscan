/**
 * Browser-side face measurement (face-api / TF.js).
 * Only measures the face; every match/allow decision happens on the server.
 * Import this module dynamically — it must never run during SSR.
 */
type FaceApi = typeof import("@vladmandic/face-api");

let apiPromise: Promise<FaceApi> | null = null;

export type FaceMeasurement = {
  descriptor: number[];
  geometry: Record<string, number>;
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
  | { status: "multiple_faces"; count: number }
  | { status: "ok"; face: FaceMeasurement };

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

  if (results.length === 0) return { status: "no_face" };
  if (results.length > 1) return { status: "multiple_faces", count: results.length };

  const first = results[0]!;
  return {
    status: "ok",
    face: {
      descriptor: Array.from(first.descriptor),
      geometry: buildGeometry(first.landmarks as never),
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
