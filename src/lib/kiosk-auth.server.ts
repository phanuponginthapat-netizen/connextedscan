import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type KioskDevice = {
  id: string;
  name: string;
  default_direction: string;
  is_active: boolean;
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-device-key",
      "access-control-allow-methods": "POST, GET, OPTIONS",
    },
  });
}

export function corsPreflight() {
  return jsonResponse({ ok: true });
}

/** Authenticates a kiosk agent by its device key. Returns null when invalid. */
export async function authenticateDevice(request: Request): Promise<KioskDevice | null> {
  const key = request.headers.get("x-device-key");
  if (!key) return null;

  const { data, error } = await supabaseAdmin
    .from("devices")
    .select("id, name, default_direction, is_active")
    .eq("api_key", key)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;

  await supabaseAdmin
    .from("devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  return data as KioskDevice;
}

/** Current wall-clock time in Bangkok as minutes after midnight. */
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

export function timeToMinutes(value: string): number {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Current weekday in Bangkok (0 = Sunday … 6 = Saturday). */
export function bangkokWeekday(date = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Parses a "1,2,3,4,5" work-day list into weekday numbers. */
export function parseWorkDays(value: string | null | undefined): number[] {
  return (value ?? "1,2,3,4,5")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);
}
