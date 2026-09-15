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

        let known: Record<string, string> = {};
        let agentVersion: string | null = null;
        let platform: string | null = null;
        const health: {
          disk_free_mb?: number | null;
          camera_ok?: boolean | null;
          door_ok?: boolean | null;
          health_note?: string | null;
        } = {};
        try {
          const body = (await request.json()) as {
            known?: Record<string, string>;
            agent_version?: string;
            platform?: string;
            disk_free_mb?: number;
            camera_ok?: boolean;
            door_ok?: boolean;
            health_note?: string;
          } | null;
          if (body?.known && typeof body.known === "object") known = body.known;
          if (typeof body?.agent_version === "string") agentVersion = body.agent_version.slice(0, 40);
          if (typeof body?.platform === "string") platform = body.platform.slice(0, 80);
          if (typeof body?.disk_free_mb === "number")
            health.disk_free_mb = Math.max(0, Math.round(body.disk_free_mb));
          if (typeof body?.camera_ok === "boolean") health.camera_ok = body.camera_ok;
          if (typeof body?.door_ok === "boolean") health.door_ok = body.door_ok;
          if (typeof body?.health_note === "string")
            health.health_note = body.health_note.slice(0, 300);
        } catch {
          known = {};
        }
        const incremental = Object.keys(known).length > 0;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Record which program version each kiosk is running (system health page).
        if (agentVersion || platform || Object.keys(health).length > 0) {
          await supabaseAdmin
            .from("devices")
            .update({
              ...(agentVersion ? { agent_version: agentVersion } : {}),
              ...(platform ? { platform } : {}),
              ...health,
            })
            .eq("id", device.id);
        }

        const [{ data: settings }, { data: students }, { data: faces }] = await Promise.all([
          supabaseAdmin.from("settings").select("*").eq("id", true).maybeSingle(),
          supabaseAdmin
            .from("students")
            .select("id, student_code, full_name, nickname, class_room, is_active")
            .eq("is_active", true),
          supabaseAdmin
            .from("student_faces")
            .select("id, student_id, image_path, status, embedding, geometry, processed_at, created_at")
            .in("status", ["pending", "ready"]),
        ]);

        const versionOf = (f: { processed_at: string | null; created_at: string }) =>
          f.processed_at ?? f.created_at;

        // A photo still needs local ArcFace work whenever it has no ArcFace
        // embedding yet, even if the browser already measured it (status ready).
        const pending = (faces ?? []).filter((f) => !f.embedding);
        const readyAll = (faces ?? []).filter((f) => f.embedding);
        const ready = readyAll
          .filter((f) => !incremental || known[f.id] !== versionOf(f))
          .map((f) => ({
            id: f.id,
            student_id: f.student_id,
            embedding: f.embedding,
            geometry: f.geometry ?? null,
            version: versionOf(f),
          }));

        // Ids the kiosk still caches but that no longer exist (or lost their
        // embedding) on the server.
        const liveIds = new Set(readyAll.map((f) => f.id));
        const removed = incremental ? Object.keys(known).filter((id) => !liveIds.has(id)) : [];

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
          removed,
          incremental,
          total_embeddings: readyAll.length,
          pending: pendingWithUrls.filter((p) => p.url),
          server_time: new Date().toISOString(),
        });
      },

    },
  },
});
