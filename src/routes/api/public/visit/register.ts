import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  gender: z.enum(["male", "female", "other"]),
  affiliation: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(2).max(300),
  /** base64 JPEG of the visitor face, captured on their phone */
  photo: z.string().min(100),
  /** face-api descriptor measured in the visitor's browser */
  descriptor: z.array(z.number()).min(64).max(1024).optional(),
});

function decodeBase64Jpeg(value: string): Uint8Array | null {
  try {
    const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.length > 1000 && bytes.length < 5_000_000 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Self-service visitor registration, reached by scanning the QR code shown on
 * the kiosk. A visitor becomes a person of type "visitor" valid for today only,
 * so the same face scanner can let them in without any staff work.
 */
export const Route = createFileRoute("/api/public/visit/register")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid body" }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return jsonResponse({ error: "กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("settings")
          .select("visitor_register_enabled")
          .eq("id", true)
          .maybeSingle();
        if (!settings?.visitor_register_enabled) {
          return jsonResponse({ error: "โหมดผู้มาเยือนปิดอยู่ กรุณาติดต่อเจ้าหน้าที่" }, 403);
        }

        const bytes = decodeBase64Jpeg(parsed.data.photo);
        if (!bytes) return jsonResponse({ error: "ภาพใบหน้าไม่ถูกต้อง กรุณาถ่ายใหม่" }, 400);

        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
          new Date(),
        );
        const { count } = await supabaseAdmin
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("person_type", "visitor")
          .eq("visit_date", today);
        const code = `V${today.replaceAll("-", "").slice(2)}-${String((count ?? 0) + 1).padStart(3, "0")}`;

        const { data: person, error: personError } = await supabaseAdmin
          .from("students")
          .insert({
            student_code: code,
            full_name: parsed.data.full_name,
            gender: parsed.data.gender,
            person_type: "visitor",
            department: parsed.data.affiliation,
            visit_reason: parsed.data.reason,
            visit_date: today,
            is_active: true,
          })
          .select("id, student_code, full_name")
          .maybeSingle();
        if (personError || !person) {
          return jsonResponse({ error: "ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่" }, 500);
        }

        const path = `visitors/${person.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("faces")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
        if (uploadError) {
          await supabaseAdmin.from("students").delete().eq("id", person.id);
          return jsonResponse({ error: "บันทึกภาพใบหน้าไม่สำเร็จ กรุณาลองใหม่" }, 500);
        }

        await supabaseAdmin.from("students").update({ avatar_path: path }).eq("id", person.id);
        await supabaseAdmin.from("student_faces").insert({
          student_id: person.id,
          image_path: path,
          source: "visitor",
          // The kiosk program computes the ArcFace embedding on its next sync;
          // the browser descriptor already allows tablet scanning right away.
          status: parsed.data.descriptor ? "ready" : "pending",
          web_embedding: parsed.data.descriptor ?? null,
        });

        return jsonResponse({
          ok: true,
          code: person.student_code,
          full_name: person.full_name,
          valid_date: today,
        });
      },
    },
  },
});
