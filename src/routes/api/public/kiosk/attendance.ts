import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateDevice, corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  student_id: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(["in", "out"]).optional(),
  /** cosine score of the facial landmark geometry (eye/nose/mouth distances) */
  geometry_score: z.number().min(0).max(1).optional(),
  geometry: z.record(z.string(), z.number()).optional(),
  /** ArcFace embedding of the live scan, used for automatic re-enrolment */
  embedding: z.array(z.number()).min(64).max(2048).optional(),
  /** base64 JPEG of the captured face, stored as scan evidence */
  snapshot: z.string().optional(),
});

/**
 * Records a scan coming from the local ArcFace program. Enforces the
 * duplicate-scan cooldown and decides check-in vs check-out.
 */
export const Route = createFileRoute("/api/public/kiosk/attendance")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return jsonResponse({ error: "invalid body" }, 400);

        const { recordScan } = await import("@/lib/kiosk-attendance.server");
        const body = await recordScan({
          studentId: parsed.data.student_id,
          confidence: parsed.data.confidence,
          direction: parsed.data.direction ?? null,
          geometryScore: parsed.data.geometry_score ?? null,
          geometry: parsed.data.geometry ?? null,
          embedding: parsed.data.embedding ?? null,
          snapshot: parsed.data.snapshot ?? null,
          deviceName: device.name,
          deviceDefaultDirection: device.default_direction,
        });

        return jsonResponse(body);
      },
    },
  },
});
