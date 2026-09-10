import { createFileRoute } from "@tanstack/react-router";
import agentSource from "../../../../../agent/agent.py?raw";
import requirements from "../../../../../agent/requirements.txt?raw";
import installPs1 from "../../../../../agent/install.ps1?raw";
import installSh from "../../../../../agent/install.sh?raw";

const files: Record<string, { body: string; type: string }> = {
  "agent.py": { body: agentSource, type: "text/plain; charset=utf-8" },
  "requirements.txt": { body: requirements, type: "text/plain; charset=utf-8" },
  "install.ps1": { body: installPs1, type: "text/plain; charset=utf-8" },
  "install.sh": { body: installSh, type: "text/plain; charset=utf-8" },
};

export const Route = createFileRoute("/api/public/agent/$file")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const entry = files[params.file];
        if (!entry) return new Response("Not found", { status: 404 });

        const url = new URL(request.url);
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
