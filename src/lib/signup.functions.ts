import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Whether the public "create account" form is currently open. */
export const getSignupOpen = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return { open: false };

    const client = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data } = await client.rpc("is_signup_open");
    return { open: Boolean(data) };
  } catch (error) {
    console.error("[signup] failed to read signup status", error);
    return { open: false };
  }
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
