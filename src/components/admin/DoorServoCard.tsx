import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const AGENT_URL = "http://127.0.0.1:8899";

type ServoForm = {
  door_angle_down: number;
  door_angle_up: number;
  door_move_step: number;
  door_move_delay_ms: number;
  door_open_seconds: number;
  door_hold_power: boolean;
  door_buzzer_enabled: boolean;
  door_use_relay: boolean;
  door_invert_servo: boolean;
};

const DEFAULTS: ServoForm = {
  door_angle_down: 10,
  door_angle_up: 100,
  door_move_step: 3,
  door_move_delay_ms: 12,
  door_open_seconds: 5,
  door_hold_power: true,
  door_buzzer_enabled: false,
  door_use_relay: false,
  door_invert_servo: false,
};

const NUMBERS: Array<{
  key: keyof ServoForm;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  { key: "door_angle_down", label: "องศาเมื่อไม้กั้นลง", hint: "ตำแหน่งปิด (0–180)", min: 0, max: 180 },
  { key: "door_angle_up", label: "องศาเมื่อไม้กั้นขึ้น", hint: "ตำแหน่งเปิด (0–180)", min: 0, max: 180 },
  { key: "door_move_step", label: "ขยับทีละกี่องศา", hint: "น้อย = นุ่มนวลกว่า", min: 1, max: 30 },
  {
    key: "door_move_delay_ms",
    label: "หน่วงระหว่างจังหวะ (มิลลิวินาที)",
    hint: "มาก = ยกช้าและนิ่งกว่า",
    min: 2,
    max: 100,
  },
  {
    key: "door_open_seconds",
    label: "ยกค้างไว้กี่วินาที",
    hint: "ครบเวลาแล้วลดลงเอง",
    min: 1,
    max: 60,
  },
];

const SWITCHES: Array<{ key: keyof ServoForm; label: string; hint: string }> = [
  {
    key: "door_hold_power",
    label: "จ่ายไฟค้างให้ไม้กั้นอยู่นิ่ง",
    hint: "ปิดข้อนี้แล้วไม้กั้นจะไหลลงเอง — แนะนำให้เปิดไว้",
  },
  {
    key: "door_buzzer_enabled",
    label: "เปิดเสียงเตือนที่ประตู",
    hint: "เสียงกับการหมุนใช้วงจรร่วมกัน ถ้าไม้กั้นสะดุดให้ปิดข้อนี้",
  },
  { key: "door_use_relay", label: "สั่งกลอนไฟฟ้าเพิ่ม", hint: "ใช้เมื่อต่อรีเลย์ที่ขา P0" },
  {
    key: "door_invert_servo",
    label: "สลับทิศการหมุน",
    hint: "ใช้เมื่อประกอบไม้กั้นกลับด้าน แล้วมันยกลงแทนยกขึ้น",
  },
];

export function DoorServoCard() {
  const [form, setForm] = useState<ServoForm>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("settings").select("*").limit(1).maybeSingle();
      if (!data) return;
      setForm((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(DEFAULTS) as Array<keyof ServoForm>) {
          const value = (data as Record<string, unknown>)[key];
          if (value !== null && value !== undefined) {
            (next as Record<string, unknown>)[key] =
              typeof DEFAULTS[key] === "boolean" ? Boolean(value) : Number(value);
          }
        }
        return next;
      });
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("settings").update(form).eq("id", true);
    setSaving(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success("บันทึกแล้ว ตู้สแกนจะนำค่าไปใช้ภายในไม่กี่วินาที");
    void call("/door/config", "ส่งค่าไปที่ micro:bit แล้ว");
  };

  const call = async (path: string, okText: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${AGENT_URL}${path}`, { method: "POST" });
      const body = (await res.json()) as { ok?: boolean };
      if (body.ok) toast.success(okText);
      else toast.error("ยังไม่พบ micro:bit ที่เสียบกับเครื่องนี้");
    } catch {
      toast.error("สั่งงานไม่ได้ — ต้องเปิดหน้านี้บนเครื่องตู้สแกนที่ต่อ micro:bit");
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4 text-primary" /> ตั้งค่าการยก–ลดไม้กั้น
        </CardTitle>
        <CardDescription>
          ปรับองศา ความเร็ว และเวลายกค้างได้จากที่นี่ ไม่ต้องแก้โค้ดหรือลงโค้ดใหม่ใส่ micro:bit
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMBERS.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <Label htmlFor={item.key}>{item.label}</Label>
              <Input
                id={item.key}
                type="number"
                min={item.min}
                max={item.max}
                value={String(form[item.key])}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [item.key]: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {SWITCHES.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
              <Switch
                checked={Boolean(form[item.key])}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, [item.key]: checked }))
                }
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "กำลังบันทึก..." : "บันทึกและส่งค่าไปที่ประตู"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void call("/door/test", "สั่งยกไม้กั้นแล้ว")}
          >
            <ArrowUpToLine className="size-4" /> ทดลองยกขึ้น
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void call("/door/close", "สั่งลดไม้กั้นลงแล้ว")}
          >
            <ArrowDownToLine className="size-4" /> ทดลองลดลง
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ปุ่มทดลองใช้ได้เฉพาะเมื่อเปิดหน้านี้บนเครื่องตู้สแกนที่ต่อ micro:bit อยู่
        </p>
      </CardContent>
    </Card>
  );
}
