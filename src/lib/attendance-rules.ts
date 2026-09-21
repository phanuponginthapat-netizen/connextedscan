/**
 * Pure check-in / check-out time rules.
 *
 * Kept free of database and network code so the rules can be unit tested and
 * can never silently drift when other parts of the system change.
 */

export type TimeWindows = {
  checkin_start: string;
  checkin_end: string;
  checkout_start: string;
  checkout_end: string;
  late_after: string;
  late_grace_minutes?: number | null;
  early_leave_before?: string | null;
  work_days?: string | null;
  block_non_work_days?: boolean | null;
  /**
   * Check-in only schools: every scan is recorded as an arrival, the scan
   * windows never close and nobody is ever marked late or leaving early.
   */
  checkin_only_mode?: boolean | null;
};

export type Direction = "in" | "out";

export type DirectionDecision =
  | { allowed: true; direction: Direction }
  | { allowed: false; direction: Direction; reason: "out_of_window" | "non_work_day" };

/** "07:30" or "07:30:00" -> minutes after midnight. */
export function timeToMinutes(value: string): number {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight, in Bangkok time. */
export function bangkokMinutes(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const [h = 0, m = 0] = parts.split(":").map(Number);
  return h * 60 + m;
}

/** Day of week in Bangkok time: 0 = Sunday … 6 = Saturday. */
export function bangkokWeekday(date = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? new Date(date).getDay();
}

/** "1,2,3,4,5" -> [1,2,3,4,5]; empty/invalid falls back to Mon–Fri. */
export function parseWorkDays(value: string | null | undefined): number[] {
  const days = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^[0-6]$/.test(part))
    .map(Number);
  return days.length > 0 ? days : [1, 2, 3, 4, 5];
}

export function isWorkDay(settings: TimeWindows, weekday: number): boolean {
  if (!settings.block_non_work_days) return true;
  return parseWorkDays(settings.work_days).includes(weekday);
}

/**
 * Decides whether a scan may be recorded, and in which direction.
 * A requested direction is honoured only when its own window is open.
 */
export function decideDirection(
  settings: TimeWindows,
  minutes: number,
  requested?: Direction | null,
  weekday?: number,
): DirectionDecision {
  if (weekday !== undefined && !isWorkDay(settings, weekday)) {
    return { allowed: false, direction: requested ?? "in", reason: "non_work_day" };
  }

  // Check-in only: always an arrival, at any time of the working day.
  if (settings.checkin_only_mode) return { allowed: true, direction: "in" };

  const inOpen =
    minutes >= timeToMinutes(settings.checkin_start) &&
    minutes <= timeToMinutes(settings.checkin_end);
  const outOpen =
    minutes >= timeToMinutes(settings.checkout_start) &&
    minutes <= timeToMinutes(settings.checkout_end);

  if (requested) {
    const open = requested === "in" ? inOpen : outOpen;
    return open
      ? { allowed: true, direction: requested }
      : { allowed: false, direction: requested, reason: "out_of_window" };
  }

  if (inOpen) return { allowed: true, direction: "in" };
  if (outOpen) return { allowed: true, direction: "out" };
  return { allowed: false, direction: minutes < 720 ? "in" : "out", reason: "out_of_window" };
}

/** Late = arrived after the late threshold plus the grace period. */
export function isLate(settings: TimeWindows, minutes: number, direction: Direction): boolean {
  if (direction !== "in") return false;
  return minutes > timeToMinutes(settings.late_after) + (settings.late_grace_minutes ?? 0);
}

/** Early leave = left before the configured earliest leave time. */
export function isEarlyLeave(
  settings: TimeWindows,
  minutes: number,
  direction: Direction,
): boolean {
  if (direction !== "out" || !settings.early_leave_before) return false;
  return minutes < timeToMinutes(settings.early_leave_before);
}
