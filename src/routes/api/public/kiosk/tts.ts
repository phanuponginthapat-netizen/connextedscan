import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { corsPreflight, jsonResponse } from "@/lib/kiosk-auth.server";

const bodySchema = z.object({
  text: z.string().min(1).max(300),
});

/**
 * Spoken announcements for the kiosk. Used when the device has no Thai
 * system voice (common inside the FaceGate desktop app), so the sentence is
 * synthesised on the server and played back as plain audio.
 */
export const Route = createFileRoute("/api/public/kiosk/tts")({
  server: {
    handlers: {
      OPTIONS: () => corsPreflight(),
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonResponse({ error: "invalid body" }, 400);

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return jsonResponse({ error: "voice service not configured" }, 503);

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: parsed.data.text,
            voice: "alloy",
            instructions: "Speak clear, friendly Thai at a natural pace.",
            response_format: "mp3",
            stream_format: "audio",
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          return jsonResponse({ error: "voice failed", detail }, upstream.status);
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
