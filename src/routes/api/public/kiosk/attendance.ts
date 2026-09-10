import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  authenticateDevice,
  bangkokMinutes,
  corsPreflight,
  jsonResponse,
  timeToMinutes,
} from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  student_id: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(["in", "out"]).optional(),
});

/**
 * Records a scan. Enforces the duplicate-scan cooldown and decides whether the
 * scan counts as check-in or check-out based on the configured time windows.
 */
export const Route = createFileRoute("/api/public/kiosk/attendance")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ error: "invalid device key" }, 401);

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) return jsonResponse({ error: "invalid body" }, 400);
        const { student_id, confidence } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: settings }, { data: student }] = await Promise.all([
          supabaseAdmin.from("settings").select("*").eq("id", true).maybeSingle(),
          supabaseAdmin
            .from("students")
            .select("id, full_name, nickname, student_code, class_room, is_active")
            .eq("id", student_id)
            .maybeSingle(),
        ]);

        if (!student || !student.is_active) {
          return jsonResponse({
            result: "denied",
            message: "ไม่พบข้อมูลนักเรียน หรือถูกระงับการใช้งาน",
            speak: "ไม่พบข้อมูล กรุณาติดต่อเจ้าหน้าที่",
          });
        }

        const now = bangkokMinutes();
        const cooldown = settings?.duplicate_cooldown_minutes ?? 300;

        // Decide direction from the configured windows.
        let direction = parsed.data.direction ?? null;
        if (!direction && device.default_direction !== "auto") {
          direction = device.default_direction === "out" ? "out" : "in";
        }
        if (!direction && settings) {
          const inStart = timeToMinutes(settings.checkin_start);
          const inEnd = timeToMinutes(settings.checkin_end);
          const outStart = timeToMinutes(settings.checkout_start);
          const outEnd = timeToMinutes(settings.checkout_end);
          if (now >= inStart && now <= inEnd) direction = "in";
          else if (now >= outStart && now <= outEnd) direction = "out";
        }
        if (!direction) direction = now < 720 ? "in" : "out";

        // Duplicate protection.
        const since = new Date(Date.now() - cooldown * 60 * 1000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("attendance_logs")
          .select("id, scanned_at, direction")
          .eq("student_id", student_id)
          .eq("direction", direction)
          .eq("status", "ok")
          .gte("scanned_at", since)
          .order("scanned_at", { ascending: false })
          .limit(1);

        const displayName = student.nickname?.trim() || student.full_name;
        const directionLabel = direction === "in" ? "เข้าโรงเรียน" : "ออกจากโรงเรียน";

        if (recent && recent.length > 0) {
          await supabaseAdmin.from("attendance_logs").insert({
            student_id,
            direction,
            status: "duplicate",
            confidence,
            device_name: device.name,
          });
          return jsonResponse({
            result: "duplicate",
            student,
            direction,
            message: `${student.full_name} สแกน${directionLabel}ไปแล้ว`,
            speak: `${displayName} สแกนไปแล้ว`,
            next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
          });
        }

        const late =
          direction === "in" && settings ? now > timeToMinutes(settings.late_after) : false;

        const { data: inserted } = await supabaseAdmin
          .from("attendance_logs")
          .insert({
            student_id,
            direction,
            status: "ok",
            confidence,
            device_name: device.name,
          })
          .select("id, scanned_at")
          .maybeSingle();

        const template = settings?.voice_template ?? "สแกนสำเร็จ {name} {direction}";
        const speak = template
          .replace("{name}", displayName)
          .replace("{direction}", directionLabel)
          .replace("{code}", student.student_code)
          .replace("{class}", student.class_room ?? "");

        return jsonResponse({
          result: "ok",
          student,
          direction,
          late,
          log: inserted,
          message: `สแกนสำเร็จ: ${student.full_name} (${directionLabel})${late ? " • มาสาย" : ""}`,
          speak: late ? `${speak} มาสาย` : speak,
          next_delay_seconds: settings?.next_person_delay_seconds ?? 3,
        });
      },
    },
  },
});
