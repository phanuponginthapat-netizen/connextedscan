import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateDevice, corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  /** face-api descriptor measured in the tablet browser */
  descriptor: z.array(z.number()).min(64).max(1024),
  geometry: z.record(z.string(), z.number()).optional(),
  direction: z.enum(["in", "out"]).optional(),
  snapshot: z.string().optional(),
});

function distance(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Scan endpoint for the tablet/phone scanner. The browser measures the face,
 * the server decides who it is and whether the scan is allowed, so an old
 * tablet can replace the kiosk PC.
 */
export const Route = createFileRoute("/api/public/kiosk/web-scan")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return jsonResponse({ error: "invalid body" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recordScan } = await import("@/lib/kiosk-attendance.server");

        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select("allow_web_scan, web_match_threshold, next_person_delay_seconds, voice_denied_text")
          .eq("id", true)
          .maybeSingle();

        if (settings && settings.allow_web_scan === false) {
          return jsonResponse({
            result: "denied",
            message: "โหมดสแกนผ่านเว็บถูกปิดอยู่ กรุณาเปิดในหน้าตั้งค่า",
            next_delay_seconds: settings.next_person_delay_seconds ?? 5,
          });
        }

        const threshold = Number(settings?.web_match_threshold ?? 0.42);

        const { data: faces } = await supabaseAdmin
          .from("student_faces")
          .select("student_id, web_embedding")
          .not("web_embedding", "is", null)
          .limit(5000);

        const query = parsed.data.descriptor;
        let bestId: string | null = null;
        let best = Number.POSITIVE_INFINITY;
        let second = Number.POSITIVE_INFINITY;

        for (const face of faces ?? []) {
          const emb = face.web_embedding as number[] | null;
          if (!emb || emb.length < 64) continue;
          const d = distance(query, emb);
          if (d < best) {
            if (face.student_id !== bestId) second = best;
            best = d;
            bestId = face.student_id;
          } else if (d < second && face.student_id !== bestId) {
            second = d;
          }
        }

        if (!bestId || best > threshold) {
          return jsonResponse({
            result: "unknown",
            message: "ไม่พบใบหน้าในระบบ กรุณาติดต่อเจ้าหน้าที่",
            speak: settings?.voice_denied_text ?? "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
            next_delay_seconds: settings?.next_person_delay_seconds ?? 5,
          });
        }

        // Distance 0 = identical; turn it into a 0-1 confidence for the log.
        const confidence = Math.max(0, Math.min(1, 1 - best / Math.max(threshold * 2, 0.01)));

        const result = await recordScan({
          studentId: bestId,
          confidence,
          direction: parsed.data.direction ?? null,
          geometry: parsed.data.geometry ?? null,
          webEmbedding: query,
          snapshot: parsed.data.snapshot ?? null,
          deviceName: device.name,
          deviceDefaultDirection: device.default_direction,
        });

        return jsonResponse({ ...result, match_distance: best, runner_up_distance: second });
      },
    },
  },
});
