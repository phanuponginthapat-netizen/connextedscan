import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled cleanup of scan photos and history past their retention period. */
export const Route = createFileRoute("/api/public/cron/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select("cleanup_enabled")
          .eq("id", true)
          .maybeSingle();

        if (settings && settings.cleanup_enabled === false) {
          return Response.json({ ok: true, skipped: true });
        }

        const { runCleanup } = await import("@/lib/cleanup.server");
        const result = await runCleanup("cron");
        return Response.json({ ok: true, result });
      },
    },
  },
});
