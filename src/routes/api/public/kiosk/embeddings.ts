import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  authenticateDevice,
  corsPreflight,
  jsonResponse,
} from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  results: z.array(
    z.object({
      face_id: z.string().uuid(),
      embedding: z.array(z.number()).min(64).max(2048).optional(),
      geometry: z.record(z.string(), z.number()).optional(),
      quality: z.number().optional(),
      error: z.string().optional(),
    }),
  ),
});

/** Kiosk agent uploads locally computed ArcFace embeddings for pending photos. */
export const Route = createFileRoute("/api/public/kiosk/embeddings")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return jsonResponse({ error: "invalid body" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        for (const item of parsed.data.results) {
          if (item.embedding && item.embedding.length > 0) {
            await supabaseAdmin
              .from("student_faces")
              .update({
                embedding: item.embedding,
                geometry: item.geometry ?? null,
                quality: item.quality ?? null,
                status: "ready",
                error_message: null,
                processed_at: new Date().toISOString(),
              })
              .eq("id", item.face_id);
          } else {
            await supabaseAdmin
              .from("student_faces")
              .update({
                status: "failed",
                error_message: item.error ?? "ไม่พบใบหน้าในรูปนี้",
                processed_at: new Date().toISOString(),
              })
              .eq("id", item.face_id);
          }
        }

        return jsonResponse({ ok: true, updated: parsed.data.results.length });
      },
    },
  },
});
