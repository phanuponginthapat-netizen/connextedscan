import { createFileRoute } from "@tanstack/react-router";
import agentSource from "../../../../../agent/agent.py?raw";
import faceEngineSource from "../../../../../agent/face_engine.py?raw";
import requirements from "../../../../../agent/requirements.txt?raw";
import installPs1 from "../../../../../agent/install.ps1?raw";
import installSh from "../../../../../agent/install.sh?raw";

const files: Record<string, { body: string; type: string }> = {
  "agent.py": { body: agentSource, type: "text/plain; charset=utf-8" },
  "face_engine.py": { body: faceEngineSource, type: "text/plain; charset=utf-8" },
  "requirements.txt": { body: requirements, type: "text/plain; charset=utf-8" },
  "install.ps1": { body: installPs1, type: "text/plain; charset=utf-8" },
  "install.sh": { body: installSh, type: "text/plain; charset=utf-8" },
};

/** Files the FaceGate desktop program keeps up to date automatically. */
const AGENT_FILES = ["agent.py", "face_engine.py", "requirements.txt"];

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildManifest(origin: string) {
  const entries: Record<string, string> = {};
  for (const name of AGENT_FILES) {
    entries[name] = await sha256(files[name]!.body);
  }
  const appVersion = await sha256(Object.values(entries).join("|"));
  return {
    appVersion,
    generatedAt: new Date().toISOString(),
    baseUrl: `${origin}/api/public/agent`,
    files: entries,
  };
}

export const Route = createFileRoute("/api/public/agent/$file")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);

        if (params.file === "manifest.json") {
          const manifest = await buildManifest(url.origin);
          return new Response(JSON.stringify(manifest), {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "access-control-allow-origin": "*",
            },
          });
        }

        const entry = files[params.file];
        if (!entry) return new Response("Not found", { status: 404 });

        const key = (url.searchParams.get("key") ?? "").replace(/[^A-Za-z0-9._-]/g, "");
        const body = entry.body
          .replaceAll("__CLOUD_URL__", url.origin)
          .replaceAll("__DEVICE_KEY__", key);

        return new Response(body, {
          headers: {
            "content-type": entry.type,
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
