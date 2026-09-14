import { createFileRoute } from "@tanstack/react-router";
import { createZip } from "@/lib/zip";
import electronMain from "../../../../../electron/main.cjs?raw";
import electronPreload from "../../../../../electron/preload.cjs?raw";
import electronUpdater from "../../../../../electron/updater.cjs?raw";
import electronSettings from "../../../../../electron/settings.html?raw";
import electronLoading from "../../../../../electron/loading.html?raw";
import agentSource from "../../../../../agent/agent.py?raw";
import faceEngineSource from "../../../../../agent/face_engine.py?raw";
import doorSource from "../../../../../agent/door.py?raw";
import microbitSource from "../../../../../microbit/door.py?raw";
import requirements from "../../../../../agent/requirements.txt?raw";
import installPs1 from "../../../../../agent/install.ps1?raw";
import installSh from "../../../../../agent/install.sh?raw";
import installBat from "../../../../../agent/install.bat?raw";

const files: Record<string, { body: string; type: string; download?: string }> = {
  "agent.py": { body: agentSource, type: "text/plain; charset=utf-8" },
  "face_engine.py": { body: faceEngineSource, type: "text/plain; charset=utf-8" },
  "requirements.txt": { body: requirements, type: "text/plain; charset=utf-8" },
  "door.py": { body: doorSource, type: "text/plain; charset=utf-8" },
  // โค้ดสำหรับ BBC micro:bit (MicroPython) — นำไปวางที่ python.microbit.org
  "microbit-door.py": {
    body: microbitSource,
    type: "text/plain; charset=utf-8",
    download: "microbit-door.py",
  },
  "install.ps1": { body: installPs1, type: "text/plain; charset=utf-8" },
  "install.sh": { body: installSh, type: "text/plain; charset=utf-8" },
  "install.bat": { body: installBat, type: "text/plain; charset=utf-8" },
  // ไฟล์ติดตั้งพร้อมใช้ — ดับเบิลคลิกได้เหมือนไฟล์ .exe
  "FaceGate-Setup-windows-x64.bat": {
    body: installBat,
    type: "application/octet-stream",
    download: "FaceGate-Setup-windows-x64.bat",
  },
  "FaceGate-Setup-linux-x64.sh": {
    body: installSh,
    type: "application/octet-stream",
    download: "FaceGate-Setup-linux-x64.sh",
  },
};

/** Files the FaceGate desktop program keeps up to date automatically. */
const AGENT_FILES = ["agent.py", "face_engine.py", "door.py", "requirements.txt"];

const UPDATE_README = `FaceGate — ไฟล์อัปเดตโปรแกรม
================================

ไฟล์ชุดนี้คือโค้ดล่าสุดของโปรแกรมบนเครื่องตู้สแกน ใช้อัปเดตเครื่องที่ติดตั้ง
ไฟล์ครบชุด (all-in-one) ไว้แล้ว โดยไม่ต้องดาวน์โหลดไฟล์ใหญ่ใหม่ทั้งก้อน

วิธีอัปเดต (Windows)
1. ปิดโปรแกรม FaceGate ให้สนิท
2. เปิดโฟลเดอร์ที่ติดตั้ง FaceGate ไว้ (โฟลเดอร์ที่มีไฟล์ FaceGate.exe)
3. คัดลอกไฟล์ในโฟลเดอร์ agent ของชุดนี้ ไปทับที่
   resources\\app.asar.unpacked\\agent
4. ถ้าโฟลเดอร์ resources\\app มีอยู่ (ติดตั้งแบบไม่บีบ asar)
   ให้คัดลอกไฟล์ในโฟลเดอร์ electron ไปทับที่ resources\\app\\electron
5. เปิดโปรแกรม FaceGate ใหม่

วิธีอัปเดต (Linux)
เหมือนกับ Windows แต่โฟลเดอร์ติดตั้งอยู่ที่
  ~/.local/share/facegate

หมายเหตุ
- โค้ดตัวประมวลผลใบหน้า (โฟลเดอร์ agent) โปรแกรมอัปเดตให้เองอยู่แล้วทุก 15 นาที
  ชุดไฟล์นี้มีไว้สำหรับกรณีที่เครื่องต่อเน็ตไม่ได้ หรืออยากอัปเดตทันที
- โค้ดสำหรับ micro:bit อยู่ในโฟลเดอร์ microbit — นำไปวางที่ python.microbit.org
  แล้วแฟลชลงบอร์ดเมื่อมีการเปลี่ยนแปลง
`;

function buildUpdateZip() {
  return createZip([
    { name: "อ่านก่อน-วิธีอัปเดต.txt", content: UPDATE_README },
    { name: "agent/agent.py", content: agentSource },
    { name: "agent/face_engine.py", content: faceEngineSource },
    { name: "agent/door.py", content: doorSource },
    { name: "agent/requirements.txt", content: requirements },
    { name: "agent/install.ps1", content: installPs1 },
    { name: "agent/install.sh", content: installSh },
    { name: "agent/install.bat", content: installBat },
    { name: "electron/main.cjs", content: electronMain },
    { name: "electron/preload.cjs", content: electronPreload },
    { name: "electron/updater.cjs", content: electronUpdater },
    { name: "electron/settings.html", content: electronSettings },
    { name: "electron/loading.html", content: electronLoading },
    { name: "microbit/door.py", content: microbitSource },
  ]);
}

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

        if (params.file === "FaceGate-Update.zip") {
          const zip = buildUpdateZip();
          return new Response(new Blob([zip]), {
            headers: {
              "content-type": "application/zip",
              "content-disposition": 'attachment; filename="FaceGate-Update.zip"',
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

        const headers: Record<string, string> = {
          "content-type": entry.type,
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        };
        if (entry.download) {
          headers["content-disposition"] = `attachment; filename="${entry.download}"`;
        }

        return new Response(body, { headers });
      },
    },
  },
});
