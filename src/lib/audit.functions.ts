import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Records one back-office action (who changed what, and when) so the school can
 * always see the history of edits made in the admin area.
 */
export const recordAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().min(1).max(120),
        target: z.string().max(200).optional(),
        detail: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (!isStaff) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string }).email ?? null;
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_email: email,
      action: data.action,
      target: data.target ?? null,
      detail: data.detail ?? null,
    });
    return { ok: true };
  });
