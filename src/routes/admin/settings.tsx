import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { backupNow as backupNowFn } from "@/lib/backup.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  Copy,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutTemplate,
  MonitorSmartphone,
  Phone,
  Plus,
  ScanFace,
  Settings2,
  Volume2,
  CalendarDays,
  Megaphone,
  ShieldCheck,
  Monitor,
  DoorOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimeInput24 } from "@/components/ui/time-input-24";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CMS_GROUPS } from "@/lib/cms";
import { CmsSection } from "@/components/admin/CmsSection";
import { useCms } from "@/lib/cms-client";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "ศูนย์ตั้งค่าระบบ | FaceGate" },
      {
        name: "description",
        content: "ตั้งค่าเวลาเข้า-ออก ความแม่นยำ เครื่องตู้สแกน แบรนด์ และข้อความทุกจุดในที่เดียว",
      },
      { property: "og:title", content: "ศูนย์ตั้งค่าระบบ | FaceGate" },
      {
        property: "og:description",
        content: "ตั้งค่าระบบและจัดการเนื้อหาทั้งหมดจากหน้าเดียว",
      },
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
  work_days: string;
  block_non_work_days: boolean;
  late_grace_minutes: number;
  early_leave_before: string;
  voice_enabled: boolean;
  voice_rate: number;
  voice_volume: number;
  voice_duplicate_template: string;
  voice_late_suffix: string;
  voice_denied_text: string;
  voice_out_of_window_text: string;
  kiosk_show_recent: boolean;
  kiosk_recent_limit: number;
  kiosk_mirror: boolean;
  kiosk_show_clock: boolean;
  kiosk_show_confidence: boolean;
  kiosk_news_enabled: boolean;
  kiosk_news_text: string;
  door_enabled: boolean;
  door_open_seconds: number;
  door_deny_alarm: boolean;
  door_free_enabled: boolean;
  door_free_start: string;
  door_free_end: string;
  failed_alert_threshold: number;
  absent_check_time: string;
  visitor_mode: boolean;
  second_camera_index: number;
  second_camera_direction: string;
  auto_update_enabled: boolean;
  backup_enabled: boolean;
  backup_weekday: number;
  backup_last_at: string | null;
  min_face_coverage: number;
  detector_min_score: number;
  log_unknown_attempts: boolean;
  snapshot_retention_days: number;
  log_retention_days: number;
  default_report_days: number;
};

type SectionId =
  | "time"
  | "calendar"
  | "kiosk"
  | "door"
  | "privacy"
  | "scan"
  | "accuracy"
  | "devices"
  | `cms:${string}`;

const cmsIcons: Record<string, typeof ImageIcon> = {
  brand: ImageIcon,
  home: LayoutTemplate,
  kiosk: ScanFace,
  system: Settings2,
  contact: Phone,
  report: FileText,
};

