import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateDevice,
  bangkokMinutes,
  bangkokWeekday,
  corsPreflight,
  jsonResponse,
  parseWorkDays,
  timeToMinutes,
} from "@/lib/kiosk-auth.server";

/** True when "now" sits inside a window that may wrap past midnight. */
function inWindow(now: number, start: number, end: number): boolean {
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

/**
 * The kiosk program polls this every few seconds to learn:
 * - any remote power button pressed in the admin site
 * - whether the screen should be blank right now
 * - whether it is time to power the machine off
 */
export const Route = createFileRoute("/api/public/kiosk/power-command")({
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
              "power_saving_enabled, screen_idle_minutes, screen_off_start, screen_off_end, auto_power_off_enabled, auto_power_off_time, auto_power_off_action, power_off_workdays_only, work_days, wake_mac, wake_broadcast, wake_port",
            )
            .eq("id", true)
            .maybeSingle(),
          supabaseAdmin
            .from("device_commands")
            .select("id, command, device_id")
            .is("consumed_at", null)
            .order("created_at", { ascending: true })
            .limit(5),
        ]);

        const mine = (pending ?? []).find(
          (row) => !row.device_id || row.device_id === device.id,
        );
        if (mine) {
          await supabaseAdmin
            .from("device_commands")
            .update({ consumed_at: new Date().toISOString(), result: "sent" })
            .eq("id", mine.id);
        }

        const enabled = Boolean(settings?.power_saving_enabled);
        const now = bangkokMinutes();
        const screenWindow =
          enabled &&
          inWindow(
            now,
            timeToMinutes(settings?.screen_off_start ?? "18:00:00"),
            timeToMinutes(settings?.screen_off_end ?? "06:00:00"),
          );

        const workDays = parseWorkDays(settings?.work_days);
        const isWorkday = workDays.includes(bangkokWeekday());
        const offTime = timeToMinutes(settings?.auto_power_off_time ?? "18:30:00");
        const powerOffDue =
          enabled &&
          Boolean(settings?.auto_power_off_enabled) &&
          (settings?.power_off_workdays_only ? isWorkday : true) &&
          now >= offTime &&
          now < offTime + 10;

        return jsonResponse({
          command: mine?.command ?? null,
          power_saving_enabled: enabled,
          screen_idle_minutes: settings?.screen_idle_minutes ?? 10,
          screen_off_window: screenWindow,
          power_off_due: powerOffDue,
          power_off_action: settings?.auto_power_off_action ?? "shutdown",
        });
      },
    },
  },
});
