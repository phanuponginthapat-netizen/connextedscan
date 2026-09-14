import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled notification checks: absent, late, early leave, failed scans, offline kiosks. */
export const Route = createFileRoute("/api/public/cron/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { runNotificationChecks } = await import("@/lib/notify.server");
        const results = await runNotificationChecks("cron");
        return Response.json({ ok: true, groups: results.length, results });
      },
    },
  },
});