function SettingsPage() {
  const qc = useQueryClient();
  const [backingUp, setBackingUp] = useState(false);
  const backupNow = useServerFn(backupNowFn);
  const [form, setForm] = useState<SettingsRow | null>(null);
  const [section, setSection] = useState<SectionId>("time");
  const { t } = useCms();

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
        .update({
          ...form,
          school_name: t("brand.school_name"),
          updated_at: new Date().toISOString(),
        })
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

  const systemNav: Array<{ id: SectionId; title: string; hint: string; icon: typeof Clock }> = [
    { id: "time", title: "ช่วงเวลาเข้า-ออก", hint: "กำหนดเวลารับสแกนและเวลาสาย", icon: Clock },
    {
      id: "calendar",
      title: "วันทำการและการมาสาย",
      hint: "วันเปิดรับสแกน ผ่อนผันสาย และออกก่อนเวลา",
      icon: CalendarDays,
    },
    { id: "scan", title: "การสแกนและเสียง", hint: "กันสแกนซ้ำ หน่วงเวลา และเสียงพูด", icon: Volume2 },
    { id: "accuracy", title: "ความแม่นยำและรูปถ่าย", hint: "ค่าความเหมือนและการเก็บรูป", icon: Gauge },
    
    {
      id: "kiosk",
      title: "หน้าจอตู้สแกน",
      hint: "รายการล่าสุด กระจกสะท้อน และข้อมูลที่แสดง",
      icon: Monitor,
    },
    {
      id: "door",
      title: "ประตูอัตโนมัติ (micro:bit)",
      hint: "เปิดประตูเมื่อสแกนผ่าน และเวลาเปิดค้าง",
      icon: DoorOpen,
    },
    {
      id: "privacy",
      title: "ข้อมูลและความเป็นส่วนตัว",
      hint: "อายุการเก็บรูปและประวัติ รายงานเริ่มต้น",
      icon: ShieldCheck,
    },
    { id: "devices", title: "เครื่องตู้สแกน", hint: "รหัสเครื่องและสถานะเชื่อมต่อ", icon: MonitorSmartphone },
  ];

  const activeCms = section.startsWith("cms:")
    ? CMS_GROUPS.find((g) => g.id === section.slice(4))
    : undefined;

  const set = (patch: Partial<SettingsRow>) => form && setForm({ ...form, ...patch });

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

  const activeTitle =
    activeCms?.title ?? systemNav.find((s) => s.id === section)?.title ?? "ตั้งค่าระบบ";
  const activeHint =
    activeCms?.description ?? systemNav.find((s) => s.id === section)?.hint ?? "";

  const SaveBar = (
    <div className="mt-7 flex flex-wrap items-center gap-2 border-t pt-5">
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        บันทึกการตั้งค่า
      </Button>
      <p className="text-xs text-muted-foreground">
        การตั้งค่ามีผลกับทั้งหน้าเว็บและเครื่องตู้สแกนหลังบันทึก
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="border-b pb-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          ศูนย์ควบคุมระบบ
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          ตั้งค่าระบบและเนื้อหา
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ปรับกติกาการสแกน เครื่องตู้สแกน แบรนด์ และข้อความทุกจุดได้จากหน้าเดียว
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              การทำงานของระบบ
            </p>
            {systemNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  section === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <item.icon className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block font-medium">{item.title}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      section === item.id ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {item.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              เนื้อหาและแบรนด์
            </p>
            {CMS_GROUPS.map((g) => {
              const Icon = cmsIcons[g.id] ?? Settings2;
              const id: SectionId = `cms:${g.id}`;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    section === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span className="font-medium">{g.title}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <Card className="min-w-0">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">{activeTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">{activeHint}</p>
          </CardHeader>
          <CardContent className="pt-6">
            {!form && !activeCms ? (
              <p className="text-muted-foreground">กำลังโหลด…</p>
            ) : activeCms ? (
              <CmsSection group={activeCms} />
            ) : !form ? null : section === "time" ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {timeFields.map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label}</Label>
                      <TimeInput24
                        value={String(form[key]).slice(0, 5)}
                        onChange={(v) => set({ [key]: `${v}:00` } as Partial<SettingsRow>)}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  การสแกนนอกช่วงเวลาที่กำหนดจะไม่ถูกบันทึก และตู้สแกนจะแจ้งว่ายังไม่ถึงเวลาสแกน
                </p>
                {SaveBar}
              </div>
            ) : section === "scan" ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {numFields.map(([key, label, hint, step]) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label}</Label>
                      <Input
                        type="number"
                        step={step}
                        value={Number(form[key])}
                        onChange={(e) =>
                          set({ [key]: Number(e.target.value) } as Partial<SettingsRow>)
                        }
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
                    <Label>ชื่อโรงเรียน/หน่วยงาน</Label>
                    <Input value={t("brand.school_name")} readOnly disabled />
                    <button
                      type="button"
                      className="text-xs text-primary underline underline-offset-2"
                      onClick={() => setSection("cms:brand")}
                    >
                      แก้ไขที่หัวข้อ “แบรนด์และสีของระบบ” (ใช้ร่วมกันทั้งระบบ)
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <Label>ข้อความเสียงเมื่อสแกนซ้ำ</Label>
                    <Input
                      value={form.voice_duplicate_template}
                      onChange={(e) => set({ voice_duplicate_template: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ข้อความต่อท้ายเมื่อมาสาย</Label>
                    <Input
                      value={form.voice_late_suffix}
                      onChange={(e) => set({ voice_late_suffix: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ข้อความเมื่อไม่พบข้อมูล</Label>
                    <Input
                      value={form.voice_denied_text}
                      onChange={(e) => set({ voice_denied_text: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ข้อความเมื่อสแกนนอกเวลา</Label>
                    <Input
                      value={form.voice_out_of_window_text}
                      onChange={(e) => set({ voice_out_of_window_text: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ความเร็วเสียงพูด</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0.5}
                      max={2}
                      value={Number(form.voice_rate)}
                      onChange={(e) => set({ voice_rate: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ระดับเสียง (0–1)</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      max={1}
                      value={Number(form.voice_volume)}
                      onChange={(e) => set({ voice_volume: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-3">
                    <Switch
                      checked={form.voice_enabled}
                      onCheckedChange={(v) => set({ voice_enabled: v })}
                    />
                    <span className="text-sm">เปิดเสียงพูดขานชื่อเมื่อสแกนสำเร็จ</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-3">
                    <Switch
                      checked={form.require_liveness}
                      onCheckedChange={(v) => set({ require_liveness: v })}
                    />
                    <span className="text-sm">บังคับตรวจว่าเป็นคนจริง (กันการยกรูปมาส่อง)</span>
                  </div>
                </div>
                {SaveBar}
              </div>
            ) : section === "calendar" ? (
              <div>
                <div className="space-y-4">
                  <div>
                    <Label>วันเปิดรับการสแกน</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => {
                        const days = (form.work_days ?? "").split(",").filter(Boolean);
                        const on = days.includes(String(i));
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              set({
                                work_days: (on
                                  ? days.filter((v) => v !== String(i))
                                  : [...days, String(i)]
                                )
                                  .map(Number)
                                  .sort((a, b) => a - b)
                                  .join(","),
                              })
                            }
                            className={cn(
                              "size-11 rounded-full border text-sm font-medium transition-colors",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch
                      checked={form.block_non_work_days}
                      onCheckedChange={(v) => set({ block_non_work_days: v })}
                    />
                    <span className="text-sm">ปิดรับการสแกนในวันที่ไม่ใช่วันทำการ</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>ผ่อนผันสาย (นาที)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={Number(form.late_grace_minutes)}
                        onChange={(e) => set({ late_grace_minutes: Number(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">
                        เลยเวลาสายได้ไม่เกินกี่นาที ก่อนจะถือว่ามาสายจริง
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>ออกก่อนเวลา ถ้าสแกนออกก่อน</Label>
                      <TimeInput24
                        value={String(form.early_leave_before).slice(0, 5)}
                        onChange={(v) => set({ early_leave_before: `${v}:00` })}
                      />
                    </div>
                  </div>
                </div>
                {SaveBar}
              </div>
            ) : section === "kiosk" ? (
              <div>
                <div className="space-y-3">
                  {([
                    ["kiosk_show_recent", "แสดงรายการสแกนล่าสุดข้างหน้าจอกล้อง"],
                    ["kiosk_mirror", "แสดงภาพกล้องแบบกระจกเงา"],
                    ["kiosk_show_clock", "แสดงนาฬิกาบนหน้าจอตู้สแกน"],
                    ["kiosk_show_confidence", "แสดงค่าความมั่นใจของการจับคู่ใบหน้า"],
                  ] as Array<[keyof SettingsRow, string]>).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-3 rounded-lg border p-3">
                      <Switch
                        checked={Boolean(form[key])}
                        onCheckedChange={(v) => set({ [key]: v } as Partial<SettingsRow>)}
                      />
                      <span className="text-sm">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch
                      checked={form.visitor_mode}
                      onCheckedChange={(v) => set({ visitor_mode: v })}
                    />
                    <span className="text-sm">
                      โหมดงานกิจกรรม/ผู้มาเยือน — บันทึกคนนอกที่มาติดต่อไว้ดูย้อนหลังได้
                    </span>
                  </div>
                  <div className="grid max-w-md gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>กล้องตัวที่สอง (หมายเลข)</Label>
                      <Input
                        type="number"
                        min={-1}
                        value={Number(form.second_camera_index)}
                        onChange={(e) => set({ second_camera_index: Number(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">ใส่ -1 หากใช้กล้องตัวเดียว</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>กล้องตัวที่สองใช้บันทึก</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={String(form.second_camera_direction)}
                        onChange={(e) => set({ second_camera_direction: e.target.value })}
                      >
                        <option value="out">ขาออก</option>
                        <option value="in">ขาเข้า</option>
                        <option value="auto">ตามเวลาที่ตั้งไว้</option>
                      </select>
                    </div>
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <Label>จำนวนรายการล่าสุดที่แสดง</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={Number(form.kiosk_recent_limit)}
                      onChange={(e) => set({ kiosk_recent_limit: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={form.kiosk_news_enabled}
                        onCheckedChange={(v) => set({ kiosk_news_enabled: v })}
                      />
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Megaphone className="size-4 text-primary" />
                        แถบข้อความประชาสัมพันธ์วิ่งไหลด้านล่างจอตู้สแกน
                      </span>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="เช่น ประกาศ: พรุ่งนี้ปิดเรียนชดเชยวันหยุด ขอให้นักเรียนทุกคนสแกนเข้าก่อน 07:45 น."
                      value={form.kiosk_news_text}
                      onChange={(e) => set({ kiosk_news_text: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      ข้อความนี้จะไหลวนด้านล่างหน้าจอตู้สแกนทุกเครื่อง มีผลทันทีหลังบันทึก
                    </p>
                  </div>
                </div>
                {SaveBar}
              </div>
            ) : section === "door" ? (
              <div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch
                      checked={form.door_enabled}
                      onCheckedChange={(v) => set({ door_enabled: v })}
                    />
                    <span className="text-sm">
                      เปิดประตูอัตโนมัติเมื่อสแกนผ่าน (ต่อ micro:bit เข้ากับเครื่องตู้สแกน)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch
                      checked={form.door_deny_alarm}
                      onCheckedChange={(v) => set({ door_deny_alarm: v })}
                    />
                    <span className="text-sm">
                      ส่งสัญญาณเตือนที่ micro:bit เมื่อเป็นบุคคลภายนอกหรือสแกนไม่ผ่าน
                    </span>
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <Label>เวลาเปิดประตูค้าง (วินาที)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={Number(form.door_open_seconds)}
                      onChange={(e) => set({ door_open_seconds: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      ครบเวลาแล้วประตูจะล็อกกลับเองอัตโนมัติ
                    </p>
                  </div>
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={form.door_free_enabled}
                        onCheckedChange={(v) => set({ door_free_enabled: v })}
                      />
                      <span className="text-sm">
                        เปิดประตูค้างในช่วงเวลาเข้าแถว (คนเข้าออกได้โดยไม่ต้องรอสแกนทีละคน)
                      </span>
                    </div>
                    <div className="grid max-w-md gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>เริ่มเปิดค้าง</Label>
                        <TimeInput24
                          value={String(form.door_free_start).slice(0, 5)}
                          onChange={(v) => set({ door_free_start: `${v}:00` })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>หยุดเปิดค้าง</Label>
                        <TimeInput24
                          value={String(form.door_free_end).slice(0, 5)}
                          onChange={(v) => set({ door_free_end: `${v}:00` })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ระบบยังบันทึกเวลาให้ตามปกติ เพียงแต่ไม่ล็อกประตูระหว่างช่วงนี้
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    วิธีต่อสายและโค้ดสำหรับ micro:bit ดูได้ที่เมนู “ประตูอัจฉริยะ”
                  </p>
                </div>
                {SaveBar}
              </div>
            ) : section === "privacy" ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>เก็บรูปตอนสแกน (วัน)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={Number(form.snapshot_retention_days)}
                      onChange={(e) => set({ snapshot_retention_days: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">ครบกำหนดแล้วรูปจะถูกลบทิ้ง</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>เก็บประวัติเข้า-ออก (วัน)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={Number(form.log_retention_days)}
                      onChange={(e) => set({ log_retention_days: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ช่วงวันเริ่มต้นของรายงาน</Label>
                    <Input
                      type="number"
                      min={1}
                      value={Number(form.default_report_days)}
                      onChange={(e) => set({ default_report_days: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-3">
                    <Switch
                      checked={form.log_unknown_attempts}
                      onCheckedChange={(v) => set({ log_unknown_attempts: v })}
                    />
                    <span className="text-sm">บันทึกความพยายามสแกนของคนที่ไม่ได้ลงทะเบียน</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label>แจ้งเตือนเมื่อสแกนไม่ผ่านติดกัน (ครั้ง)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={Number(form.failed_alert_threshold)}
                      onChange={(e) => set({ failed_alert_threshold: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      ครบจำนวนนี้จะขึ้นเตือนในหน้าภาพรวมทันที
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>เวลาตรวจรายชื่อคนยังไม่มา</Label>
                    <TimeInput24
                      value={String(form.absent_check_time).slice(0, 5)}
                      onChange={(v) => set({ absent_check_time: `${v}:00` })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>วันสำรองข้อมูลประจำสัปดาห์</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={Number(form.backup_weekday)}
                      onChange={(e) => set({ backup_weekday: Number(e.target.value) })}
                    >
                      {["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"].map(
                        (d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch
                      checked={form.backup_enabled}
                      onCheckedChange={(v) => set({ backup_enabled: v })}
                    />
                    <span className="text-sm">สำรองข้อมูลอัตโนมัติทุกสัปดาห์</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <Switch
                      checked={form.auto_update_enabled}
                      onCheckedChange={(v) => set({ auto_update_enabled: v })}
                    />
                    <span className="text-sm">ให้โปรแกรมตู้สแกนอัปเดตตัวเองอัตโนมัติ</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:col-span-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={backingUp}
                      onClick={async () => {
                        setBackingUp(true);
                        try {
                          const res = await backupNow();
                          toast.success(
                            `สำรองข้อมูลแล้ว (${res.counts.students} คน, ${res.counts.attendance_logs} รายการ)`,
                          );
                          if (res.url) window.open(res.url, "_blank");
                        } catch {
                          toast.error("สำรองข้อมูลไม่สำเร็จ");
                        }
                        setBackingUp(false);
                      }}
                    >
                      สำรองข้อมูลเดี๋ยวนี้
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      สำรองครั้งล่าสุด:{" "}
                      {form.backup_last_at
                        ? new Date(form.backup_last_at).toLocaleString("th-TH")
                        : "ยังไม่เคยสำรอง"}
                    </span>
                  </div>
                </div>
                {SaveBar}
              </div>
            ) : section === "accuracy" ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
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
                  <div className="space-y-1.5">
                    <Label>ขนาดใบหน้าขั้นต่ำในเฟรม</Label>
                    <Input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={Number(form.min_face_coverage)}
                      onChange={(e) => set({ min_face_coverage: Number(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground">
                      กันการสแกนจากระยะไกลเกินไป (แนะนำ 0.10)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>คะแนนการตรวจพบใบหน้าขั้นต่ำ</Label>
                    <Input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={Number(form.detector_min_score)}
                      onChange={(e) => set({ detector_min_score: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-3">
                    <Switch
                      checked={form.save_snapshots}
                      onCheckedChange={(v) => set({ save_snapshots: v })}
                    />
                    <span className="text-sm">เก็บรูปถ่ายทุกครั้งที่สแกน (ดูย้อนหลังในหน้าประวัติ)</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-3">
                    <Switch
                      checked={form.auto_enroll}
                      onCheckedChange={(v) => set({ auto_enroll: v })}
                    />
                    <span className="text-sm">
                      นำรูปที่สแกนผ่านแบบมั่นใจสูงไปเพิ่มเป็นข้อมูลลงทะเบียนอัตโนมัติ
                    </span>
                  </div>
                </div>
                {SaveBar}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    นำรหัสเครื่องไปใส่ในไฟล์ตั้งค่าของโปรแกรมบนเครื่องตู้สแกน
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => addDevice.mutate()}>
                    <Plus className="size-4" /> เพิ่มเครื่อง
                  </Button>
                </div>
                {(devices ?? []).map((d) => (
                  <div key={d.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Input
                        defaultValue={d.name}
                        className="max-w-56"
                        onBlur={async (e) => {
                          await supabase
                            .from("devices")
                            .update({ name: e.target.value })
                            .eq("id", d.id);
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
                      {d.last_seen_at
                        ? new Date(d.last_seen_at).toLocaleString("th-TH", { hour12: false })
                        : "ยังไม่เคย"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
