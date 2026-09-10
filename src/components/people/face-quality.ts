import type { FaceMeasurement } from "@/lib/face-web";

export type FaceQuality = {
  /** 0-100 overall usability score of the captured face. */
  percent: number;
  hints: string[];
  details: { label: string; value: string }[];
};

function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Turns a raw measurement into a friendly quality score: how sure the detector
 * is, how big the face is in the frame, how centred it is and how straight the
 * person is facing the camera.
 */
export function scoreFace(face: FaceMeasurement): FaceQuality {
  const hints: string[] = [];

  const detection = clamp(face.score);
  if (detection < 0.75) hints.push("ภาพไม่ค่อยชัด ลองเพิ่มแสงด้านหน้า");

  // Ideal face coverage is roughly 8%-35% of the frame.
  const coverage = face.coverage;
  let size = 1;
  if (coverage < 0.08) {
    size = clamp(coverage / 0.08);
    hints.push("ใบหน้าเล็กเกินไป ขยับเข้าใกล้กล้อง");
  } else if (coverage > 0.35) {
    size = clamp(1 - (coverage - 0.35) / 0.35);
    hints.push("ใบหน้าใหญ่เกินกรอบ ถอยออกเล็กน้อย");
  }

  const cx = (face.box.x + face.box.width / 2) / Math.max(1, face.frame.width);
  const cy = (face.box.y + face.box.height / 2) / Math.max(1, face.frame.height);
  const offset = Math.hypot(cx - 0.5, cy - 0.5);
  const centring = clamp(1 - offset / 0.35);
  if (centring < 0.6) hints.push("ขยับใบหน้าให้อยู่กลางกรอบ");

  const left = face.geometry["left_eye_to_nose"] ?? 0;
  const right = face.geometry["right_eye_to_nose"] ?? 0;
  const symmetry = left && right ? clamp(1 - Math.abs(left - right) / Math.max(left, right)) : 0.8;
  if (symmetry < 0.7) hints.push("หันหน้าตรงกล้องมากขึ้น");

  const percent = Math.round(
    (detection * 0.4 + size * 0.25 + centring * 0.15 + symmetry * 0.2) * 100,
  );

  return {
    percent,
    hints,
    details: [
      { label: "ความชัดของการตรวจจับ", value: `${Math.round(detection * 100)}%` },
      { label: "ขนาดใบหน้าในกรอบ", value: `${(coverage * 100).toFixed(1)}%` },
      { label: "ความอยู่กลางกรอบ", value: `${Math.round(centring * 100)}%` },
      { label: "ความตรงของใบหน้า", value: `${Math.round(symmetry * 100)}%` },
      { label: "ระยะตา–จมูก", value: (face.geometry["eye_to_nose"] ?? 0).toFixed(2) },
      { label: "ระยะตา–ปาก", value: (face.geometry["eye_to_mouth"] ?? 0).toFixed(2) },
      { label: "ความกว้างใบหน้า", value: (face.geometry["face_width"] ?? 0).toFixed(2) },
      { label: "ความกว้างปาก", value: (face.geometry["mouth_width"] ?? 0).toFixed(2) },
    ],
  };
}
