import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Whether the public "create account" form is currently open. */
export const getSignupOpen = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("settings").select("allow_signup").single();
  return { open: Boolean(data?.allow_signup) };
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  fullName: z.string().max(200).optional(),
});

/**
 * Creates a staff account only while sign-ups are enabled in settings.
 * Public Supabase sign-ups are disabled, so this is the single entry point.
 */
export const createStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => signupSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin.from("settings").select("allow_signup").single();
    if (!settings?.allow_signup) {
      return { ok: false as const, error: "ระบบปิดรับสมัครสมาชิกอยู่ กรุณาติดต่อผู้ดูแลระบบ" };
    }

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? "" },
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
