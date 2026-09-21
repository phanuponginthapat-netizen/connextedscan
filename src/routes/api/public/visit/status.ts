import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

/** Tells the kiosk and the registration page whether visitor mode is open. */
export const Route = createFileRoute("/api/public/visit/status")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("settings")
          .select("visitor_register_enabled, school_name")
          .eq("id", true)
          .maybeSingle();
        return jsonResponse({
          enabled: Boolean(data?.visitor_register_enabled),
          school_name: data?.school_name ?? "",
        });
      },
    },
  },
});
