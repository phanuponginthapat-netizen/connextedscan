import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  bangkokWeekday,
  isWorkDay,
  parseWorkDays,
  timeToMinutes,
} from "@/lib/attendance-rules";

export type DayRow = {
  date: string;
  weekday: number;
  present: number;
  late: number;
  absent: number;
};

export type LateRow = {
  name: string;
  group: string;
  lateDays: number;
  absentDays: number;
};

export type WeeklyReport = {
  from: string;
  to: string;
  people: number;
  days: DayRow[];
  topLate: LateRow[];
  subject: string;
  message: string;
};

function bangkokDateISO(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}

function minutesOf(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const [h = 0, m = 0] = parts.split(":").map(Number);
  return h * 60 + m;
}

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/**
 * Builds the attendance summary for the last `days` calendar days: how many
 * people arrived, how many were late and how many never scanned in, plus the
 * people with the most late days.
 */
export async function buildAttendanceReport(days = 7): Promise<WeeklyReport> {
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select(
      "late_after, late_grace_minutes, work_days, block_non_work_days, school_name, checkin_only_mode",
    )
    .eq("id", true)
    .maybeSingle();

  // Check-in only schools never mark anyone late.
  const lateLimit = settings?.checkin_only_mode
    ? Number.POSITIVE_INFINITY
    : timeToMinutes(settings?.late_after ?? "08:00:00") + (settings?.late_grace_minutes ?? 0);
  const workDays = parseWorkDays(settings?.work_days ?? null);
  const blockNonWork = settings?.block_non_work_days ?? false;

  const to = bangkokDateISO();
  const fromDate = new Date(Date.now() - (days - 1) * 86_400_000);
  const from = bangkokDateISO(fromDate);
  const fromISO = new Date(`${from}T00:00:00+07:00`).toISOString();

  const [{ data: people }, { data: logs }] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("id, full_name, class_room, department")
      .eq("is_active", true),
    supabaseAdmin
      .from("attendance_logs")
      .select("student_id, direction, status, scanned_at")
      .eq("status", "ok")
      .eq("direction", "in")
      .gte("scanned_at", fromISO),
  ]);

  const active = people ?? [];
  const perDay = new Map<string, Map<string, number>>();
  for (const log of logs ?? []) {
    if (!log.student_id) continue;
    const date = bangkokDateISO(new Date(log.scanned_at));
    const day = perDay.get(date) ?? new Map<string, number>();
    const minutes = minutesOf(log.scanned_at);
    const existing = day.get(log.student_id);
    if (existing === undefined || minutes < existing) day.set(log.student_id, minutes);
    perDay.set(date, day);
  }

  const dayRows: DayRow[] = [];
  const lateCount = new Map<string, number>();
  const absentCount = new Map<string, number>();

  for (let i = 0; i < days; i += 1) {
    const d = new Date(fromDate.getTime() + i * 86_400_000);
    const date = bangkokDateISO(d);
    if (date > to) break;
    const weekday = bangkokWeekday(d);
    const counted = !blockNonWork || workDays.includes(weekday);
    const day = perDay.get(date) ?? new Map<string, number>();
    let late = 0;
    for (const [id, minutes] of day) {
      if (minutes > lateLimit) {
        late += 1;
        if (counted) lateCount.set(id, (lateCount.get(id) ?? 0) + 1);
      }
    }
    const present = day.size;
    const absent = counted ? Math.max(0, active.length - present) : 0;
    if (counted) {
      for (const person of active) {
        if (!day.has(person.id)) absentCount.set(person.id, (absentCount.get(person.id) ?? 0) + 1);
      }
    }
    dayRows.push({ date, weekday, present, late, absent });
  }

  const nameOf = (id: string) => {
    const p = active.find((x) => x.id === id);
    if (!p) return { name: "ไม่ทราบชื่อ", group: "" };
    return { name: p.full_name, group: p.class_room ?? p.department ?? "" };
  };

  const topLate: LateRow[] = [...lateCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({
      ...nameOf(id),
      lateDays: count,
      absentDays: absentCount.get(id) ?? 0,
    }));

  const totalLate = dayRows.reduce((sum, r) => sum + r.late, 0);
  const totalAbsent = dayRows.reduce((sum, r) => sum + r.absent, 0);
  const school = settings?.school_name ?? "โรงเรียน";

  const lines = [
    `สรุปการมาเรียน ${from} ถึง ${to}`,
    `จำนวนคนในระบบ ${active.length} คน`,
    `รวมมาสาย ${totalLate} ครั้ง • รวมขาด ${totalAbsent} ครั้ง`,
    "",
    ...dayRows.map(
      (r) =>
        `วัน${THAI_DAYS[r.weekday]} ${r.date} — มา ${r.present} · สาย ${r.late} · ขาด ${r.absent}`,
    ),
  ];
  if (topLate.length > 0) {
    lines.push("", "มาสายมากที่สุด:");
    for (const row of topLate) {
      lines.push(
        `• ${row.name}${row.group ? ` (${row.group})` : ""} — สาย ${row.lateDays} วัน · ขาด ${row.absentDays} วัน`,
      );
    }
  }

  return {
    from,
    to,
    people: active.length,
    days: dayRows,
    topLate,
    subject: `รายงานการมาเรียน ${school} (${from} – ${to})`,
    message: lines.join("\n"),
  };
}

/** Builds and sends the periodic attendance report to every active recipient. */
export async function sendAttendanceReport(days = 7) {
  const report = await buildAttendanceReport(days);
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select("notify_email_enabled, notify_line_enabled")
    .eq("id", true)
    .maybeSingle();

  const { notifyAll } = await import("@/lib/notify.server");
  const outcome = await notifyAll("absent", report.subject, report.message, {
    email: settings?.notify_email_enabled ?? false,
    line: settings?.notify_line_enabled ?? false,
  });

  await supabaseAdmin
    .from("settings")
    .update({ weekly_report_last_at: new Date().toISOString() })
    .eq("id", true);

  return {
    subject: report.subject,
    line: outcome.line,
    email: outcome.email,
    blocked: outcome.blocked,
  };
}

/** True when the weekly report is due right now (checked by the cron route). */
export function reportDue(
  settings: {
    weekly_report_enabled: boolean;
    weekly_report_weekday: number;
    weekly_report_time: string;
    weekly_report_last_at: string | null;
  },
  now = new Date(),
): boolean {
  if (!settings.weekly_report_enabled) return false;
  if (bangkokWeekday(now) !== settings.weekly_report_weekday) return false;
  const minutes = (() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const [h = 0, m = 0] = parts.split(":").map(Number);
    return h * 60 + m;
  })();
  if (minutes < timeToMinutes(settings.weekly_report_time)) return false;
  if (settings.weekly_report_last_at) {
    const last = new Date(settings.weekly_report_last_at);
    if (bangkokDateISO(last) === bangkokDateISO(now)) return false;
  }
  return true;
}

// Referenced so tree shaking keeps the shared rule helpers in one place.
export { isWorkDay };
