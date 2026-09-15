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
      "checkin_start, checkin_end, checkout_start, checkout_end, late_after, late_grace_minutes, work_days, block_non_work_days, screensaver_mode, school_name",
    )
    .eq("id", true)
    .maybeSingle();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const dayStart = new Date(`${today}T00:00:00+07:00`).toISOString();

  const [{ count: peopleCount }, { data: logs }] = await Promise.all([
    supabaseAdmin.from("students").select("id", { count: "exact", head: true }).eq("is_active", true),
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

  const people = peopleCount ?? 0;
  const present = firstIn.size;
  let late = 0;
  for (const minutes of firstIn.values()) if (minutes > lateLimit) late += 1;

  const now = bangkokMinutes();
  const workDays = parseWorkDays(settings?.work_days ?? null);
  const isWorkday = !settings?.block_non_work_days || workDays.includes(bangkokWeekday());
  const checkinClosed = now > timeToMinutes(settings?.checkin_end ?? "10:00:00");
  const checkoutClosed = now > timeToMinutes(settings?.checkout_end ?? "19:00:00");

  return jsonResponse({
    school_name: settings?.school_name ?? "",
    screensaver_mode: settings?.screensaver_mode ?? "stats",
    people,
    present,
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
