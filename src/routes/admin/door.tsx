import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, DoorOpen, Download, Plug, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/door")({
  component: DoorPage,
  head: () => ({
    meta: [
      { title: "ประตูอัจฉริยะ micro:bit | FaceGate" },
      {
        name: "description",
        content:
          "ต่อ micro:bit เข้ากับเครื่องตู้สแกน เพื่อเปิดประตูอัตโนมัติเฉพาะคนที่ลงทะเบียนใบหน้าไว้",
      },
      { property: "og:title", content: "ประตูอัจฉริยะ micro:bit | FaceGate" },
      {
        property: "og:description",
        content: "คู่มือการต่อสาย ลงโค้ด และทดสอบระบบเปิด-ปิดประตูอัตโนมัติ",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const AGENT_URL = "http://127.0.0.1:8899";

type DoorStatus = {
  enabled?: boolean;
  connected?: boolean;
  port?: string | null;
  opens?: number;
  error?: string | null;
};

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
      </Button>
    </div>
  );
}

function DoorPage() {
  const [status, setStatus] = useState<DoorStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${AGENT_URL}/door/status`);
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
    setChecking(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const wiring: Array<[string, string, string]> = [
    ["P2", "สายสัญญาณ Servo (ส้ม/เหลือง)", "สั่งยกไม้กั้นขึ้น–ลง (โหมดหลัก)"],
    ["P1", "ขาสัญญาณ Buzzer", "เสียงยืนยันผ่าน / เสียงเตือนเมื่อถูกปฏิเสธ"],
    ["P0", "ขา IN ของรีเลย์ 5V (ทางเลือก)", "ใช้เมื่อต้องการกลอนไฟฟ้าเสริม"],
    ["3V หรือไฟเลี้ยงแยก 5V", "สายไฟ + ของ Servo", "SG90 ตัวเล็กใช้ 3V ได้ ตัวใหญ่ต้องใช้ไฟแยก"],
    ["GND", "สายไฟ - ของ Servo และแหล่งจ่ายแยก", "ต่อกราวด์ร่วมกันเสมอ"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <DoorOpen className="size-6 text-primary" /> ประตูอัจฉริยะด้วย micro:bit
        </h1>
        <p className="text-sm text-muted-foreground">
          เมื่อสแกนใบหน้าผ่าน ระบบจะสั่งเปิดประตูให้เองภายในเสี้ยววินาที
          คนที่ไม่ได้ลงทะเบียนจะเปิดประตูไม่ได้และมีเสียงเตือนที่จุดประตู
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4" /> ระบบทำงานอย่างไร
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. กล้องที่ตู้สแกนจับใบหน้าคนที่ยืนอยู่ในกรอบกลางจอ (ทีละคนเท่านั้น)</p>
          <p>2. โปรแกรม FaceGate บนเครื่องตู้เทียบใบหน้ากับข้อมูลที่ลงทะเบียนไว้</p>
          <p>3. ระบบบันทึกเวลาเข้า-ออกบนคลาวด์ และตอบกลับว่า “ผ่าน” หรือ “ไม่ผ่าน”</p>
          <p>
            4. ถ้าผ่าน โปรแกรมส่งคำสั่งไปที่ micro:bit ผ่านสาย USB → micro:bit สั่งรีเลย์ปลดล็อกประตู
            ตามจำนวนวินาทีที่ตั้งไว้ แล้วล็อกกลับเอง
          </p>
          <p>
            5. ถ้าไม่ผ่าน (คนนอก สแกนซ้ำ หรือนอกเวลา) ประตูจะยังล็อก micro:bit ขึ้นกากบาทและส่งเสียงเตือน
          </p>
          <p>
            หากถอดสาย micro:bit ออก ตู้สแกนยังบันทึกเวลาได้ตามปกติ เพียงแต่จะไม่สั่งเปิดประตูเท่านั้น
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="size-4" /> อุปกรณ์และการต่อสาย
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            ต้องมี: BBC micro:bit (v1 หรือ v2), สาย micro-USB, รีเลย์ 5V 1 ช่อง (แบบ opto-isolated),
            กลอนแม่เหล็กไฟฟ้าหรือกลอนสลักไฟฟ้า พร้อมอะแดปเตอร์ 12V ของกลอนเอง
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-3 font-medium">ขาบน micro:bit</th>
                  <th className="p-3 font-medium">ต่อไปที่</th>
                  <th className="p-3 font-medium">ใช้ทำอะไร</th>
                </tr>
              </thead>
              <tbody>
                {wiring.map(([pin, to, why]) => (
                  <tr key={pin} className="border-t">
                    <td className="p-3 font-mono">{pin}</td>
                    <td className="p-3">{to}</td>
                    <td className="p-3 text-muted-foreground">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">{`  [กล้อง] → [เครื่องตู้สแกน + FaceGate] --USB--> [micro:bit]
                                                    |P0
                                                 [รีเลย์ 5V] --- ไฟ 12V ---> [กลอนไฟฟ้าประตู]`}</pre>
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            ความปลอดภัย: ห้ามจ่ายไฟกลอนประตูผ่าน micro:bit โดยตรง ให้ใช้แหล่งจ่ายแยกและต่อกราวด์ร่วม
            และควรมีปุ่มกดออกฉุกเฉินขนานกับกลอนเสมอ (กดปุ่ม A บน micro:bit ก็เปิดประตูเองได้)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" /> ลงโค้ดใส่ micro:bit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>ดาวน์โหลดไฟล์โค้ดด้านล่าง</li>
            <li>
              เปิดเว็บ <span className="font-mono">python.microbit.org</span> แล้วเลือก Open →
              เลือกไฟล์ที่ดาวน์โหลดมา
            </li>
            <li>เสียบ micro:bit กับเครื่องตู้สแกนด้วยสาย USB แล้วกด “Send to micro:bit”</li>
            <li>หน้าจอ micro:bit จะขึ้นรูปหน้ายิ้ม = พร้อมทำงาน</li>
            <li>อัปเดตโปรแกรม FaceGate บนเครื่องตู้ (รันไฟล์ติดตั้งซ้ำอีกครั้ง) แล้วเปิดใหม่</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/api/public/agent/microbit-door.py" download>
                <Download className="size-4" /> โค้ดสำหรับ micro:bit
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <a href="/api/public/agent/door.py" download>
                <Download className="size-4" /> door.py (ฝั่งเครื่องตู้สแกน)
              </a>
            </Button>
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">
              ปกติไม่ต้องตั้งค่าอะไรเพิ่ม ระบบหาพอร์ต micro:bit เอง
              ถ้าต้องระบุพอร์ตเองให้ตั้งค่าตัวแปรนี้บนเครื่องตู้สแกน
            </p>
            <CopyBox value="setx FACEGATE_DOOR_PORT COM5" />
            <CopyBox value="export FACEGATE_DOOR_PORT=/dev/ttyACM0" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> ทดสอบจากเครื่องตู้สแกน
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            เปิดหน้านี้บนเครื่องตู้สแกนที่ต่อ micro:bit อยู่ แล้วกดทดสอบ
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={checking} onClick={() => void refresh()}>
              ตรวจสถานะอีกครั้ง
            </Button>
            <Button
              onClick={async () => {
                setTestMsg(null);
                try {
                  const res = await fetch(`${AGENT_URL}/door/test`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ seconds: 3 }),
                  });
                  const data = await res.json();
                  setTestMsg(data.ok ? "สั่งเปิดประตู 3 วินาทีแล้ว" : "สั่งไม่สำเร็จ ตรวจสาย USB");
                } catch {
                  setTestMsg("ติดต่อโปรแกรม FaceGate บนเครื่องนี้ไม่ได้");
                }
                void refresh();
              }}
            >
              <DoorOpen className="size-4" /> ทดสอบเปิดประตู 3 วินาที
            </Button>
            {status ? (
              <Badge variant={status.connected ? "default" : "secondary"}>
                {status.connected ? `เชื่อมต่อแล้ว (${status.port})` : "ยังไม่พบ micro:bit"}
              </Badge>
            ) : (
              <Badge variant="secondary">ยังไม่ได้เชื่อมต่อโปรแกรมบนเครื่องนี้</Badge>
            )}
          </div>
          {testMsg && <p className="text-sm">{testMsg}</p>}
          {status?.error && <p className="text-xs text-destructive">{status.error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
