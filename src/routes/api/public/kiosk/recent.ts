import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

/**
 * The shared "latest scans" list for every kiosk screen. Reading it from the
 * database means the list survives restarts of the program and is identical
 * on every device.
 */
export const Route = createFileRoute("/api/public/kiosk/recent")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: logs } = await supabaseAdmin
          .from("attendance_logs")
          .select("id, scanned_at, direction, snapshot_path, student_id")
          .eq("status", "ok")
          .order("scanned_at", { ascending: false })
          .limit(20);

        const rows = logs ?? [];
        const ids = [...new Set(rows.map((r) => r.student_id).filter(Boolean))] as string[];

        const { data: people } = ids.length
          ? await supabaseAdmin
              .from("students")
              .select("id, full_name, nickname, student_code, class_room, avatar_path")
              .in("id", ids)
          : { data: [] as never[] };

        const byId = new Map((people ?? []).map((p) => [p.id, p]));

        const items = await Promise.all(
          rows.map(async (row) => {
            const person = row.student_id ? byId.get(row.student_id) : undefined;
            let avatarUrl: string | null = null;
            let snapshotUrl: string | null = null;
            if (person?.avatar_path) {
              const { data } = await supabaseAdmin.storage
                .from("faces")
                .createSignedUrl(person.avatar_path, 60 * 60);
              avatarUrl = data?.signedUrl ?? null;
            }
            if (row.snapshot_path) {
              const { data } = await supabaseAdmin.storage
                .from("faces")
                .createSignedUrl(row.snapshot_path, 60 * 60);
              snapshotUrl = data?.signedUrl ?? null;
            }
            return {
              id: row.id,
              name: person?.full_name ?? "ไม่ทราบชื่อ",
              detail: [person?.student_code, person?.class_room].filter(Boolean).join(" • "),
              direction: row.direction === "out" ? "out" : "in",
              scanned_at: row.scanned_at,
              avatar_url: avatarUrl,
              snapshot_url: snapshotUrl,
            };
          }),
        );

        return jsonResponse({ items });
      },
    },
  },
});
