import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled weekly backup of people, face data and attendance history. */
export const Route = createFileRoute("/api/public/cron/backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBackup, backupIsDue } = await import("@/lib/backup.server");

        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select("backup_enabled, backup_weekday, backup_last_at")
          .eq("id", true)
          .maybeSingle();

        if (!backupIsDue(settings ?? null)) {
          return Response.json({ ok: true, skipped: true });
        }

        const result = await runBackup("cron");
        return Response.json({ ok: true, path: result.path, counts: result.counts });
      },
    },
  },
});
