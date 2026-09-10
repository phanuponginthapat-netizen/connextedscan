import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "ตั้งค่าระบบ | FaceGate" },
      { name: "description", content: "ตั้งค่าช่วงเวลาเข้า-ออก การกันสแกนซ้ำ และเครื่องตู้สแกน" },
      { property: "og:title", content: "ตั้งค่าระบบ | FaceGate" },
      { property: "og:description", content: "ตั้งค่าเวลาเข้า-ออก กันสแกนซ้ำ และเครื่องตู้สแกน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type SettingsRow = {
  checkin_start: string;
  checkin_end: string;
  checkout_start: string;
  checkout_end: string;
  late_after: string;
  duplicate_cooldown_minutes: number;
  next_person_delay_seconds: number;
  match_threshold: number;
  require_liveness: boolean;
  school_name: string;
  voice_template: string;
  save_snapshots: boolean;
  auto_enroll: boolean;
  auto_enroll_min_confidence: number;
  auto_enroll_max_faces: number;
  geometry_weight: number;
  geometry_min_score: number;
  web_match_threshold: number;
  allow_web_scan: boolean;
};

function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SettingsRow | null>(null);

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) setForm(data as SettingsRow);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from("settings")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่าแล้ว");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const addDevice = useMutation({
    mutationFn: async () => {
      const key = crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabase
        .from("devices")
        .insert({ name: `ตู้สแกน ${(devices?.length ?? 0) + 1}`, api_key: key });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return <p className="text-muted-foreground">กำลังโหลด…</p>;

  const set = (patch: Partial<SettingsRow>) => setForm({ ...form, ...patch });

  const timeFields: Array<[keyof SettingsRow, string]> = [
    ["checkin_start", "เริ่มรับสแกนเข้า"],
    ["checkin_end", "สิ้นสุดรับสแกนเข้า"],
    ["late_after", "ถือว่าสายหลังเวลา"],
    ["checkout_start", "เริ่มรับสแกนออก"],
    ["checkout_end", "สิ้นสุดรับสแกนออก"],
  ];

  const numFields: Array<[keyof SettingsRow, string, string, number]> = [
    ["duplicate_cooldown_minutes", "กันสแกนซ้ำ (นาที)", "ภายในช่วงนี้จะไม่บันทึกซ้ำ", 1],
    ["next_person_delay_seconds", "หน่วงก่อนคนถัดไป (วินาที)", "เวลาพักหลังสแกนสำเร็จ", 1],
    ["match_threshold", "ค่าความเหมือนขั้นต่ำ", "0.1–1.0 ยิ่งสูงยิ่งเข้มงวด", 0.01],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">ตั้งค่าระบบ</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ช่วงเวลาเข้า-ออก</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {timeFields.map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                type="time"
                value={String(form[key]).slice(0, 5)}
                onChange={(e) => set({ [key]: `${e.target.value}:00` } as Partial<SettingsRow>)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">การสแกนและเสียง</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {numFields.map(([key, label, hint, step]) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                type="number"
                step={step}
                value={Number(form[key])}
                onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<SettingsRow>)}
              />
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>ข้อความเสียงพูด</Label>
            <Input
              value={form.voice_template}
              onChange={(e) => set({ voice_template: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              ใช้ตัวแปร {"{name}"} แทนชื่อ และ {"{direction}"} แทนคำว่าเข้า/ออก
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>ชื่อโรงเรียน</Label>
            <Input
              value={form.school_name}
              onChange={(e) => set({ school_name: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Switch
              checked={form.require_liveness}
              onCheckedChange={(v) => set({ require_liveness: v })}
            />
            <span className="text-sm">บังคับตรวจว่าเป็นคนจริง (กันการยกรูปมาส่อง)</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ความแม่นยำและรูปถ่ายตอนสแกน</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>น้ำหนักสัดส่วนใบหน้า</Label>
            <Input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(form.geometry_weight)}
              onChange={(e) => set({ geometry_weight: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              ให้ระบบดูระยะห่างตา-จมูก-ปาก ประกอบด้วย (0 = ไม่ใช้, แนะนำ 0.25)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>สัดส่วนใบหน้าขั้นต่ำ</Label>
            <Input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={Number(form.geometry_min_score)}
              onChange={(e) => set({ geometry_min_score: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              ต่ำกว่านี้จะไม่ผ่าน แม้หน้าจะคล้ายกัน
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>เพิ่มรูปอัตโนมัติสูงสุด (รูป/คน)</Label>
            <Input
              type="number"
              step={1}
              min={0}
              value={Number(form.auto_enroll_max_faces)}
              onChange={(e) => set({ auto_enroll_max_faces: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>ความมั่นใจขั้นต่ำก่อนเก็บเข้าชุดลงทะเบียน</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={Number(form.auto_enroll_min_confidence)}
              onChange={(e) => set({ auto_enroll_min_confidence: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Switch
              checked={form.save_snapshots}
              onCheckedChange={(v) => set({ save_snapshots: v })}
            />
            <span className="text-sm">เก็บรูปถ่ายทุกครั้งที่สแกน (ดูย้อนหลังในหน้าประวัติ)</span>
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Switch checked={form.auto_enroll} onCheckedChange={(v) => set({ auto_enroll: v })} />
            <span className="text-sm">
              นำรูปที่สแกนผ่านแบบมั่นใจสูงไปเพิ่มเป็นข้อมูลลงทะเบียนอัตโนมัติ
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">สแกนผ่านหน้าเว็บ (ไม่ต้องติดตั้งโปรแกรม)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 sm:col-span-3">
            <Switch
              checked={form.allow_web_scan}
              onCheckedChange={(v) => set({ allow_web_scan: v })}
            />
            <span className="text-sm">
              อนุญาตให้ตู้สแกนใช้หน้าเว็บตรวจใบหน้าได้ เมื่อไม่มีโปรแกรมบนเครื่อง
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>ความคล้ายขั้นต่ำของโหมดเว็บ</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={Number(form.web_match_threshold)}
              onChange={(e) => set({ web_match_threshold: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              ตัวเลขน้อย = เข้มงวดขึ้น (แนะนำ 0.42)
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>เตรียมรูปที่ลงทะเบียนไว้ให้โหมดเว็บ</Label>
            <Button variant="secondary" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
              {prepare.isPending ? "กำลังเตรียมรูป…" : "เตรียมรูปทั้งหมด"}
            </Button>
            <p className="text-xs text-muted-foreground">
              ต้องกดหนึ่งครั้งหลังลงทะเบียนรูปใหม่ เพื่อให้โหมดเว็บรู้จักคนเหล่านั้น
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        บันทึกการตั้งค่า
      </Button>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">เครื่องตู้สแกน</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => addDevice.mutate()}>
            <Plus className="size-4" /> เพิ่มเครื่อง
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            นำรหัสเครื่องไปใส่ในไฟล์ตั้งค่าของโปรแกรมบนเครื่องตู้สแกน
          </p>
          {(devices ?? []).map((d) => (
            <div key={d.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                  defaultValue={d.name}
                  className="max-w-56"
                  onBlur={async (e) => {
                    await supabase.from("devices").update({ name: e.target.value }).eq("id", d.id);
                    qc.invalidateQueries({ queryKey: ["devices"] });
                  }}
                />
                <div className="flex items-center gap-2">
                  <Badge variant={d.is_active ? "default" : "outline"}>
                    {d.is_active ? "ใช้งาน" : "ปิด"}
                  </Badge>
                  <Switch
                    checked={d.is_active}
                    onCheckedChange={async (v) => {
                      await supabase.from("devices").update({ is_active: v }).eq("id", d.id);
                      qc.invalidateQueries({ queryKey: ["devices"] });
                    }}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs">
                  {d.api_key}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(d.api_key);
                    toast.success("คัดลอกรหัสแล้ว");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                เชื่อมต่อล่าสุด:{" "}
                {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("th-TH") : "ยังไม่เคย"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
