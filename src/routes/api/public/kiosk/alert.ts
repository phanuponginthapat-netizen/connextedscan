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
 * Raised by the kiosk program when the same unknown person fails several
 * scans in a row — it usually means a stranger is trying to get in.
 */
export const Route = createFileRoute("/api/public/kiosk/alert")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        let body: { attempts?: number; snapshot?: string; message?: string; kind?: string } = {};
        try {
          body = ((await request.json()) as typeof body) ?? {};
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const attempts = Math.max(1, Math.min(Number(body.attempts ?? 1), 999));

        let snapshotPath: string | null = null;
        if (body.snapshot) {
          const bytes = decodeBase64Jpeg(body.snapshot);
          if (bytes) {
            const path = `alerts/${Date.now()}.jpg`;
            const { error } = await supabaseAdmin.storage
              .from("faces")
              .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
            if (!error) snapshotPath = path;
          }
        }

        const { error } = await supabaseAdmin.from("security_alerts").insert({
          kind: body.kind === "intrusion_attempt" ? "intrusion_attempt" : "unknown_person",
          message:
            body.message ??
            `พบการสแกนไม่ผ่านติดกัน ${attempts} ครั้งที่ ${device.name} อาจเป็นบุคคลภายนอก`,
          device_name: device.name,
          attempts,
          snapshot_path: snapshotPath,
        });
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true });
      },
    },
  },
});
