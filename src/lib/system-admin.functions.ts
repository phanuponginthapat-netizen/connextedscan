import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminContext = {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: boolean | null }>;
  };
  userId: string;
};

async function assertAdmin(context: AdminContext) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Deletes scan photos and history past the configured retention period. */
export const cleanupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runCleanup } = await import("@/lib/cleanup.server");
    return runCleanup("manual");
  });

/** Runs the notification checks immediately (used by the "test now" button). */
export const notifyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runNotificationChecks } = await import("@/lib/notify.server");
    const results = await runNotificationChecks("manual", true);
    return {
      groups: results.length,
      line: results.reduce((sum, r) => sum + r.line, 0),
      email: results.reduce((sum, r) => sum + r.email, 0),
      blocked: results.flatMap((r) => r.blocked).slice(0, 10),
      subjects: results.map((r) => r.subject),
    };
  });

/** Sends one test message to every active recipient. */
export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ message: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { notify } = await import("@/lib/notify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("notify_email_enabled, notify_line_enabled")
      .eq("id", true)
      .maybeSingle();

    const result = await notify("device_offline", "ทดสอบการแจ้งเตือน FaceGate", data.message, {
      email: settings?.notify_email_enabled ?? false,
      line: settings?.notify_line_enabled ?? false,
    });
    return { line: result.line, email: result.email, blocked: result.blocked };
  });

/** Builds and sends the attendance summary report immediately. */
export const weeklyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(90).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { sendAttendanceReport } = await import("@/lib/report.server");
    return sendAttendanceReport(data.days ?? 7);
  });

/** Health snapshot of kiosk devices, data volumes and background jobs. */
export const systemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [devices, settings, lastScan, counts, alerts, notifications] = await Promise.all([
      supabase
        .from("devices")
        .select("id, name, location, default_direction, is_active, last_seen_at, agent_version, platform, disk_free_mb, camera_ok, door_ok, health_note")
        .order("name"),
      supabase
        .from("settings")
        .select(
          "device_offline_minutes, cleanup_enabled, cleanup_last_at, notify_last_at, backup_last_at, backup_enabled, snapshot_retention_days, log_retention_days, notify_email_enabled, notify_line_enabled, weekly_report_enabled, weekly_report_last_at",
        )
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("attendance_logs")
        .select("scanned_at, device_name, status")
        .order("scanned_at", { ascending: false })
        .limit(1),
      Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("attendance_logs").select("id", { count: "exact", head: true }),
        supabase.from("student_faces").select("id", { count: "exact", head: true }),
        supabase
          .from("student_faces")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]),
      supabase
        .from("security_alerts")
        .select("id", { count: "exact", head: true })
        .is("acknowledged_at", null),
      supabase
        .from("notification_logs")
        .select("channel, event, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const offlineMinutes = Math.max(2, settings.data?.device_offline_minutes ?? 15);
    const cutoff = Date.now() - offlineMinutes * 60_000;

    return {
      offlineMinutes,
      settings: settings.data ?? null,
      devices: (devices.data ?? []).map((d) => ({
        ...d,
        online: Boolean(d.last_seen_at && new Date(d.last_seen_at).getTime() >= cutoff),
      })),
      lastScan: lastScan.data?.[0] ?? null,
      counts: {
        people: counts[0].count ?? 0,
        scans: counts[1].count ?? 0,
        faces: counts[2].count ?? 0,
        facesPending: counts[3].count ?? 0,
        openAlerts: alerts.count ?? 0,
      },
      notifications: notifications.data ?? [],
    };
  });
