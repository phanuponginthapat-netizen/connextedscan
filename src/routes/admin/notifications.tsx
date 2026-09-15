import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, Mail, MessageCircle, Plus, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sendTestNotification } from "@/lib/system-admin.functions";
import type { Database } from "@/integrations/supabase/types";

type SettingsUpdate = Database["public"]["Tables"]["settings"]["Update"];
type RecipientUpdate = Database["public"]["Tables"]["notification_recipients"]["Update"];

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "แจ้งเตือนอัตโนมัติ | FaceGate" },
      {
        name: "description",
        content: "ตั้งค่าผู้รับแจ้งเตือนทางอีเมลและ LINE สำหรับการขาด สาย ออกก่อนเวลา และสแกนไม่ผ่าน",
      },
      { property: "og:title", content: "แจ้งเตือนอัตโนมัติ | FaceGate" },
      {
        property: "og:description",
        content: "จัดการผู้รับแจ้งเตือนและเหตุการณ์ที่ต้องการให้ระบบแจ้งอัตโนมัติ",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

const EVENTS: { key: string; label: string; hint: string }[] = [
  { key: "absent", label: "ขาด / ยังไม่มา", hint: "ส่งรายชื่อคนที่ยังไม่สแกนเข้า" },
  { key: "late", label: "มาสาย", hint: "ส่งรายชื่อที่สแกนเข้าหลังเวลาสาย" },
  { key: "early_leave", label: "ออกก่อนเวลา", hint: "ส่งรายชื่อที่สแกนออกก่อนเวลาที่กำหนด" },
  { key: "failed_streak", label: "สแกนไม่ผ่านต่อเนื่อง", hint: "เตือนเมื่อมีคนแปลกหน้าพยายามสแกน" },
  { key: "device_offline", label: "ตู้สแกนออฟไลน์", hint: "เตือนเมื่อเครื่องเงียบเกินเวลาที่ตั้ง" },
];

const SETTING_KEYS = [
  { key: "notify_absent", event: "absent" },
  { key: "notify_late", event: "late" },
  { key: "notify_early_leave", event: "early_leave" },
  { key: "notify_failed_streak", event: "failed_streak" },
  { key: "notify_device_offline", event: "device_offline" },
] as const;

function NotificationsPage() {
  const qc = useQueryClient();
  const test = useServerFn(sendTestNotification);
  const [form, setForm] = useState({ name: "", email: "", line_user_id: "" });
  const [events, setEvents] = useState<string[]>(EVENTS.map((e) => e.key));

  const { data: settings } = useQuery({
    queryKey: ["notify-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", true).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: recipients } = useQuery({
    queryKey: ["notification-recipients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_recipients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveSetting = useMutation({
    mutationFn: async (patch: SettingsUpdate) => {
      const { error } = await supabase.from("settings").update(patch).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notify-settings"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addRecipient = useMutation({
    mutationFn: async () => {
      if (!form.email && !form.line_user_id) {
        throw new Error("ต้องกรอกอีเมล หรือ LINE user ID อย่างน้อยหนึ่งช่อง");
      }
      const { error } = await supabase.from("notification_recipients").insert({
        name: form.name || form.email || "ผู้รับแจ้งเตือน",
        email: form.email || null,
        line_user_id: form.line_user_id || null,
        events: events.join(","),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("เพิ่มผู้รับแจ้งเตือนแล้ว");
      setForm({ name: "", email: "", line_user_id: "" });
      qc.invalidateQueries({ queryKey: ["notification-recipients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRecipient = useMutation({
    mutationFn: async (args: { id: string; patch: RecipientUpdate }) => {
      const { error } = await supabase
        .from("notification_recipients")
        .update(args.patch)
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-recipients"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRecipient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบผู้รับแจ้งเตือนแล้ว");
      qc.invalidateQueries({ queryKey: ["notification-recipients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () =>
      test({ data: { message: "นี่คือข้อความทดสอบจากระบบสแกนใบหน้า FaceGate" } }),
    onSuccess: (r) => {
      toast.success(`ส่งทดสอบแล้ว — LINE ${r.line} ราย / อีเมล ${r.email} ราย`);
      if (r.blocked.length > 0) toast.warning(r.blocked[0]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="animate-rise space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">แจ้งเตือนอัตโนมัติ</h1>
          <p className="text-sm text-muted-foreground">
            ส่งแจ้งเตือนทางอีเมลและ LINE เมื่อมีคนขาด มาสาย ออกก่อนเวลา สแกนไม่ผ่าน หรือตู้สแกนออฟไลน์
          </p>
        </div>
        <Button variant="secondary" onClick={() => sendTest.mutate()} disabled={sendTest.isPending}>
          <Send className="size-4" /> ส่งข้อความทดสอบ
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4" /> ช่องทางและเหตุการณ์
            </CardTitle>
            <CardDescription>เลือกช่องทางที่จะส่ง และเหตุการณ์ที่ต้องการให้แจ้ง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Mail className="size-4" />
                <div>
                  <p className="font-medium">ส่งทางอีเมล</p>
                  <p className="text-xs text-muted-foreground">
                    ต้องตั้งค่าโดเมนอีเมลของโรงเรียนก่อนจึงจะส่งได้จริง
                  </p>
                </div>
              </div>
              <Switch
                checked={settings?.notify_email_enabled ?? false}
                onCheckedChange={(v) => saveSetting.mutate({ notify_email_enabled: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-4" />
                <div>
                  <p className="font-medium">ส่งทาง LINE</p>
                  <p className="text-xs text-muted-foreground">
                    ต้องมี LINE Official Account และใส่ token ของบัญชีก่อนใช้งาน
                  </p>
                </div>
              </div>
              <Switch
                checked={settings?.notify_line_enabled ?? false}
                onCheckedChange={(v) => saveSetting.mutate({ notify_line_enabled: v })}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">ส่งรายงานสรุปอัตโนมัติ</p>
                  <p className="text-xs text-muted-foreground">
                    สรุปมาแล้ว / มาสาย / ขาด ย้อนหลัง 7 วัน ส่งให้ผู้รับแจ้งเตือนทุกคน
                  </p>
                </div>
                <Switch
                  checked={settings?.weekly_report_enabled ?? false}
                  onCheckedChange={(v) => saveSetting.mutate({ weekly_report_enabled: v })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="report-weekday">ส่งวัน</Label>
                  <select
                    id="report-weekday"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={String(settings?.weekly_report_weekday ?? 5)}
                    onChange={(e) =>
                      saveSetting.mutate({ weekly_report_weekday: Number(e.target.value) })
                    }
                  >
                    {["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"].map(
                      (label, index) => (
                        <option key={label} value={String(index)}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-time">เวลา</Label>
                  <Input
                    id="report-time"
                    type="time"
                    defaultValue={String(settings?.weekly_report_time ?? "16:30").slice(0, 5)}
                    onBlur={(e) =>
                      saveSetting.mutate({ weekly_report_time: `${e.target.value}:00` })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              {SETTING_KEYS.map(({ key, event }) => {
                const meta = EVENTS.find((e) => e.key === event);
                return (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{meta?.label}</p>
                      <p className="text-xs text-muted-foreground">{meta?.hint}</p>
                    </div>
                    <Switch
                      checked={Boolean(settings?.[key])}
                      onCheckedChange={(v) => saveSetting.mutate({ [key]: v })}
                    />
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="offline">ถือว่าตู้สแกนออฟไลน์เมื่อเงียบเกิน (นาที)</Label>
              <Input
                id="offline"
                type="number"
                min={2}
                defaultValue={settings?.device_offline_minutes ?? 15}
                onBlur={(e) =>
                  saveSetting.mutate({
                    device_offline_minutes: Math.max(2, Number(e.target.value) || 15),
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">ล้างข้อมูลเก่าอัตโนมัติ</p>
                <p className="text-xs text-muted-foreground">
                  ลบรูปสแกนและประวัติที่เกินอายุตามที่ตั้งไว้ในหน้าตั้งค่า
                </p>
              </div>
              <Switch
                checked={settings?.cleanup_enabled ?? true}
                onCheckedChange={(v) => saveSetting.mutate({ cleanup_enabled: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" /> เพิ่มผู้รับแจ้งเตือน
            </CardTitle>
            <CardDescription>กรอกอีเมล หรือ LINE user ID อย่างน้อยหนึ่งช่อง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rname">ชื่อผู้รับ</Label>
              <Input
                id="rname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ครูฝ่ายปกครอง"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remail">อีเมล</Label>
              <Input
                id="remail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rline">LINE user ID</Label>
              <Input
                id="rline"
                value={form.line_user_id}
                onChange={(e) => setForm({ ...form, line_user_id: e.target.value })}
                placeholder="Uxxxxxxxxxxxxxxxx"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map((e) => {
                const active = events.includes(e.key);
                return (
                  <Badge
                    key={e.key}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() =>
                      setEvents(
                        active ? events.filter((x) => x !== e.key) : [...events, e.key],
                      )
                    }
                  >
                    {e.label}
                  </Badge>
                );
              })}
            </div>
            <Button
              className="w-full"
              onClick={() => addRecipient.mutate()}
              disabled={addRecipient.isPending}
            >
              <Plus className="size-4" /> เพิ่มผู้รับ
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ผู้รับแจ้งเตือนทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>อีเมล</TableHead>
                  <TableHead>LINE</TableHead>
                  <TableHead>เหตุการณ์</TableHead>
                  <TableHead>ใช้งาน</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recipients ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีผู้รับแจ้งเตือน
                    </TableCell>
                  </TableRow>
                )}
                {(recipients ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.line_user_id ? "เชื่อมแล้ว" : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.events ?? "")
                          .split(",")
                          .filter(Boolean)
                          .map((event) => (
                            <Badge key={event} variant="outline" className="text-xs">
                              {EVENTS.find((e) => e.key === event.trim())?.label ?? event}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) =>
                          updateRecipient.mutate({ id: r.id, patch: { is_active: v } })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRecipient.mutate(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
