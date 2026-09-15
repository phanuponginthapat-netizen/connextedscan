import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled attendance report emailed / pushed to the staff recipients. */
export const Route = createFileRoute("/api/public/cron/weekly-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select(
            "weekly_report_enabled, weekly_report_weekday, weekly_report_time, weekly_report_last_at",
          )
          .eq("id", true)
          .maybeSingle();

        const { reportDue, sendAttendanceReport } = await import("@/lib/report.server");
        if (!settings || !reportDue(settings)) {
          return Response.json({ ok: true, skipped: true });
        }

        const result = await sendAttendanceReport(7);
        return Response.json({ ok: true, result });
      },
    },
  },
});
