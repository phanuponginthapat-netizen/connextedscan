import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bangkokMinutes, timeToMinutes } from "@/lib/kiosk-auth.server";

export type RecordScanInput = {
  studentId: string;
  confidence: number;
  /** cosine score of the facial landmark geometry (eye/nose/mouth distances) */
  geometryScore?: number | null;
  geometry?: Record<string, number> | null;
  /** base64 JPEG of the captured face, stored as scan evidence */
  snapshot?: string | null;
  /** ArcFace embedding from the local program, used for automatic re-enrolment */
  embedding?: number[] | null;
  /** browser (face-api) descriptor, used for automatic re-enrolment of web scans */
  webEmbedding?: number[] | null;
  direction?: "in" | "out" | null;
  deviceName?: string | null;
  deviceDefaultDirection?: string;
};

function decodeBase64Jpeg(value: string): Uint8Array | null {
  try {
    const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.length > 0 && bytes.length < 5_000_000 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Shared scan bookkeeping: geometry check, snapshot storage, direction
 * decision, duplicate cooldown, attendance insert, auto-enrolment and the
 * Thai voice line. Used by both the local-agent route and the web-scan route.
 */
export async function recordScan(input: RecordScanInput) {
  const { studentId, confidence } = input;

  const [{ data: settings }, { data: student }] = await Promise.all([
    supabaseAdmin.from("settings").select("*").eq("id", true).maybeSingle(),
    supabaseAdmin
      .from("students")
      .select("id, full_name, nickname, student_code, class_room, is_active, avatar_path")
      .eq("id", studentId)
      .maybeSingle(),
  ]);

  if (!student || !student.is_active) {
    return {
      result: "denied" as const,
      message: "ไม่พบข้อมูลนักเรียน หรือถูกระงับการใช้งาน",
      speak: "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
      next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
    };
  }

  const now = bangkokMinutes();
  const cooldown = settings?.duplicate_cooldown_minutes ?? 300;
  const geometryScore = input.geometryScore ?? null;
  const deviceName = input.deviceName ?? null;

  // Second opinion: facial landmark geometry (eye/nose/mouth distances).
  const geometryMin = settings?.geometry_min_score ?? 0.5;
  if (geometryScore !== null && geometryScore < geometryMin) {
    await supabaseAdmin.from("attendance_logs").insert({
      student_id: studentId,
      direction: "in",
      status: "geometry_reject",
      confidence,
      geometry_score: geometryScore,
      device_name: deviceName,
    });
    return {
      result: "denied" as const,
      message: "สัดส่วนใบหน้าไม่ตรงกับข้อมูลที่ลงทะเบียน",
      speak: "ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่",
      next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
    };
  }

  // Store the captured face as scan evidence.
  let snapshotPath: string | null = null;
  if ((settings?.save_snapshots ?? true) && input.snapshot) {
    const bytes = decodeBase64Jpeg(input.snapshot);
    if (bytes) {
      const path = `snapshots/${studentId}/${Date.now()}.jpg`;
      const { error } = await supabaseAdmin.storage
        .from("faces")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (!error) snapshotPath = path;
    }
  }

  // Decide direction from the configured windows.
  let direction = input.direction ?? null;
  const deviceDefault = input.deviceDefaultDirection ?? "auto";
  if (!direction && deviceDefault !== "auto") {
    direction = deviceDefault === "out" ? "out" : "in";
  }
  if (!direction && settings) {
    const inStart = timeToMinutes(settings.checkin_start);
    const inEnd = timeToMinutes(settings.checkin_end);
    const outStart = timeToMinutes(settings.checkout_start);
    const outEnd = timeToMinutes(settings.checkout_end);
    if (now >= inStart && now <= inEnd) direction = "in";
    else if (now >= outStart && now <= outEnd) direction = "out";
  }
  if (!direction) direction = now < 720 ? "in" : "out";

  // Duplicate protection.
  const since = new Date(Date.now() - cooldown * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("attendance_logs")
    .select("id, scanned_at, direction")
    .eq("student_id", studentId)
    .eq("direction", direction)
    .eq("status", "ok")
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false })
    .limit(1);

  const displayName = student.nickname?.trim() || student.full_name;
  const directionLabel = direction === "in" ? "เข้าโรงเรียน" : "ออกจากโรงเรียน";

  // Signed URL of the profile photo, so the kiosk can show the face
  // of the matched person right after a scan.
  let avatarUrl: string | null = null;
  if (student.avatar_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("faces")
      .createSignedUrl(student.avatar_path, 60 * 60);
    avatarUrl = signed?.signedUrl ?? null;
  }

  // Signed URL of the photo captured during this scan, shown next to the
  // profile picture as proof the scan really happened.
  let snapshotUrl: string | null = null;
  if (snapshotPath) {
    const { data: signedShot } = await supabaseAdmin.storage
      .from("faces")
      .createSignedUrl(snapshotPath, 60 * 60);
    snapshotUrl = signedShot?.signedUrl ?? null;
  }

  if (recent && recent.length > 0) {
    await supabaseAdmin.from("attendance_logs").insert({
      student_id: studentId,
      direction,
      status: "duplicate",
      confidence,
      geometry_score: geometryScore,
      snapshot_path: snapshotPath,
      device_name: deviceName,
    });
    return {
      result: "duplicate" as const,
      student,
      direction,
      avatar_url: avatarUrl,
      message: `${student.full_name} สแกน${directionLabel}ไปแล้ว`,
      speak: `${displayName} สแกนไปแล้ว`,
      next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
    };
  }

  const late = direction === "in" && settings ? now > timeToMinutes(settings.late_after) : false;

  const { data: inserted } = await supabaseAdmin
    .from("attendance_logs")
    .insert({
      student_id: studentId,
      direction,
      status: "ok",
      confidence,
      geometry_score: geometryScore,
      snapshot_path: snapshotPath,
      device_name: deviceName,
    })
    .select("id, scanned_at")
    .maybeSingle();

  // Long-term accuracy: fold confident scans back into the enrolled set,
  // so the face stays up to date as the person grows or changes look.
  let autoEnrolled = false;
  const autoMin = settings?.auto_enroll_min_confidence ?? 0.62;
  if (
    (settings?.auto_enroll ?? true) &&
    snapshotPath &&
    (input.embedding || input.webEmbedding) &&
    confidence >= autoMin
  ) {
    const { count } = await supabaseAdmin
      .from("student_faces")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("source", "auto");
    if ((count ?? 0) < (settings?.auto_enroll_max_faces ?? 12)) {
      const { error } = await supabaseAdmin.from("student_faces").insert({
        student_id: studentId,
        image_path: snapshotPath,
        source: "auto",
        status: input.embedding ? "ready" : "pending",
        embedding: input.embedding ?? null,
        web_embedding: input.webEmbedding ?? null,
        geometry: input.geometry ?? null,
        quality: confidence,
        processed_at: new Date().toISOString(),
      });
      autoEnrolled = !error;
    }
  }

  const template = settings?.voice_template ?? "สแกนสำเร็จ {name} {direction}";
  const speak = template
    .replace("{name}", displayName)
    .replace("{direction}", directionLabel)
    .replace("{code}", student.student_code)
    .replace("{class}", student.class_room ?? "");

  return {
    result: "ok" as const,
    student,
    direction,
    avatar_url: avatarUrl,
    late,
    log: inserted,
    geometry_score: geometryScore,
    auto_enrolled: autoEnrolled,
    message: `สแกนสำเร็จ: ${student.full_name} (${directionLabel})${late ? " • มาสาย" : ""}`,
    speak: late ? `${speak} มาสาย` : speak,
    next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
  };
}
