import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Weekly safety copy: everything needed to rebuild the register (people,
 * their face data and the attendance history) is written as one JSON file
 * into the private "downloads" bucket.
 */
export async function runBackup(reason: "cron" | "manual") {
  const [{ data: students }, { data: faces }, { data: logs }, { data: settings }] =
    await Promise.all([
      supabaseAdmin.from("students").select("*"),
      supabaseAdmin
        .from("student_faces")
        .select("id, student_id, image_path, source, status, quality, geometry, created_at"),
      supabaseAdmin
        .from("attendance_logs")
        .select("*")
        .order("scanned_at", { ascending: false })
        .limit(50000),
      supabaseAdmin.from("settings").select("*").eq("id", true).maybeSingle(),
    ]);

  const payload = {
    created_at: new Date().toISOString(),
    reason,
    counts: {
      students: students?.length ?? 0,
      faces: faces?.length ?? 0,
      attendance_logs: logs?.length ?? 0,
    },
    students: students ?? [],
    faces: faces ?? [],
    attendance_logs: logs ?? [],
    settings: settings ?? null,
  };

  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  const path = `backups/facegate-${stamp}.json`;
  const body = new TextEncoder().encode(JSON.stringify(payload));

  const { error } = await supabaseAdmin.storage
    .from("downloads")
    .upload(path, body, { contentType: "application/json", upsert: true });
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("settings")
    .update({ backup_last_at: new Date().toISOString() })
    .eq("id", true);

  const { data: signed } = await supabaseAdmin.storage
    .from("downloads")
    .createSignedUrl(path, 60 * 60);

  return { path, url: signed?.signedUrl ?? null, counts: payload.counts };
}

/** True when today is the configured backup day and none ran yet today. */
export function backupIsDue(
  settings: { backup_enabled: boolean; backup_weekday: number; backup_last_at: string | null } | null,
): boolean {
  if (!settings?.backup_enabled) return false;
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  }).format(new Date());
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(today);
  if (weekday !== Number(settings.backup_weekday ?? 0)) return false;
  if (!settings.backup_last_at) return true;
  return Date.now() - new Date(settings.backup_last_at).getTime() > 20 * 60 * 60 * 1000;
}
