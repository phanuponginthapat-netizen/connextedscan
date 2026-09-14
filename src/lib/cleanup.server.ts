import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CleanupResult = {
  snapshotsDeleted: number;
  logsDeleted: number;
  alertsDeleted: number;
  visitorsDeleted: number;
  notificationsDeleted: number;
  snapshotRetentionDays: number;
  logRetentionDays: number;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * Removes scan evidence photos and history that are older than the retention
 * periods configured in the admin settings.
 */
export async function runCleanup(source: "cron" | "manual"): Promise<CleanupResult> {
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("snapshot_retention_days, log_retention_days")
    .eq("id", true)
    .maybeSingle();

  const snapshotDays = Math.max(1, settings?.snapshot_retention_days ?? 90);
  const logDays = Math.max(snapshotDays, settings?.log_retention_days ?? 365);

  const result: CleanupResult = {
    snapshotsDeleted: 0,
    logsDeleted: 0,
    alertsDeleted: 0,
    visitorsDeleted: 0,
    notificationsDeleted: 0,
    snapshotRetentionDays: snapshotDays,
    logRetentionDays: logDays,
  };

  // 1. Old scan photos: delete the files, keep the history rows.
  const snapshotCutoff = daysAgo(snapshotDays);
  for (let page = 0; page < 40; page += 1) {
    const { data: rows } = await supabaseAdmin
      .from("attendance_logs")
      .select("id, snapshot_path")
      .not("snapshot_path", "is", null)
      .lt("scanned_at", snapshotCutoff)
      .limit(500);
    if (!rows || rows.length === 0) break;

    const paths = rows.map((r) => r.snapshot_path).filter(Boolean) as string[];
    if (paths.length > 0) await supabaseAdmin.storage.from("faces").remove(paths);
    await supabaseAdmin
      .from("attendance_logs")
      .update({ snapshot_path: null })
      .in(
        "id",
        rows.map((r) => r.id),
      );
    result.snapshotsDeleted += paths.length;
    if (rows.length < 500) break;
  }

  // 2. Old visitor photos.
  const { data: visitorRows } = await supabaseAdmin
    .from("visitor_logs")
    .select("id, snapshot_path")
    .not("snapshot_path", "is", null)
    .lt("scanned_at", snapshotCutoff)
    .limit(2000);
  const visitorPaths = (visitorRows ?? []).map((r) => r.snapshot_path).filter(Boolean) as string[];
  if (visitorPaths.length > 0) {
    await supabaseAdmin.storage.from("faces").remove(visitorPaths);
    result.snapshotsDeleted += visitorPaths.length;
  }

  // 3. History older than the log retention period.
  const logCutoff = daysAgo(logDays);
  const countDeleted = async (
    table: "attendance_logs" | "security_alerts" | "visitor_logs" | "notification_logs",
    column: string,
  ) => {
    const { data } = await supabaseAdmin.from(table).delete().lt(column, logCutoff).select("id");
    return data?.length ?? 0;
  };

  result.logsDeleted = await countDeleted("attendance_logs", "scanned_at");
  result.alertsDeleted = await countDeleted("security_alerts", "created_at");
  result.visitorsDeleted = await countDeleted("visitor_logs", "scanned_at");
  result.notificationsDeleted = await countDeleted("notification_logs", "created_at");

  await supabaseAdmin
    .from("settings")
    .update({ cleanup_last_at: new Date().toISOString() })
    .eq("id", true);

  console.log(`[cleanup:${source}]`, JSON.stringify(result));
  return result;
}
