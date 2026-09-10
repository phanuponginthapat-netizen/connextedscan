import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NOT_ADMIN = "เฉพาะผู้ดูแลระบบ (admin) เท่านั้นที่ลบประวัติการสแกนได้";

/** Returns true when the signed-in user holds the admin role. */
async function isAdmin(supabase: any, userId: string) {
  try {
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Deletes one scan record (and its snapshot file when present). */
export const deleteAttendanceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) {
      return { ok: false as const, error: NOT_ADMIN };
    }
    const { data: row, error: readError } = await context.supabase
      .from("attendance_logs")
      .select("id, snapshot_path")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return { ok: false as const, error: readError.message };
    if (!row) return { ok: false as const, error: "ไม่พบรายการที่ต้องการลบ" };

    const { error } = await context.supabase.from("attendance_logs").delete().eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };

    if (row.snapshot_path) {
      // The attendance record is authoritative. Snapshot cleanup is best-effort
      // because a storage policy failure must not turn a successful delete into 500.
      await context.supabase.storage.from("snapshots").remove([row.snapshot_path]);
    }
    return { ok: true as const };
  });

/** Deletes every scan record inside a date range (inclusive, local dates). */
export const deleteAttendanceRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { from: string; to: string }) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) {
      return { ok: false as const, error: NOT_ADMIN, deleted: 0 };
    }
    const start = new Date(`${data.from}T00:00:00`).toISOString();
    const end = new Date(`${data.to}T23:59:59.999`).toISOString();

    const { data: rows, error: readError } = await context.supabase
      .from("attendance_logs")
      .select("id, snapshot_path")
      .gte("scanned_at", start)
      .lte("scanned_at", end);
    if (readError) return { ok: false as const, error: readError.message, deleted: 0 };
    if (!rows?.length) return { ok: true as const, deleted: 0 };

    const { error } = await context.supabase
      .from("attendance_logs")
      .delete()
      .gte("scanned_at", start)
      .lte("scanned_at", end);
    if (error) return { ok: false as const, error: error.message, deleted: 0 };

    const paths = rows.map((r) => r.snapshot_path).filter((p): p is string => Boolean(p));
    if (paths.length) await context.supabase.storage.from("snapshots").remove(paths);

    return { ok: true as const, deleted: rows.length };
  });
