import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Faces enrolled without a browser descriptor yet, with a signed URL so the
 * admin page can measure them and send the descriptor back.
 */
export const listFacesNeedingWebEmbedding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId?: string; limit?: number }) =>
    z.object({ studentId: z.string().uuid().optional(), limit: z.number().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("student_faces")
      .select("id, student_id, image_path")
      .is("web_embedding", null)
      .limit(data.limit ?? 50);
    if (data.studentId) query = query.eq("student_id", data.studentId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const out: { id: string; url: string }[] = [];
    for (const row of rows ?? []) {
      const { data: signed } = await supabaseAdmin.storage
        .from("faces")
        .createSignedUrl(row.image_path, 60 * 30);
      if (signed?.signedUrl) out.push({ id: row.id, url: signed.signedUrl });
    }
    return out;
  });

/** Stores a descriptor measured in the browser for an enrolled photo. */
export const saveWebEmbedding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      faceId: string;
      descriptor?: number[];
      geometry?: Record<string, number>;
      error?: string;
    }) =>
      z
        .object({
          faceId: z.string().uuid(),
          descriptor: z.array(z.number()).min(64).max(512).optional(),
          geometry: z.record(z.string(), z.number()).optional(),
          error: z.string().max(300).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.descriptor) {
      const { error } = await supabaseAdmin
        .from("student_faces")
        .update({ error_message: data.error ?? "ไม่พบใบหน้าในรูปนี้" })
        .eq("id", data.faceId);
      if (error) throw new Error(error.message);
      return { ok: false };
    }

    const { error } = await supabaseAdmin
      .from("student_faces")
      .update({
        web_embedding: data.descriptor,
        web_geometry: data.geometry ?? null,
        error_message: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.faceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
