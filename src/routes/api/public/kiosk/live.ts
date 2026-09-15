import { createFileRoute } from "@tanstack/react-router";
import { authenticateDevice, corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

/**
 * A kiosk posts a small preview picture every couple of seconds so staff can
 * watch the queue from the admin screen. Only the newest frame per kiosk is
 * kept — nothing is stored as video.
 */
export const Route = createFileRoute("/api/public/kiosk/live")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        let body: { image?: string; status?: string } = {};
        try {
          body = ((await request.json()) as typeof body) ?? {};
        } catch {
          body = {};
        }

        const image = String(body.image ?? "");
        if (!image) return jsonResponse({ error: "missing image" }, 400);
        if (image.length > 400_000) return jsonResponse({ error: "image too large" }, 413);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("kiosk_live_frames").upsert(
          {
            device_id: device.id,
            device_name: device.name,
            image: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
            status: String(body.status ?? "").slice(0, 160),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "device_id" },
        );
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true });
      },
    },
  },
});
