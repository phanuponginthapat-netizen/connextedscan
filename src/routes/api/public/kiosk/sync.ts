import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateDevice,
  corsPreflight,
  jsonResponse,
} from "@/lib/kiosk-auth.server";

/**
 * Kiosk agent sync: returns settings, all enrolled face embeddings and the
 * list of photos that still need an embedding computed locally (ArcFace).
 */
export const Route = createFileRoute("/api/public/kiosk/sync")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: settings }, { data: students }, { data: faces }] = await Promise.all([
          supabaseAdmin.from("settings").select("*").eq("id", true).maybeSingle(),
          supabaseAdmin
            .from("students")
            .select("id, student_code, full_name, nickname, class_room, is_active")
            .eq("is_active", true),
          supabaseAdmin
            .from("student_faces")
            .select("id, student_id, image_path, status, embedding, geometry")
            .in("status", ["pending", "ready"]),
        ]);

        const pending = (faces ?? []).filter((f) => f.status === "pending");
        const ready = (faces ?? [])
          .filter((f) => f.status === "ready" && f.embedding)
          .map((f) => ({
            id: f.id,
            student_id: f.student_id,
            embedding: f.embedding,
            geometry: f.geometry ?? null,
          }));

        const pendingWithUrls = await Promise.all(
          pending.map(async (f) => {
            const { data } = await supabaseAdmin.storage
              .from("faces")
              .createSignedUrl(f.image_path, 60 * 30);
            return { id: f.id, student_id: f.student_id, url: data?.signedUrl ?? null };
          }),
        );

        return jsonResponse({
          device: { id: device.id, name: device.name, default_direction: device.default_direction },
          settings,
          students: students ?? [],
          embeddings: ready,
          pending: pendingWithUrls.filter((p) => p.url),
          server_time: new Date().toISOString(),
        });
      },
    },
  },
});
