import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateDevice,
  bangkokMinutes,
  corsPreflight,
  jsonResponse,
  timeToMinutes,
} from "@/lib/kiosk-auth.server";

/**
 * The kiosk program asks this a few times a minute:
 * - is there a remote open/lock button waiting from the admin site?
 * - is the door in its "free entry" window right now?
 */
export const Route = createFileRoute("/api/public/kiosk/door-command")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: settings }, { data: pending }] = await Promise.all([
          supabaseAdmin
            .from("settings")
            .select(
              "door_enabled, door_open_seconds, door_free_enabled, door_free_start, door_free_end, failed_alert_threshold, visitor_mode, auto_update_enabled",
            )
            .eq("id", true)
            .maybeSingle(),
          supabaseAdmin
            .from("door_commands")
            .select("id, command, seconds")
            .is("consumed_at", null)
            .order("created_at", { ascending: true })
            .limit(1),
        ]);

        const cmd = pending?.[0] ?? null;
        if (cmd) {
          await supabaseAdmin
            .from("door_commands")
            .update({ consumed_at: new Date().toISOString() })
            .eq("id", cmd.id);
        }

        const now = bangkokMinutes();
        const freeOpen =
          Boolean(settings?.door_free_enabled) &&
          now >= timeToMinutes(settings?.door_free_start ?? "07:00:00") &&
          now <= timeToMinutes(settings?.door_free_end ?? "08:30:00");

        return jsonResponse({
          command: cmd?.command ?? null,
          seconds: cmd?.seconds ?? settings?.door_open_seconds ?? 5,
          free_open: freeOpen,
          door_enabled: settings?.door_enabled ?? true,
          failed_alert_threshold: settings?.failed_alert_threshold ?? 3,
          visitor_mode: settings?.visitor_mode ?? false,
          auto_update_enabled: settings?.auto_update_enabled ?? true,
        });
      },
    },
  },
});
