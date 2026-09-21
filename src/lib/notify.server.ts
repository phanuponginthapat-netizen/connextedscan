import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bangkokMinutes, bangkokWeekday, isWorkDay, timeToMinutes } from "@/lib/attendance-rules";

export type NotifyEvent = "absent" | "late" | "early_leave" | "failed_streak" | "device_offline";

export type NotifyOutcome = {
  event: NotifyEvent;
  subject: string;
  message: string;
  line: number;
  email: number;
  blocked: string[];
};

type Recipient = {
  id: string;
  name: string;
  email: string | null;
  line_user_id: string | null;
  events: string;
};

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

function bangkokDateISO(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}

async function logDelivery(row: {
  channel: string;
  event: string;
  target: string | null;
  subject: string | null;
  message: string;
  status: string;
  error?: string | null;
}) {
  await supabaseAdmin.from("notification_logs").insert(row);
}

/** Sends one LINE push message. Returns an error string when it fails. */
async function pushLine(to: string, text: string): Promise<string | null> {
  const token = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
  if (!token) return "LINE channel access token is not configured";

  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[notify] LINE push failed [${res.status}]: ${body}`);
    return `LINE ${res.status}: ${body.slice(0, 300)}`;
  }
  return null;
}

/**
 * Sends one email. Email delivery needs a verified sender domain for this
 * project; until one exists the attempt is recorded as blocked so nothing is
 * silently lost.
 */
async function sendEmail(to: string, subject: string, text: string): Promise<string | null> {
  try {
    const { sendMail } = await import("@/lib/email/send.server");
    await sendMail({ to, subject, text });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "email send failed";
  }
}

async function activeRecipients(event: NotifyEvent): Promise<Recipient[]> {
  const { data } = await supabaseAdmin
    .from("notification_recipients")
    .select("id, name, email, line_user_id, events")
    .eq("is_active", true);
  return (data ?? []).filter((r) =>
    (r.events ?? "")
      .split(",")
      .map((e) => e.trim())
      .includes(event),
  ) as Recipient[];
}

/** Fans a message out to every recipient subscribed to the event. */
export async function notify(
  event: NotifyEvent,
  subject: string,
  message: string,
  channels: { email: boolean; line: boolean },
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { event, subject, message, line: 0, email: 0, blocked: [] };
  const recipients = await activeRecipients(event);

  for (const recipient of recipients) {
    if (channels.line && recipient.line_user_id) {
      const error = await pushLine(recipient.line_user_id, `${subject}\n\n${message}`);
      await logDelivery({
        channel: "line",
        event,
        target: recipient.line_user_id,
        subject,
        message,
        status: error ? "failed" : "sent",
        error,
      });
      if (error) outcome.blocked.push(`LINE ${recipient.name}: ${error}`);
      else outcome.line += 1;
    }

    if (channels.email && recipient.email) {
      const error = await sendEmail(recipient.email, subject, message);
      await logDelivery({
        channel: "email",
        event,
        target: recipient.email,
        subject,
        message,
        status: error ? "failed" : "sent",
        error,
      });
      if (error) outcome.blocked.push(`Email ${recipient.name}: ${error}`);
      else outcome.email += 1;
    }
  }

  return outcome;
}

/**
 * Sends one message to every active recipient, ignoring their per-event
 * subscriptions. Used for whole-school messages such as the weekly report.
 */
export async function notifyAll(
  event: NotifyEvent,
  subject: string,
  message: string,
  channels: { email: boolean; line: boolean },
): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { event, subject, message, line: 0, email: 0, blocked: [] };
  const { data } = await supabaseAdmin
    .from("notification_recipients")
    .select("id, name, email, line_user_id, events")
    .eq("is_active", true);

  for (const recipient of (data ?? []) as Recipient[]) {
    if (channels.line && recipient.line_user_id) {
      const error = await pushLine(recipient.line_user_id, `${subject}\n\n${message}`);
      await logDelivery({
        channel: "line",
        event,
        target: recipient.line_user_id,
        subject,
        message,
        status: error ? "failed" : "sent",
        error,
      });
      if (error) outcome.blocked.push(`LINE ${recipient.name}: ${error}`);
      else outcome.line += 1;
    }
    if (channels.email && recipient.email) {
      const error = await sendEmail(recipient.email, subject, message);
      await logDelivery({
        channel: "email",
        event,
        target: recipient.email,
        subject,
        message,
        status: error ? "failed" : "sent",
        error,
      });
      if (error) outcome.blocked.push(`Email ${recipient.name}: ${error}`);
      else outcome.email += 1;
    }
  }

  return outcome;
}

 type Settings = {
  notify_email_enabled: boolean;
  notify_line_enabled: boolean;
  notify_absent: boolean;
  notify_late: boolean;
  notify_early_leave: boolean;
  notify_failed_streak: boolean;
  notify_device_offline: boolean;
  device_offline_minutes: number;
  absent_check_time: string;
  late_after: string;
  late_grace_minutes: number | null;
  early_leave_before: string;
  work_days: string | null;
  block_non_work_days: boolean | null;
  checkin_start: string;
  checkin_end: string;
  checkout_start: string;
  checkout_end: string;
  checkin_only_mode: boolean | null;
};

const thaiTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * One pass of the automatic notification checks: who is absent, who arrived
 * late, who left early, repeated failed scans and offline kiosk devices.
 */
export async function runNotificationChecks(
  source: "cron" | "manual",
  force = false,
): Promise<NotifyOutcome[]> {
  const { data } = await supabaseAdmin.from("settings").select("*").eq("id", true).maybeSingle();
  if (!data) return [];
  const settings = data as unknown as Settings;

  const channels = {
    email: settings.notify_email_enabled,
    line: settings.notify_line_enabled,
  };
  const results: NotifyOutcome[] = [];
  if (!channels.email && !channels.line) return results;

  const today = bangkokDateISO();
  const dayStart = new Date(`${today}T00:00:00+07:00`).toISOString();
  const now = bangkokMinutes();
  const workDay = isWorkDay(settings, bangkokWeekday());

  const { data: people } = await supabaseAdmin
    .from("students")
    .select("id, full_name, student_code, class_room, person_type, department")
    .eq("is_active", true)
    .neq("person_type", "visitor");
  const { data: todayLogs } = await supabaseAdmin
    .from("attendance_logs")
    .select("student_id, direction, status, scanned_at")
    .gte("scanned_at", dayStart);

  const nameOf = (id: string | null) => {
    const person = (people ?? []).find((p) => p.id === id);
    if (!person) return "ไม่ทราบชื่อ";
    const group = person.class_room ?? person.department ?? "";
    return group ? `${person.full_name} (${group})` : person.full_name;
  };

  // 1. Absent — checked once, after the configured absent-check time.
  const absentDue = force || now >= timeToMinutes(settings.absent_check_time);
  if (settings.notify_absent && workDay && absentDue) {
    const checkedIn = new Set(
      (todayLogs ?? [])
        .filter((l) => l.direction === "in" && l.status === "ok")
        .map((l) => l.student_id),
    );
    const absent = (people ?? []).filter((p) => !checkedIn.has(p.id));
    if (absent.length > 0) {
      const lines = absent.slice(0, 60).map((p) => `• ${nameOf(p.id)} [${p.student_code}]`);
      if (absent.length > 60) lines.push(`… และอีก ${absent.length - 60} คน`);
      results.push(
        await notify(
          "absent",
          `รายชื่อยังไม่มาโรงเรียน ${absent.length} คน (${today})`,
          lines.join("\n"),
          channels,
        ),
      );
    }
  }

  // 2. Late arrivals today (never in check-in only mode).
  if (settings.notify_late && workDay && !settings.checkin_only_mode) {
    const lateLimit = timeToMinutes(settings.late_after) + (settings.late_grace_minutes ?? 0);
    const late = (todayLogs ?? []).filter((l) => {
      if (l.direction !== "in" || l.status !== "ok") return false;
      return bangkokMinutes(new Date(l.scanned_at)) > lateLimit;
    });
    if (late.length > 0 && (force || now >= timeToMinutes(settings.absent_check_time))) {
      const lines = late
        .slice(0, 60)
        .map((l) => `• ${nameOf(l.student_id)} — ${thaiTime(l.scanned_at)}`);
      results.push(
        await notify(
          "late",
          `มาสาย ${late.length} คน (${today})`,
          lines.join("\n"),
          channels,
        ),
      );
    }
  }

  // 3. Early leave today (never in check-in only mode).
  if (settings.notify_early_leave && workDay && !settings.checkin_only_mode) {
    const limit = timeToMinutes(settings.early_leave_before);
    const early = (todayLogs ?? []).filter((l) => {
      if (l.direction !== "out" || l.status !== "ok") return false;
      return bangkokMinutes(new Date(l.scanned_at)) < limit;
    });
    if (early.length > 0) {
      const lines = early
        .slice(0, 60)
        .map((l) => `• ${nameOf(l.student_id)} — ${thaiTime(l.scanned_at)}`);
      results.push(
        await notify(
          "early_leave",
          `ออกก่อนเวลา ${early.length} คน (${today})`,
          lines.join("\n"),
          channels,
        ),
      );
    }
  }

  // 4. Repeated failed scans (strangers) that nobody has acknowledged yet.
  if (settings.notify_failed_streak) {
    const { data: alerts } = await supabaseAdmin
      .from("security_alerts")
      .select("id, message, device_name, attempts, created_at")
      .is("acknowledged_at", null)
      .gte("created_at", dayStart)
      .order("created_at", { ascending: false })
      .limit(20);
    if (alerts && alerts.length > 0) {
      const lines = alerts.map(
        (a) =>
          `• ${thaiTime(a.created_at)} ${a.device_name ?? "ไม่ระบุเครื่อง"} — ${a.message} (${a.attempts} ครั้ง)`,
      );
      results.push(
        await notify(
          "failed_streak",
          `พบการสแกนไม่ผ่านต่อเนื่อง ${alerts.length} รายการ`,
          lines.join("\n"),
          channels,
        ),
      );
    }
  }

  // 5. Kiosk devices that stopped reporting.
  if (settings.notify_device_offline) {
    const limitMinutes = Math.max(2, settings.device_offline_minutes ?? 15);
    const cutoff = Date.now() - limitMinutes * 60_000;
    const { data: devices } = await supabaseAdmin
      .from("devices")
      .select("name, last_seen_at, is_active")
      .eq("is_active", true);
    const offline = (devices ?? []).filter(
      (d) => !d.last_seen_at || new Date(d.last_seen_at).getTime() < cutoff,
    );
    if (offline.length > 0) {
      const lines = offline.map(
        (d) =>
          `• ${d.name} — ${d.last_seen_at ? `ติดต่อล่าสุด ${thaiTime(d.last_seen_at)}` : "ยังไม่เคยเชื่อมต่อ"}`,
      );
      results.push(
        await notify(
          "device_offline",
          `ตู้สแกนออฟไลน์ ${offline.length} เครื่อง (เกิน ${limitMinutes} นาที)`,
          lines.join("\n"),
          channels,
        ),
      );
    }
  }

  await supabaseAdmin
    .from("settings")
    .update({ notify_last_at: new Date().toISOString() })
    .eq("id", true);

  console.log(`[notify:${source}] ${results.length} message group(s)`);
  return results;
}
