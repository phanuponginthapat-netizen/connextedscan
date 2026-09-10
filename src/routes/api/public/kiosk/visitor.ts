import { createFileRoute } from "@tanstack/react-router";
import { authenticateDevice, corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

function decodeBase64Jpeg(value: string): Uint8Array | null {
  try {
    const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.length > 0 && bytes.length < 5_000_000 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Event mode: people who are not on the register (parents, guests) are only
 * recorded, never matched or allowed through the gate automatically.
 */
export const Route = createFileRoute("/api/public/kiosk/visitor")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        let body: { full_name?: string; note?: string; direction?: string; snapshot?: string } = {};
        try {
          body = ((await request.json()) as typeof body) ?? {};
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select("visitor_mode, next_person_delay_seconds")
          .eq("id", true)
          .maybeSingle();

        if (!settings?.visitor_mode) {
          return jsonResponse({ result: "disabled" }, 200);
        }

        let snapshotPath: string | null = null;
        if (body.snapshot) {
          const bytes = decodeBase64Jpeg(body.snapshot);
          if (bytes) {
            const path = `visitors/${Date.now()}.jpg`;
            const { error } = await supabaseAdmin.storage
              .from("faces")
              .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
            if (!error) snapshotPath = path;
          }
        }

        await supabaseAdmin.from("visitor_logs").insert({
          full_name: body.full_name ?? null,
          note: body.note ?? null,
          direction: body.direction === "out" ? "out" : "in",
          snapshot_path: snapshotPath,
          device_name: device.name,
        });

        return jsonResponse({
          result: "visitor",
          message: "บันทึกผู้มาเยือนเรียบร้อย กรุณาติดต่อเจ้าหน้าที่ที่จุดประชาสัมพันธ์",
          speak: "บันทึกผู้มาเยือนเรียบร้อย",
          next_delay_seconds: settings.next_person_delay_seconds ?? 5,
        });
      },
    },
  },
});
