import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";
import { bangkokMinutes, parseWorkDays, timeToMinutes } from "@/lib/attendance-rules";
import { bangkokWeekday } from "@/lib/attendance-rules";

/**
 * Today's live figures for the kiosk screen: how many people arrived, how many
 * were late and how many have not scanned in yet. Also tells the kiosk whether
 * both scan windows are already closed, so it can show the summary board
 * instead of a black screen.
 */
export const Route = createFileRoute("/api/public/kiosk/today-stats")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: () => handle(),
      POST: () => handle(),
    },
  },
});

async function handle() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("settings")
    .select(
      "checkin_start, checkin_end, checkout_start, checkout_end, late_after, late_grace_minutes, work_days, block_non_work_days, screensaver_mode, school_name, checkin_only_mode, idle_stats_minutes, visitor_register_enabled",
    )
    .eq("id", true)
    .maybeSingle();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const dayStart = new Date(`${today}T00:00:00+07:00`).toISOString();

  const [{ data: peopleRows }, { data: logs }] = await Promise.all([
    supabaseAdmin.from("students").select("id, person_type").eq("is_active", true),
    supabaseAdmin
      .from("attendance_logs")
      .select("student_id, direction, scanned_at")
      .eq("status", "ok")
      .gte("scanned_at", dayStart),
  ]);

  const lateLimit =
    timeToMinutes(settings?.late_after ?? "08:00:00") + (settings?.late_grace_minutes ?? 0);
  const firstIn = new Map<string, number>();
  const outIds = new Set<string>();
  for (const log of logs ?? []) {
    if (!log.student_id) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(log.scanned_at));
    const [h = 0, m = 0] = parts.split(":").map(Number);
    const minutes = h * 60 + m;
    if (log.direction === "in") {
      const prev = firstIn.get(log.student_id);
      if (prev === undefined || minutes < prev) firstIn.set(log.student_id, minutes);
    } else {
      outIds.add(log.student_id);
    }
  }

  // Visitors are guests of the day: they never count as school members and
  // never appear as "absent".
  const people = (peopleRows ?? []).filter((person) => person.person_type !== "visitor").length;
  const personTypeById = new Map((peopleRows ?? []).map((person) => [person.id, person.person_type]));
  let studentsPresent = 0;
  let staffPresent = 0;
  let visitorsPresent = 0;
  for (const studentId of firstIn.keys()) {
    const type = personTypeById.get(studentId);
    if (type === "staff") staffPresent += 1;
    else if (type === "visitor") visitorsPresent += 1;
    else studentsPresent += 1;
  }
  const present = studentsPresent + staffPresent;
  let late = 0;
  for (const [id, minutes] of firstIn)
    if (personTypeById.get(id) !== "visitor" && minutes > lateLimit) late += 1;

  const now = bangkokMinutes();
  const workDays = parseWorkDays(settings?.work_days ?? null);
  const isWorkday = !settings?.block_non_work_days || workDays.includes(bangkokWeekday());
  // Check-in only schools have no closing time and nobody is ever late.
  const checkinOnly = Boolean(settings?.checkin_only_mode);
  if (checkinOnly) late = 0;
  const checkinClosed = !checkinOnly && now > timeToMinutes(settings?.checkin_end ?? "10:00:00");
  const checkoutClosed = !checkinOnly && now > timeToMinutes(settings?.checkout_end ?? "19:00:00");

  return jsonResponse({
    school_name: settings?.school_name ?? "",
    screensaver_mode: settings?.screensaver_mode ?? "stats",
    checkin_only: checkinOnly,
    idle_stats_minutes: settings?.idle_stats_minutes ?? 0,
    people,
    present,
    students_present: studentsPresent,
    staff_present: staffPresent,
    visitors_present: visitorsPresent,
    visitor_register_enabled: Boolean(settings?.visitor_register_enabled),
    late,
    on_time: Math.max(0, present - late),
    absent: isWorkday ? Math.max(0, people - present) : 0,
    left: outIds.size,
    checkin_closed: checkinClosed,
    checkout_closed: checkoutClosed,
    windows_closed: checkinClosed && checkoutClosed,
    is_workday: isWorkday,
    server_time: new Date().toISOString(),
  });
}
