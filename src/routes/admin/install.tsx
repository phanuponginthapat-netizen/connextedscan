import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, MonitorSmartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/install")({
  component: InstallPage,
  head: () => ({
    meta: [
      { title: "ติดตั้งโปรแกรมตู้สแกน | FaceGate" },
      { name: "description", content: "ติดตั้งโปรแกรมตรวจใบหน้าบนเครื่องตู้สแกนด้วยคำสั่งเดียว" },
    ],
  }),
});

const ZIP_PATH = "FaceGate-Setup-windows-x64-v3.zip";

function ZipDownloadButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          const { data, error: err } = await supabase.storage
            .from("downloads")
            .createSignedUrl(ZIP_PATH, 3600, { download: ZIP_PATH });
          setLoading(false);
          if (err || !data?.signedUrl) {
            setError("สร้างลิงก์ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่");
            return;
          }
          window.open(data.signedUrl, "_blank");
        }}
      >
        <Download className="size-4" />
        {loading ? "กำลังสร้างลิงก์ดาวน์โหลด..." : "ดาวน์โหลด FaceGate ZIP"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3">
      <code className="flex-1 break-all font-mono text-xs leading-relaxed">{value}</code>
      <Button
        size="sm"
        variant="secondary"
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

function InstallPage() {
  const [deviceId, setDeviceId] = useState<string>("");

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const selected = useMemo(
    () => devices?.find((d) => d.id === deviceId) ?? devices?.[0],
    [devices, deviceId],
  );

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const key = selected?.api_key ?? "รหัสเครื่อง";

  const winCmd = `powershell -ExecutionPolicy Bypass -c "irm '${origin}/api/public/agent/install.ps1?key=${key}' | iex"`;
  const linuxCmd = `curl -fsSL "${origin}/api/public/agent/install.sh?key=${key}" | bash`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ติดตั้งโปรแกรมตู้สแกน</h1>
        <p className="text-sm text-muted-foreground">
          รันคำสั่งเดียวบนเครื่องตู้สแกน ระบบจะดาวน์โหลด ติดตั้ง ตั้งค่ารหัสเครื่อง
          และเปิดโปรแกรมให้อัตโนมัติ รวมถึงเปิดเองทุกครั้งที่เปิดเครื่อง
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="size-4" /> เลือกเครื่อง
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {devices?.length ? (
            <div className="space-y-2">
              <Label>เครื่องตู้สแกน</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selected?.id ?? ""}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              ยังไม่มีเครื่อง — ไปที่หน้า “ตั้งค่า” เพื่อเพิ่มเครื่องตู้สแกนก่อน
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">คำสั่งติดตั้งอัตโนมัติ</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="windows">
            <TabsList>
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
            </TabsList>
            <TabsContent value="windows" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                คลิกขวาที่ปุ่ม Start → Windows PowerShell แล้ววางคำสั่งนี้
              </p>
              <CopyBox value={winCmd} />
            </TabsContent>
            <TabsContent value="linux" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">เปิด Terminal แล้ววางคำสั่งนี้</p>
              <CopyBox value={linuxCmd} />
            </TabsContent>
          </Tabs>

          <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>ติดตั้ง Python ให้เองถ้าเครื่องยังไม่มี</li>
            <li>ดาวน์โหลดโปรแกรมตรวจใบหน้าและไลบรารีทั้งหมด</li>
            <li>ใส่รหัสเครื่องให้อัตโนมัติ แล้วเริ่มโปรแกรม</li>
            <li>ตั้งให้เปิดเองทุกครั้งที่เปิดเครื่อง แล้วเปิดหน้าสแกน</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            ครั้งแรกจะใช้เวลาสักครู่ เพราะต้องดาวน์โหลดไฟล์ประมวลผลใบหน้าประมาณ 300 MB
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" /> ดาวน์โหลดโปรแกรม FaceGate (ZIP)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ไฟล์ ZIP แบบติดตั้งได้ทันที — ไม่ต้องลง Python เอง แตกไฟล์แล้วเปิด FaceGate.exe ได้เลย
            ใส่รหัสเครื่องครั้งแรกเพียงครั้งเดียว
          </p>
          <ZipDownloadButton />
          <p className="text-xs text-muted-foreground">
            ขนาดประมาณ 250 MB · สำหรับ Windows 64-bit
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="secondary" asChild>
              <a href={`/api/public/agent/FaceGate-Setup-windows-x64.bat?key=${key}`} download>
                <Download className="size-4" /> ไฟล์ติดตั้ง Windows (.bat)
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={`/api/public/agent/FaceGate-Setup-linux-x64.sh?key=${key}`} download>
                <Download className="size-4" /> ไฟล์ติดตั้ง Linux (.sh)
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ไฟล์ติดตั้งทั้งสองแบบใส่รหัสเครื่องให้อัตโนมัติแล้ว · Linux: รัน chmod +x
            แล้วเปิดไฟล์ได้ทันที
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" /> ดาวน์โหลดไฟล์แยก
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["agent.py", "requirements.txt", "install.ps1", "install.sh"].map((f) => (
            <Button key={f} variant="secondary" size="sm" asChild>
              <a href={`/api/public/agent/${f}?key=${key}`} download>
                {f}
              </a>
            </Button>
          ))}
        </CardContent>
      </Card>
    
      <Card>
        <CardHeader>
          <CardTitle className="text-base">สเปคเครื่องขั้นต่ำที่แนะนำ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>ซีพียู: Intel Celeron J4125 / N4120 ขึ้นไป (แนะนำ N5105 หรือ N100)</p>
          <p>แรม: 4 GB (แนะนำ 8 GB) · พื้นที่ว่าง: 64 GB SSD (ใช้จริงราว 3 GB)</p>
          <p>กล้อง: USB Webcam 720p ขึ้นไป · ตั้งความละเอียดประมวลผล 640×480</p>
          <p>ระบบปฏิบัติการ: Windows 10/11 64-bit หรือ Ubuntu 20.04+ 64-bit</p>
          <p>อินเทอร์เน็ต: ต่อเน็ตได้ตลอด (ครั้งแรกดาวน์โหลดราว 300 MB)</p>
        </CardContent>
      </Card>
    </div>
  );
}
