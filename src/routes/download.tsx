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
  Smartphone,

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
    min: "ต่อเน็ตได้ตลอด (ไฟล์ครบชุดไม่ต้องโหลดอะไรเพิ่มตอนติดตั้ง)",
    good: "สาย LAN",
  },
];

function DownloadPage() {
  const { t } = useCms();
  const logo = t("brand.logo_url");
  const apkUrl = t("download.apk_url") || "/downloads/FaceGate-Scanner.apk";
  const apkVersion = t("download.apk_version") || "1.0.0";
  const bundleWin = t("download.bundle_windows_url");
  const bundleLinux = t("download.bundle_linux_url");
  const bundleVersion = t("download.bundle_version") || "1.4.0";
  const standaloneWin = t("download.standalone_windows_url");
  const standaloneLinux = t("download.standalone_linux_url");
  const standaloneVersion = t("download.standalone_version") || "1.6.0";
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
              <div className="rounded-2xl border-2 border-[#1d6fe0]/30 bg-sky-50/60 p-5">
                <p className="text-xs font-semibold tracking-widest text-[#1d6fe0] uppercase">
                  แนะนำ · ไฟล์ครบชุด ใช้ได้ทันที
                </p>
                <h3 className="mt-2 font-display text-lg font-bold">
                  ไฟล์ติดตั้งแบบครบชุด (ออฟไลน์ 100%)
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  รวมโปรแกรมสแกน ตัวประมวลผลใบหน้า และข้อมูลใบหน้าที่ระบบต้องใช้ไว้ในไฟล์เดียว
                  ติดตั้งเสร็จเปิดใช้งานได้ทันที ไม่ต้องติดตั้งอะไรเพิ่ม และไม่ต้องรอโหลดจากอินเทอร์เน็ตอีก
                  (ไฟล์ใหญ่ประมาณ 400–600 MB)
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {bundleWin ? (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full bg-[#1d6fe0] px-7 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
                    >
                      <a href={bundleWin} download>
                        <Download className="size-5" /> ดาวน์โหลดไฟล์ครบชุด Windows ({bundleVersion})
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-slate-500">
                      ยังไม่ได้ใส่ลิงก์ไฟล์ครบชุด — ใส่ได้ที่หลังบ้าน → ตั้งค่า → เนื้อหา →
                      “ลิงก์ไฟล์ติดตั้งแบบครบชุด (Windows)”
                    </p>
                  )}
                </div>
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>แตกไฟล์ ZIP ให้ครบทุกไฟล์</li>
                  <li>ดับเบิลคลิก “ติดตั้ง-FaceGate.bat”</li>
                  <li>ใส่รหัสเครื่องที่ได้จากหน้าหลังบ้าน แล้วเริ่มสแกนได้เลย</li>
                </ol>
              </div>


              <div className="rounded-2xl border-2 border-emerald-300/60 bg-emerald-50/60 p-5">
                <p className="text-xs font-semibold tracking-widest text-emerald-700 uppercase">
                  จบในเครื่อง · ไม่ต้องต่ออินเทอร์เน็ต
                </p>
                <h3 className="mt-2 font-display text-lg font-bold">
                  ไฟล์ติดตั้งแบบใช้งานเดี่ยว (Standalone)
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  ติดตั้งเครื่องเดียวได้ทั้งตู้สแกนและหน้าหลังบ้าน ทั้งรายชื่อ ใบหน้า ประวัติการสแกน
                  รายงาน และการตั้งค่า เก็บอยู่ในเครื่องนั้นทั้งหมด ไม่ต้องใส่รหัสเครื่อง
                  ไม่ต้องต่อเน็ต เหมาะกับการนำไปใช้แยกในแต่ละโรงเรียน
                </p>
                <div className="mt-4">
                  {standaloneWin ? (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full bg-emerald-600 px-7 text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
                    >
                      <a href={standaloneWin} download>
                        <Download className="size-5" /> ดาวน์โหลดรุ่นจบในเครื่อง Windows ({standaloneVersion})
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-slate-500">
                      ยังไม่ได้ใส่ลิงก์รุ่นจบในเครื่อง — ใส่ได้ที่หลังบ้าน → ตั้งค่า → เนื้อหา →
                      “ลิงก์ไฟล์รุ่นจบในเครื่อง (Windows)”
                    </p>
                  )}
                </div>
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>แตกไฟล์แล้วติดตั้งตามไฟล์ “อ่านก่อน-ติดตั้ง.txt”</li>
                  <li>เปิดโปรแกรม กด F9 เพื่อเข้าหลังบ้านในเครื่อง แล้วตั้งรหัสผู้ดูแล</li>
                  <li>ใส่ชื่อโรงเรียน เวลาเข้า–ออก เพิ่มรายชื่อ และลงทะเบียนใบหน้า</li>
                  <li>สำรองข้อมูลเป็นไฟล์เดียวได้จากหลังบ้าน → สำรองข้อมูล</li>
                </ol>
              </div>
              <div className="space-y-3 rounded-2xl border border-sky-100 p-5">
                <h3 className="text-sm font-semibold">ไฟล์ติดตั้งแบบเล็ก (โหลดส่วนที่เหลือระหว่างติดตั้ง)</h3>
                <Button asChild variant="outline" className="rounded-full px-6">
                  <a href="/api/public/agent/FaceGate-Setup-windows-x64.bat" download>
                    <Download className="size-4" /> ไฟล์ติดตั้งแบบเล็ก Windows
                  </a>
                </Button>
                <p className="text-sm font-semibold">ติดตั้งผ่าน Command Prompt (คำสั่งเดียว)</p>
                <CopyBox value={winCmd} />
              </div>
            </TabsContent>

            <TabsContent value="linux" className="space-y-5 pt-6">
              <div className="rounded-2xl border-2 border-[#1d6fe0]/30 bg-sky-50/60 p-5">
                <p className="text-xs font-semibold tracking-widest text-[#1d6fe0] uppercase">
                  แนะนำ · ไฟล์ครบชุด ใช้ได้ทันที
                </p>
                <h3 className="mt-2 font-display text-lg font-bold">
                  ไฟล์ติดตั้งแบบครบชุด (ออฟไลน์ 100%)
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  รวมทุกอย่างไว้ในไฟล์เดียว แตกไฟล์แล้วติดตั้งใช้งานได้ทันที ไม่ต้องโหลดอะไรเพิ่ม
                </p>
                <div className="mt-4">
                  {bundleLinux ? (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full bg-[#1d6fe0] px-7 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
                    >
                      <a href={bundleLinux} download>
                        <Download className="size-5" /> ดาวน์โหลดไฟล์ครบชุด Linux ({bundleVersion})
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-slate-500">
                      ยังไม่ได้ใส่ลิงก์ไฟล์ครบชุด — ใส่ได้ที่หลังบ้าน → ตั้งค่า → เนื้อหา →
                      “ลิงก์ไฟล์ติดตั้งแบบครบชุด (Linux)”
                    </p>
                  )}
                </div>
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>
                    แตกไฟล์:{" "}
                    <code className="rounded bg-white px-1">tar xzf FaceGate-AllInOne-linux-x64.tar.gz</code>
                  </li>
                  <li>
                    ติดตั้ง: <code className="rounded bg-white px-1">bash FaceGate-linux-x64/install.sh</code>
                  </li>
                  <li>
                    เปิดโปรแกรม: <code className="rounded bg-white px-1">facegate</code> แล้วใส่รหัสเครื่อง
                  </li>
                </ol>
              </div>


              <div className="rounded-2xl border-2 border-emerald-300/60 bg-emerald-50/60 p-5">
                <p className="text-xs font-semibold tracking-widest text-emerald-700 uppercase">
                  จบในเครื่อง · ไม่ต้องต่ออินเทอร์เน็ต
                </p>
                <h3 className="mt-2 font-display text-lg font-bold">
                  ไฟล์ติดตั้งแบบใช้งานเดี่ยว (Standalone)
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  ติดตั้งเครื่องเดียวได้ทั้งตู้สแกนและหน้าหลังบ้าน ทั้งรายชื่อ ใบหน้า ประวัติการสแกน
                  รายงาน และการตั้งค่า เก็บอยู่ในเครื่องนั้นทั้งหมด ไม่ต้องใส่รหัสเครื่อง
                  ไม่ต้องต่อเน็ต เหมาะกับการนำไปใช้แยกในแต่ละโรงเรียน
                </p>
                <div className="mt-4">
                  {standaloneLinux ? (
                    <Button
                      asChild
                      size="lg"
                      className="rounded-full bg-emerald-600 px-7 text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
                    >
                      <a href={standaloneLinux} download>
                        <Download className="size-5" /> ดาวน์โหลดรุ่นจบในเครื่อง Linux ({standaloneVersion})
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-slate-500">
                      ยังไม่ได้ใส่ลิงก์รุ่นจบในเครื่อง — ใส่ได้ที่หลังบ้าน → ตั้งค่า → เนื้อหา →
                      “ลิงก์ไฟล์รุ่นจบในเครื่อง (Linux)”
                    </p>
                  )}
                </div>
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>แตกไฟล์แล้วติดตั้งตามไฟล์ “อ่านก่อน-ติดตั้ง.txt”</li>
                  <li>เปิดโปรแกรม กด F9 เพื่อเข้าหลังบ้านในเครื่อง แล้วตั้งรหัสผู้ดูแล</li>
                  <li>ใส่ชื่อโรงเรียน เวลาเข้า–ออก เพิ่มรายชื่อ และลงทะเบียนใบหน้า</li>
                  <li>สำรองข้อมูลเป็นไฟล์เดียวได้จากหลังบ้าน → สำรองข้อมูล</li>
                </ol>
              </div>
              <div className="space-y-3 rounded-2xl border border-sky-100 p-5">
                <h3 className="text-sm font-semibold">ไฟล์ติดตั้งแบบเล็ก (โหลดส่วนที่เหลือระหว่างติดตั้ง)</h3>
                <Button asChild variant="outline" className="rounded-full px-6">
                  <a href="/api/public/agent/FaceGate-Setup-linux-x64.sh" download>
                    <Download className="size-4" /> ไฟล์ติดตั้งแบบเล็ก Linux
                  </a>
                </Button>
                <p className="text-sm font-semibold">ติดตั้งผ่าน Terminal (คำสั่งเดียว)</p>
                <CopyBox value={linuxCmd} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-xl shadow-emerald-900/5 sm:p-8">
          <h2 className="font-display text-2xl font-bold">อัปเดตเครื่องที่ติดตั้งไว้แล้ว (ไฟล์เล็ก)</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            ถ้าเคยติดตั้งไฟล์ครบชุดไว้แล้ว ไม่ต้องโหลดไฟล์ใหญ่ใหม่ ดาวน์โหลดไฟล์อัปเดตนี้
            (ไม่กี่ร้อย KB) แล้วคัดลอกไปทับไฟล์เดิมตามคำแนะนำที่แนบมาในไฟล์
            ไฟล์นี้สร้างจากโค้ดล่าสุดของระบบทุกครั้งที่กดดาวน์โหลด จึงไม่ใช่ไฟล์เก่าแน่นอน
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-emerald-600 px-7 text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5"
            >
              <a href="/api/public/agent/FaceGate-Update.zip" download>
                <Download className="size-5" /> ดาวน์โหลดไฟล์อัปเดตล่าสุด (ZIP)
              </a>
            </Button>
          </div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>ปิดโปรแกรม FaceGate บนเครื่องตู้สแกนให้สนิท</li>
            <li>แตกไฟล์ ZIP แล้วอ่านไฟล์ “อ่านก่อน-วิธีอัปเดต.txt”</li>
            <li>คัดลอกไฟล์ในโฟลเดอร์ agent และ electron ไปทับไฟล์เดิมในโฟลเดอร์ที่ติดตั้ง</li>
            <li>เปิดโปรแกรมใหม่ ระบบจะใช้โค้ดล่าสุดทันที</li>
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-xl shadow-blue-900/10 sm:p-8">
          <h2 className="font-display text-2xl font-bold">ใช้แท็บเล็ตหรือมือถือเครื่องเก่าแทนคอมพิวเตอร์</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            ติดตั้งแอปแท็บเล็ต (ไฟล์ APK) ที่ใช้โมเดลใบหน้าแบบเบา หรือเปิดหน้าสแกนผ่านเบราว์เซอร์ก็ได้
            ใส่รหัสเครื่องที่ได้จากหน้าหลังบ้าน แล้วใช้เป็นจุดสแกนเพิ่มได้ทันที
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
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-[#1d6fe0] px-7 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5"
            >
              <a href={apkUrl} download>
                <Smartphone className="size-5" /> ดาวน์โหลดแอปแท็บเล็ต (APK)
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <Link to="/tablet">เปิดหน้าสแกนบนแท็บเล็ต</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            ไฟล์ APK เวอร์ชัน {apkVersion} · ติดตั้งแล้วได้ไอคอนแอปและเปิดเต็มจอ
            ต้องอนุญาต “ติดตั้งแอปจากแหล่งนี้” และอนุญาตกล้องเมื่อเปิดครั้งแรก
          </p>
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
