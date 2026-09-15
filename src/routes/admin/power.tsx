import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Cpu, MonitorOff, MonitorSmartphone, Moon, Power, RotateCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/power")({
  component: PowerPage,
  head: () => ({
    meta: [
      { title: "ประหยัดพลังงาน – พักจอ ปิด/เปิดเครื่อง | FaceGate" },
      {
        name: "description",
        content:
          "ตั้งเวลาพักหน้าจอ ปิดเครื่องอัตโนมัติ และสั่งเปิด-ปิดตู้สแกนจากหลังบ้าน เพื่อลดค่าไฟของโรงเรียน",
      },
      { property: "og:title", content: "ประหยัดพลังงานตู้สแกน | FaceGate" },
      {
        property: "og:description",
        content: "พักหน้าจอเอง ปิดเครื่องตามเวลา และสั่งงานตู้สแกนระยะไกล",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type PowerForm = {
  power_saving_enabled: boolean;
  screen_idle_minutes: number;
  screen_off_start: string;
  screen_off_end: string;
  auto_power_off_enabled: boolean;
  auto_power_off_time: string;
  auto_power_off_action: string;
  power_off_workdays_only: boolean;
};

const DEFAULTS: PowerForm = {
  power_saving_enabled: false,
  screen_idle_minutes: 10,
  screen_off_start: "18:00",
  screen_off_end: "06:00",
  auto_power_off_enabled: false,
  auto_power_off_time: "18:30",
  auto_power_off_action: "shutdown",
  power_off_workdays_only: false,
};

const REMOTE: Array<{ command: string; label: string; hint: string; icon: typeof Power }> = [
  { command: "screen_off", label: "ดับจอ", hint: "เครื่องยังทำงาน", icon: MonitorOff },
  { command: "screen_on", label: "เปิดจอ", hint: "ปลุกจอกลับมา", icon: MonitorSmartphone },
  { command: "sleep", label: "พักเครื่อง", hint: "นับถอยหลัง 60 วินาที", icon: Moon },
  { command: "shutdown", label: "ปิดเครื่อง", hint: "นับถอยหลัง 60 วินาที", icon: Power },
  { command: "cancel", label: "ยกเลิกการปิด", hint: "หยุดการนับถอยหลัง", icon: RotateCw },
];

const trimTime = (value: string) => (value ? value.slice(0, 5) : value);

function PowerPage() {
  const [form, setForm] = useState<PowerForm>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [wake, setWake] = useState({
    wake_mac: "",
    wake_broadcast: "255.255.255.255",
    wake_port: 9,
  });
  const [savingWake, setSavingWake] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data: settings }, { data: devices }] = await Promise.all([
        supabase.from("settings").select("*").limit(1).maybeSingle(),
        supabase
          .from("devices")
          .select("name, last_seen_at")
          .order("last_seen_at", { ascending: false })
          .limit(1),
      ]);
      if (settings) {
        setForm((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(DEFAULTS) as Array<keyof PowerForm>) {
            const value = (settings as Record<string, unknown>)[key];
            if (value === null || value === undefined) continue;
            if (typeof DEFAULTS[key] === "boolean") {
              (next as Record<string, unknown>)[key] = Boolean(value);
            } else if (typeof DEFAULTS[key] === "number") {
              (next as Record<string, unknown>)[key] = Number(value);
            } else {
              (next as Record<string, unknown>)[key] = trimTime(String(value));
            }
          }
          return next;
        });
        const row = settings as Record<string, unknown>;
        setWake({
          wake_mac: String(row["wake_mac"] ?? ""),
          wake_broadcast: String(row["wake_broadcast"] ?? "255.255.255.255"),
          wake_port: Number(row["wake_port"] ?? 9),
        });
      }
      const device = devices?.[0];
      if (device?.last_seen_at) {
        setLastSeen(new Date(device.last_seen_at).toLocaleString("th-TH"));
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({
        ...form,
        screen_off_start: `${form.screen_off_start}:00`.slice(0, 8),
        screen_off_end: `${form.screen_off_end}:00`.slice(0, 8),
        auto_power_off_time: `${form.auto_power_off_time}:00`.slice(0, 8),
      })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success("บันทึกแล้ว ตู้สแกนจะนำค่าไปใช้ภายในไม่กี่วินาที");
  };

  const saveWake = async () => {
    const clean = wake.wake_mac.replace(/[^0-9a-fA-F]/g, "");
    if (clean.length !== 12) {
      toast.error("กรอกหมายเลขเครื่อง (MAC) ให้ครบ 12 ตัว เช่น 1A:2B:3C:4D:5E:6F");
      return;
    }
    setSavingWake(true);
    const { error } = await supabase
      .from("settings")
      .update({
        wake_mac: clean.match(/.{2}/g)!.join(":").toUpperCase(),
        wake_broadcast: wake.wake_broadcast || "255.255.255.255",
        wake_port: Number(wake.wake_port) || 9,
      })
      .eq("id", true);
    setSavingWake(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success("บันทึกแล้ว");
  };

  const sendCommand = async (command: string) => {
    setSending(command);
    const { error } = await supabase.from("device_commands").insert({ command });
    setSending(null);
    if (error) {
      toast.error("ส่งคำสั่งไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success("ส่งคำสั่งแล้ว ตู้สแกนจะทำงานภายในไม่กี่วินาที");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Zap className="size-6 text-primary" /> ประหยัดพลังงาน
        </h1>
        <p className="text-sm text-muted-foreground">
          พักหน้าจอเมื่อไม่มีคนใช้ ปิดเครื่องตามเวลา และสั่งเปิด-ปิดตู้สแกนได้จากที่นี่
          {lastSeen ? ` · ตู้สแกนติดต่อครั้งล่าสุด ${lastSeen}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ตั้งเวลาอัตโนมัติ</CardTitle>
          <CardDescription>
            เปิดสวิตช์นี้แล้วตู้สแกนจะพักจอและปิดเครื่องตามเวลาที่ตั้งไว้เอง
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">เปิดใช้ระบบประหยัดพลังงาน</p>
              <p className="text-xs text-muted-foreground">ปิดสวิตช์นี้แล้วทุกอย่างด้านล่างจะหยุดทำงาน</p>
            </div>
            <Switch
              checked={form.power_saving_enabled}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, power_saving_enabled: checked }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="idle">พักหน้าจอเมื่อไม่มีคนสแกนนานกี่นาที</Label>
              <Input
                id="idle"
                type="number"
                min={0}
                max={240}
                value={String(form.screen_idle_minutes)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, screen_idle_minutes: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">ใส่ 0 ถ้าไม่ต้องการให้จอดับเอง</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="off-start">จอดับตั้งแต่</Label>
                <Input
                  id="off-start"
                  type="time"
                  value={form.screen_off_start}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, screen_off_start: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="off-end">ถึง</Label>
                <Input
                  id="off-end"
                  type="time"
                  value={form.screen_off_end}
                  onChange={(e) => setForm((prev) => ({ ...prev, screen_off_end: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">ปิดเครื่องอัตโนมัติตามเวลา</p>
              <p className="text-xs text-muted-foreground">
                ก่อนปิดจะนับถอยหลังบนหน้าจอตู้สแกน 60 วินาที ให้กดยกเลิกได้
              </p>
            </div>
            <Switch
              checked={form.auto_power_off_enabled}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, auto_power_off_enabled: checked }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="off-time">ปิดเครื่องเวลา</Label>
              <Input
                id="off-time"
                type="time"
                value={form.auto_power_off_time}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, auto_power_off_time: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="off-action">เมื่อถึงเวลาให้</Label>
              <select
                id="off-action"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.auto_power_off_action}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, auto_power_off_action: e.target.value }))
                }
              >
                <option value="shutdown">ปิดเครื่อง (ประหยัดไฟที่สุด)</option>
                <option value="sleep">พักเครื่อง (ปลุกกลับได้เร็ว)</option>
              </select>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">ปิดเฉพาะวันทำการ</p>
              <p className="text-xs text-muted-foreground">
                ใช้วันทำการชุดเดียวกับหน้าตั้งค่าระบบ
              </p>
            </div>
            <Switch
              checked={form.power_off_workdays_only}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, power_off_workdays_only: checked }))
              }
            />
          </div>

          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">สั่งงานตู้สแกนระยะไกล</CardTitle>
          <CardDescription>
            กดได้จากที่ไหนก็ได้ ตู้สแกนจะรับคำสั่งภายในไม่กี่วินาทีเมื่อเชื่อมอินเทอร์เน็ตอยู่
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {REMOTE.map((item) => (
            <Button
              key={item.command}
              variant={item.command === "shutdown" ? "destructive" : "secondary"}
              disabled={sending !== null}
              onClick={() => void sendCommand(item.command)}
              title={item.hint}
            >
              <item.icon className="size-4" /> {item.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="size-4 text-primary" /> การเปิดเครื่องตอนเช้า
          </CardTitle>
          <CardDescription>
            เครื่องที่ปิดสนิทแล้วสั่งเปิดผ่านอินเทอร์เน็ตไม่ได้ จึงต้องตั้งที่ตัวเครื่องหนึ่งครั้ง
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">วิธีที่แนะนำ — ตั้งเวลาเปิดเครื่องใน BIOS</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>เปิดเครื่องแล้วกด Del หรือ F2 ค้างไว้เพื่อเข้า BIOS</li>
              <li>หาหัวข้อ Power Management หรือ APM Configuration</li>
              <li>เปิด “Power On By RTC Alarm” หรือ “Auto Power On”</li>
              <li>ตั้งเวลา เช่น 06:30 และเลือกทุกวัน (Every Day)</li>
              <li>กด F10 บันทึกแล้วออก — โปรแกรม FaceGate จะเปิดขึ้นเองเมื่อเครื่องบูต</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">ทางเลือก — ใช้โหมดพักเครื่อง</p>
            <p className="mt-1">
              เลือก “พักเครื่อง” ด้านบน แล้วปลุกด้วยการกดปุ่มคีย์บอร์ด/เมาส์ (รวมถึงรีโมทไร้สาย)
              หรือส่ง Wake-on-LAN จากคอมพิวเตอร์เครื่องอื่นในเครือข่ายเดียวกันของโรงเรียน
            </p>
          </div>
          <p className="text-xs">
            หมายเหตุ: ค่าที่ตั้งไว้จะมีผลกับเครื่องตู้สแกนทุกเครื่องที่เชื่อมกับระบบนี้
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
