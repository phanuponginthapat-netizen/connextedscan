import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

const SIGNED_TTL_SECONDS = 60 * 60;
// Signing a picture link costs a round-trip, and the kiosk asks for the same
// pictures every few seconds, so the links are reused until they expire.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function signedUrl(
  storage: { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null }> },
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const now = Date.now();
  const hit = signedUrlCache.get(path);
  if (hit && hit.expiresAt > now) return hit.url;
  const { data } = await storage.createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (!data?.signedUrl) return null;
  if (signedUrlCache.size > 500) signedUrlCache.clear();
  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: now + (SIGNED_TTL_SECONDS - 300) * 1000,
  });
  return data.signedUrl;
}

/**
 * The shared "latest scans" list for every kiosk screen. Reading it from the
 * database means the list survives restarts of the program and is identical
 * on every device.
 */
export const Route = createFileRoute("/api/public/kiosk/recent")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select(
            "kiosk_show_recent, kiosk_recent_limit, kiosk_mirror, kiosk_show_clock, kiosk_show_confidence, kiosk_news_enabled, kiosk_news_text, next_person_delay_seconds, voice_enabled, voice_rate, voice_volume",
          )
          .eq("id", true)
          .maybeSingle();

        const display = {
          show_recent: settings?.kiosk_show_recent ?? true,
          recent_limit: Math.min(Math.max(settings?.kiosk_recent_limit ?? 20, 1), 50),
          mirror: settings?.kiosk_mirror ?? true,
          show_clock: settings?.kiosk_show_clock ?? true,
          show_confidence: settings?.kiosk_show_confidence ?? false,
          news_enabled: settings?.kiosk_news_enabled ?? false,
          news_text: settings?.kiosk_news_text ?? "",
          next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
          voice_enabled: settings?.voice_enabled ?? true,
          voice_rate: Number(settings?.voice_rate ?? 1),
          voice_volume: Number(settings?.voice_volume ?? 1),
        };

        const { data: logs } = await supabaseAdmin
          .from("attendance_logs")
          .select("id, scanned_at, direction, snapshot_path, student_id")
          .eq("status", "ok")
          .order("scanned_at", { ascending: false })
          .limit(display.recent_limit);

        const rows = logs ?? [];
        const ids = [...new Set(rows.map((r) => r.student_id).filter(Boolean))] as string[];

        const { data: people } = ids.length
          ? await supabaseAdmin
              .from("students")
              .select(
                "id, full_name, nickname, student_code, class_room, avatar_path, person_type, department, position",
              )
              .in("id", ids)
          : { data: [] as never[] };

        const byId = new Map((people ?? []).map((p) => [p.id, p]));

        const storage = supabaseAdmin.storage.from("faces");

        const items = await Promise.all(
          rows.map(async (row) => {
            const person = row.student_id ? byId.get(row.student_id) : undefined;
            const [avatarUrl, snapshotUrl] = await Promise.all([
              signedUrl(storage, person?.avatar_path),
              signedUrl(storage, row.snapshot_path),
            ]);
            return {
              id: row.id,
              name: person?.full_name ?? "ไม่ทราบชื่อ",
              detail: [
                person?.student_code,
                person?.person_type === "staff"
                  ? [person?.department, person?.position].filter(Boolean).join(" / ")
                  : person?.class_room,
              ]
                .filter(Boolean)
                .join(" • "),
              role: person?.person_type === "staff" ? "บุคลากร" : "นักเรียน",
              direction: row.direction === "out" ? "out" : "in",
              scanned_at: row.scanned_at,
              avatar_url: avatarUrl,
              snapshot_url: snapshotUrl,
            };
          }),
        );

        return jsonResponse({ items, display });
      },
    },
  },
});
