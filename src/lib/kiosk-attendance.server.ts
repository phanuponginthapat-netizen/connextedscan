import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  bangkokMinutes,
  bangkokWeekday,
  decideDirection,
  isEarlyLeave,
  isLate,
  isWorkDay,
  type Direction,
} from "@/lib/attendance-rules";

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
      .select(
        "id, full_name, nickname, student_code, class_room, is_active, avatar_path, person_type, department, position, visit_date, visit_reason",
      )
      .eq("id", studentId)
      .maybeSingle(),
  ]);

  if (!student || !student.is_active) {
    return {
      result: "denied" as const,
      message: "ไม่พบข้อมูลนักเรียน หรือถูกระงับการใช้งาน",
      speak: settings?.voice_denied_text ?? "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
      next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
    };
  }

  // Visitors register themselves through the QR code and may only enter on the
  // day they registered. Apart from that they follow exactly the same scan
  // rules as the school (check-in only or check-in/out, work days, windows).
  const isVisitor = student.person_type === "visitor";
  if (isVisitor) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    if (student.visit_date !== today) {
      return {
        result: "denied" as const,
        message: "สิทธิ์ผู้มาเยือนหมดอายุแล้ว กรุณาลงทะเบียนใหม่ผ่าน QR code",
        speak: "สิทธิ์ผู้มาเยือนหมดอายุ กรุณาลงทะเบียนใหม่",
        next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
      };
    }
  }

  // Days the system is open for scanning (e.g. Mon–Fri).
  if (settings && !isWorkDay(settings, bangkokWeekday())) {
    return {
      result: "denied" as const,
      message: "วันนี้ไม่ใช่วันทำการ ระบบปิดรับการสแกน",
      speak: settings.voice_out_of_window_text ?? "ยังไม่ถึงเวลาสแกน กรุณาติดต่อเจ้าหน้าที่",
      next_delay_seconds: settings.next_person_delay_seconds ?? 5,
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
      speak: settings?.voice_denied_text ?? "ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่",
      next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
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

  // Decide direction strictly from the configured windows.
  let direction: Direction | null = input.direction ?? null;
  const deviceDefault = input.deviceDefaultDirection ?? "auto";
  if (!direction && deviceDefault !== "auto") {
    direction = deviceDefault === "out" ? "out" : "in";
  }

  if (settings) {
    const decision = decideDirection(settings, now, direction, bangkokWeekday());
    if (!decision.allowed) {
      const fmt = (v: string) => v.slice(0, 5);
      await supabaseAdmin.from("attendance_logs").insert({
        student_id: studentId,
        direction: decision.direction,
        status: "out_of_window",
        confidence,
        geometry_score: geometryScore,
        device_name: deviceName,
        snapshot_path: snapshotPath,
      });
      return {
        result: "denied" as const,
        message: `นอกช่วงเวลาที่กำหนด (เข้า ${fmt(settings.checkin_start)}-${fmt(settings.checkin_end)} / ออก ${fmt(settings.checkout_start)}-${fmt(settings.checkout_end)})`,
        speak: settings.voice_out_of_window_text ?? "ยังไม่ถึงเวลาสแกน กรุณาติดต่อเจ้าหน้าที่",
        next_delay_seconds: settings.next_person_delay_seconds ?? 5,
      };
    }
    direction = decision.direction;
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

  // Speak the full name (first + last). Nickname is opt-in via {nickname}
  // in the voice template — preferring it by default caused the kiosk to
  // speak only a surname when the nickname column held one.
  const displayName = student.full_name || student.nickname?.trim() || "";
  const nickname = student.nickname?.trim() || "";
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

  // Keep the enrolled image separate from the live scan evidence. Prefer a
  // manually enrolled face, then any ready enrolled face, then the profile.
  // Never fall back to the just-captured snapshot in the comparison panel.
  let registeredFaceUrl: string | null = null;
  const { data: enrolledFaces } = await supabaseAdmin
    .from("student_faces")
    .select("image_path, source, created_at")
    .eq("student_id", studentId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  const registeredFace =
    enrolledFaces?.find((face) => face.source !== "auto") ?? enrolledFaces?.[0];
  if (registeredFace?.image_path) {
    const { data: signedFace } = await supabaseAdmin.storage
      .from("faces")
      .createSignedUrl(registeredFace.image_path, 60 * 60);
    registeredFaceUrl = signedFace?.signedUrl ?? null;
  }
  registeredFaceUrl ??= avatarUrl;

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
      registered_face_url: registeredFaceUrl,
      snapshot_url: snapshotUrl,
      confidence,
      message: `${student.full_name} สแกนซ้ำ — บันทึกเวลา${directionLabel}ไปแล้ว`,
      speak: (settings?.voice_duplicate_template ?? "สแกนซ้ำ {name} บันทึกเวลาไปแล้ว")
        .replace("{name}", displayName)
        .replace("{nickname}", nickname)
        .replace("{direction}", directionLabel),
      next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
    };
  }

  const late = settings ? isLate(settings, now, direction) : false;
  const earlyLeave = settings ? isEarlyLeave(settings, now, direction) : false;

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
    .replace("{nickname}", nickname)
    .replace("{direction}", directionLabel)
    .replace("{code}", student.student_code)
    .replace("{class}", student.class_room ?? "");

  return {
    result: "ok" as const,
    student,
    direction,
    avatar_url: avatarUrl,
    registered_face_url: registeredFaceUrl,
    snapshot_url: snapshotUrl,
    confidence,
    late,
    early_leave: earlyLeave,
    log: inserted,
    geometry_score: geometryScore,
    auto_enrolled: autoEnrolled,
    message: `สแกนสำเร็จ: ${student.full_name} (${directionLabel})${late ? " • มาสาย" : ""}${
      earlyLeave ? " • ออกก่อนเวลา" : ""
    }`,
    speak: late ? `${speak} ${settings?.voice_late_suffix ?? "มาสายนะคะ"}` : speak,
    next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
  };
}
