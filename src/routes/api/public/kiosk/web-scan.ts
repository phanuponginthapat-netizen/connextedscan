import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateDevice, corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  descriptor: z.array(z.number()).min(64).max(512),
  geometry: z.record(z.string(), z.number()).optional(),
  snapshot: z.string().optional(),
  direction: z.enum(["in", "out"]).optional(),
});

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function geometryScore(a: Record<string, number>, b: Record<string, number>): number | null {
  const keys = Object.keys(a).filter((k) => typeof b[k] === "number");
  if (keys.length < 3) return null;
  return 1 - cosineDistance(
    keys.map((k) => a[k] ?? 0),
    keys.map((k) => b[k] ?? 0),
  );
}

/**
 * Browser scanning mode: the kiosk page measures the face locally and posts
 * the descriptor here. Matching and the attendance decision stay on the server.
 */
export const Route = createFileRoute("/api/public/kiosk/web-scan")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return jsonResponse({ error: "invalid body" }, 400);

        const device = await authenticateDevice(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select("allow_web_scan, web_match_threshold, next_person_delay_seconds")
          .eq("id", true)
          .maybeSingle();

        if (settings && settings.allow_web_scan === false) {
          return jsonResponse({
            result: "denied",
            message: "ปิดการสแกนผ่านเว็บอยู่ กรุณาใช้โปรแกรมบนเครื่องตู้สแกน",
            speak: "ระบบปิดการสแกนผ่านเว็บ",
            next_delay_seconds: settings.next_person_delay_seconds ?? 3,
          });
        }

        const { data: faces } = await supabaseAdmin
          .from("student_faces")
          .select("student_id, web_embedding, web_geometry, students!inner(is_active)")
          .not("web_embedding", "is", null)
          .eq("students.is_active", true);

        let bestId: string | null = null;
        let bestDistance = 2;
        let secondDistance = 2;
        let bestGeometry: Record<string, number> | null = null;

        for (const face of faces ?? []) {
          const emb = face.web_embedding as number[] | null;
          if (!emb) continue;
          const distance = cosineDistance(parsed.data.descriptor, emb);
          if (distance < bestDistance) {
            if (face.student_id !== bestId) secondDistance = bestDistance;
            bestDistance = distance;
            bestId = face.student_id;
            bestGeometry = (face.web_geometry as Record<string, number> | null) ?? null;
          } else if (distance < secondDistance && face.student_id !== bestId) {
            secondDistance = distance;
          }
        }

        const threshold = settings?.web_match_threshold ?? 0.42;
        if (!bestId || bestDistance > threshold) {
          return jsonResponse({
            result: "denied",
            message: "ไม่พบข้อมูลใบหน้าในระบบ กรุณาติดต่อเจ้าหน้าที่",
            speak: "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
            next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
          });
        }

        const confidence = Math.max(0, Math.min(1, 1 - bestDistance));
        const geoScore =
          parsed.data.geometry && bestGeometry
            ? geometryScore(parsed.data.geometry, bestGeometry)
            : null;

        const { recordScan } = await import("@/lib/kiosk-attendance.server");
        const body = await recordScan({
          studentId: bestId,
          confidence,
          geometryScore: geoScore,
          geometry: parsed.data.geometry ?? null,
          snapshot: parsed.data.snapshot ?? null,
          webEmbedding: parsed.data.descriptor,
          direction: parsed.data.direction ?? null,
          deviceName: device?.name ?? "เว็บ",
          deviceDefaultDirection: device?.default_direction ?? "auto",
        });

        return jsonResponse({ ...body, mode: "web", margin: secondDistance - bestDistance });
      },
    },
  },
});
