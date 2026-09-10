import { listFacesNeedingWebEmbedding, saveWebEmbedding } from "@/lib/web-faces.functions";

/**
 * Measures every enrolled photo that has no browser descriptor yet and sends
 * the numbers back to the server. Runs in the browser only.
 */
export async function prepareWebFaces(options?: {
  studentId?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ processed: number; failed: number }> {
  const { measureImageUrl } = await import("@/lib/face-web");
  const items = await listFacesNeedingWebEmbedding({
    data: { ...(options?.studentId ? { studentId: options.studentId } : {}), limit: 100 },
  });

  let processed = 0;
  let failed = 0;
  for (const [index, item] of items.entries()) {
    try {
      const outcome = await measureImageUrl(item.url);
      if (outcome.status === "ok") {
        await saveWebEmbedding({
          data: { faceId: item.id, descriptor: outcome.face.descriptor, geometry: outcome.face.geometry },
        });
        processed += 1;
      } else {
        await saveWebEmbedding({
          data: {
            faceId: item.id,
            error: outcome.status === "multiple_faces" ? "รูปนี้มีหลายใบหน้า" : "ไม่พบใบหน้าในรูปนี้",
          },
        });
        failed += 1;
      }
    } catch {
      failed += 1;
    }
    options?.onProgress?.(index + 1, items.length);
  }

  return { processed, failed };
}
