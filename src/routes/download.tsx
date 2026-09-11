import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScanFace,
  Download,
  Terminal,
  Check,
  Copy,
  Cpu,
  HardDrive,
  Camera,
  MemoryStick,
  MonitorCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCms } from "@/lib/cms-client";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
  head: () => ({
    meta: [
      { title: "ดาวน์โหลดโปรแกรมสแกนใบหน้า FaceGate (Windows / Linux)" },
      {
        name: "description",
        content:
          "ดาวน์โหลดไฟล์ติดตั้ง FaceGate สำหรับ Windows และ Linux พร้อมคำสั่งติดตั้งผ่าน Command Prompt และ Terminal และสเปคเครื่องขั้นต่ำที่แนะนำ",
      },
      { property: "og:title", content: "ดาวน์โหลดโปรแกรมสแกนใบหน้า FaceGate" },
      {
        property: "og:description",
        content: "ไฟล์ติดตั้งสำหรับ Windows และ Linux พร้อมคำสั่งติดตั้งและสเปคขั้นต่ำ",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-slate-900 p-3 text-slate-100">
      <Terminal className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      <code className="flex-1 break-all font-mono text-xs leading-relaxed">{value}</code>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </Button>
    </div>
  );
}

const specs = [
  {
    icon: Cpu,
    label: "ซีพียู",
    min: "Intel Celeron J4125 / N4120 (4 คอร์)",
    good: "Intel N5105 / N100 ขึ้นไป",
  },
  {
    icon: MemoryStick,
    label: "แรม",
    min: "4 GB",
    good: "8 GB",
  },
  {
    icon: HardDrive,
    label: "พื้นที่ว่าง",
    min: "64 GB SSD (ใช้จริงราว 3 GB)",
    good: "128 GB SSD",
  },
  {
    icon: Camera,
    label: "กล้อง",
    min: "USB Webcam 720p",
    good: "Webcam 1080p มีไฟช่วยหน้า",
  },
  {
    icon: MonitorCheck,
    label: "ระบบปฏิบัติการ",
    min: "Windows 10/11 64-bit หรือ Ubuntu 20.04+ 64-bit",
    good: "Windows 11 / Ubuntu 22.04",
  },
  {
    icon: ShieldCheck,
    label: "อินเทอร์เน็ต",
    min: "ต่อเน็ตได้ตลอด (ครั้งแรกโหลดราว 300 MB)",
    good: "สาย LAN",
  },
];

function DownloadPage() {
  const { t } = useCms();
  const logo = t("brand.logo_url");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const winCmd = `powershell -ExecutionPolicy Bypass -c "irm '${origin}/api/public/agent/install.ps1' | iex"`;
  const linuxCmd = `curl -fsSL "${origin}/api/public/agent/install.sh" | bash`;

  return (
    <main className="min-h-screen bg-[#f6f9fd] text-[#132a4f]">
      <header className="sticky top-0 z-30 border-b border-sky-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt={t("brand.name")} className="size-10 rounded-xl object-contain" />
            ) : (
              <span className="grid size-10 place-items-center rounded-xl bg-[#1d6fe0] text-white">
                <ScanFace className="size-5" />
              </span>
            )}
            <span className="font-display text-lg font-bold">{t("brand.name")}</span>
          </Link>
          <Button asChild size="sm" className="rounded-full bg-[#1d6fe0] px-5 text-white">
            <Link to="/admin">เข้าสู่ระบบการใช้งาน</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-12 pb-6 text-center">
        <p className="animate-rise text-xs font-semibold tracking-[0.3em] text-[#1d6fe0] uppercase">
          โปรแกรมตู้สแกน
        </p>
        <h1 className="animate-rise mt-3 font-display text-3xl font-bold sm:text-4xl [animation-delay:0.08s]">
          ดาวน์โหลดโปรแกรมสแกนใบหน้า
        </h1>
        <p className="animate-rise mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base [animation-delay:0.15s]">
          การสแกนใบหน้าทำงานผ่านโปรแกรมที่ติดตั้งบนเครื่องตู้สแกนเท่านั้น เพื่อความแม่นยำและความเร็ว
          เลือกไฟล์ติดตั้งตามระบบปฏิบัติการของเครื่อง
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-xl shadow-blue-900/10 sm:p-8">
          <Tabs defaultValue="windows">
            <TabsList className="rounded-full">
              <TabsTrigger value="windows" className="rounded-full">
                Windows 64-bit
              </TabsTrigger>
              <TabsTrigger value="linux" className="rounded-full">
                Linux 64-bit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="windows" className="space-y-5 pt-6">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[#1d6fe0] px-7 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
              >
                <a href="/api/public/agent/FaceGate-Setup-windows-x64.bat" download>
                  <Download className="size-5" /> ดาวน์โหลดไฟล์ติดตั้ง Windows
                </a>
              </Button>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>ดาวน์โหลดไฟล์ แล้วคลิกขวา → Run as administrator (หรือดับเบิลคลิก)</li>
                <li>ใส่รหัสเครื่องที่ได้จากหน้าหลังบ้าน แล้วรอจนติดตั้งเสร็จ</li>
                <li>ระบบสร้างไอคอน FaceGate บนเดสก์ท็อป และเปิดเองทุกครั้งที่เปิดเครื่อง</li>
              </ol>
              <div className="space-y-2">
                <p className="text-sm font-semibold">ติดตั้งผ่าน Command Prompt (คำสั่งเดียว)</p>
                <CopyBox value={winCmd} />
              </div>
            </TabsContent>

            <TabsContent value="linux" className="space-y-5 pt-6">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[#1d6fe0] px-7 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
              >
                <a href="/api/public/agent/FaceGate-Setup-linux-x64.sh" download>
                  <Download className="size-5" /> ดาวน์โหลดไฟล์ติดตั้ง Linux
                </a>
              </Button>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>เปิด Terminal ในโฟลเดอร์ที่ดาวน์โหลดไฟล์</li>
                <li>
                  รัน <code className="rounded bg-sky-50 px-1">chmod +x FaceGate-Setup-linux-x64.sh</code>{" "}
                  แล้ว <code className="rounded bg-sky-50 px-1">./FaceGate-Setup-linux-x64.sh</code>
                </li>
                <li>ใส่รหัสเครื่อง แล้วรอจนติดตั้งเสร็จ</li>
                <li>
                  เปิดโปรแกรมด้วยคำสั่ง <code className="rounded bg-sky-50 px-1">facegate</code>{" "}
                  หรือไอคอน FaceGate ในเมนูโปรแกรม (เปิดเองทุกครั้งที่เปิดเครื่อง)
                </li>
              </ol>
              <div className="space-y-2">
                <p className="text-sm font-semibold">ติดตั้งผ่าน Terminal (คำสั่งเดียว)</p>
                <CopyBox value={linuxCmd} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-xl shadow-blue-900/10 sm:p-8">
          <h2 className="font-display text-2xl font-bold">ใช้แท็บเล็ตหรือมือถือเครื่องเก่าแทนคอมพิวเตอร์</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            ไม่ต้องติดตั้งโปรแกรม เปิดหน้าสแกนบนแท็บเล็ต ใส่รหัสเครื่องที่ได้จากหน้าหลังบ้าน
            แล้วเพิ่มลงหน้าจอโฮมเพื่อใช้แบบเต็มจอ เหมาะกับจุดสแกนเพิ่มเติมหรือใช้ชั่วคราว
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>เปิดหน้าสแกนบนแท็บเล็ต แล้วอนุญาตให้ใช้กล้อง</li>
            <li>ใส่รหัสเครื่อง และเลือกว่าเครื่องนี้ใช้สแกนเข้า ออก หรืออัตโนมัติตามเวลา</li>
            <li>กด “เพิ่มลงหน้าจอโฮม” ในเมนูเบราว์เซอร์ เพื่อเปิดแบบเต็มจอเหมือนแอป</li>
          </ol>
          <p className="mt-4 text-sm text-slate-500">
            แนะนำแท็บเล็ต Android 8 ขึ้นไป หรือ iPad ที่ใช้ Safari รุ่นใหม่ แรม 3 GB ขึ้นไป
            กล้องหน้า 2 ล้านพิกเซลขึ้นไป และต่ออินเทอร์เน็ตตลอดเวลา
            ความเร็วจะช้ากว่าเครื่องที่ติดตั้งโปรแกรม และไม่รองรับการควบคุมประตู micro:bit
          </p>
          <Button
            asChild
            size="lg"
            className="mt-5 rounded-full bg-[#1d6fe0] px-7 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
          >
            <Link to="/tablet">เปิดหน้าสแกนบนแท็บเล็ต</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="font-display text-2xl font-bold">สเปคเครื่องขั้นต่ำที่แนะนำ</h2>
        <p className="mt-2 text-sm text-slate-500">
          เครื่อง Mini PC มือสองราคาประหยัดใช้ได้ ขอให้เป็น 64-bit และมีแรม 4 GB ขึ้นไป
        </p>
        <div className="stagger-children mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specs.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-sky-100 text-[#1d6fe0]">
                <s.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{s.label}</h3>
              <p className="mt-1 text-sm text-slate-600">ขั้นต่ำ: {s.min}</p>
              <p className="text-xs text-slate-400">แนะนำ: {s.good}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-2xl bg-sky-50 p-4 text-sm text-slate-600">
          หมายเหตุ: เครื่อง Intel Atom x5 ใช้งานได้แต่จะช้ากว่า (ราว 1–3 วินาทีต่อการสแกน)
          หากต้องการให้ลื่นแนะนำ Celeron N5105 หรือ N100 ขึ้นไป และตั้งกล้องที่ความละเอียด 640×480
        </p>
      </section>

      <footer className="border-t border-sky-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm text-slate-500">
          <span className="font-semibold text-[#132a4f]">{t("brand.name")}</span>
          <Link to="/" className="hover:text-[#1d6fe0]">
            กลับหน้าแรก
          </Link>
        </div>
      </footer>
    </main>
  );
}
