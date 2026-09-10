import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const payloadSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("one"), id: z.string().uuid() }),
  z.object({
    mode: z.literal("range"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/public/admin/attendance-delete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!token) return json({ ok: false, error: "กรุณาเข้าสู่ระบบใหม่" }, 401);

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return json({ ok: false, error: "ระบบฐานข้อมูลยังไม่พร้อม" }, 503);

        const headers = { Authorization: `Bearer ${token}` };
        const supabase = createClient<Database>(url, key, {
          global: { headers },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: authError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (authError || !userId) return json({ ok: false, error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" }, 401);

        const { data: admin, error: roleError } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (roleError || admin !== true) {
          return json({ ok: false, error: "เฉพาะผู้ดูแลระบบเท่านั้นที่ลบประวัติได้" }, 403);
        }

        let payload: z.infer<typeof payloadSchema>;
        try {
          payload = payloadSchema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "ข้อมูลคำสั่งลบไม่ถูกต้อง" }, 400);
        }

        if (payload.mode === "one") {
          const { data: row, error: readError } = await supabase
            .from("attendance_logs")
            .select("id, snapshot_path")
            .eq("id", payload.id)
            .maybeSingle();
          if (readError) return json({ ok: false, error: readError.message }, 400);
          if (!row) return json({ ok: false, error: "ไม่พบรายการที่ต้องการลบ" }, 404);

          const { error } = await supabase.from("attendance_logs").delete().eq("id", payload.id);
          if (error) return json({ ok: false, error: error.message }, 400);
          if (row.snapshot_path) await supabase.storage.from("snapshots").remove([row.snapshot_path]);
          return json({ ok: true });
        }

        const start = new Date(`${payload.from}T00:00:00`).toISOString();
        const end = new Date(`${payload.to}T23:59:59.999`).toISOString();
        const { data: rows, error: readError } = await supabase
          .from("attendance_logs")
          .select("id, snapshot_path")
          .gte("scanned_at", start)
          .lte("scanned_at", end);
        if (readError) return json({ ok: false, error: readError.message, deleted: 0 }, 400);
        if (!rows?.length) return json({ ok: true, deleted: 0 });

        const { error } = await supabase
          .from("attendance_logs")
          .delete()
          .gte("scanned_at", start)
          .lte("scanned_at", end);
        if (error) return json({ ok: false, error: error.message, deleted: 0 }, 400);

        const paths = rows.map((row) => row.snapshot_path).filter((path): path is string => Boolean(path));
        if (paths.length) await supabase.storage.from("snapshots").remove(paths);
        return json({ ok: true, deleted: rows.length });
      },
    },
  },
});