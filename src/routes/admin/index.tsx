import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowRight, Briefcase, LogIn, LogOut, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { personGroupLabel } from "@/components/people/people";
import { supabase } from "@/integrations/supabase/client";
import { useCms } from "@/lib/cms-client";
import { StatCard } from "@/components/reports/report-ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "ภาพรวมวันนี้ | FaceGate" },
      { name: "description", content: "สรุปการสแกนเข้า-ออกของนักเรียนประจำวัน" },
      { property: "og:title", content: "ภาพรวมวันนี้ | FaceGate" },
      { property: "og:description", content: "สรุปการสแกนเข้า-ออกของนักเรียนประจำวัน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function startOfTodayISO() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function timeText(value: string) {
  return new Date(value).toLocaleTimeString("th-TH-u-ca-buddhist-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function Dashboard() {
  const { t } = useCms();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = startOfTodayISO();
      const [students, staff, faces, logs] = await Promise.all([
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("person_type", "student"),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("person_type", "staff"),
        supabase
          .from("student_faces")
          .select("student_id")
          .eq("status", "ready")
          .limit(5000),
        supabase
          .from("attendance_logs")
          .select(
            "id, direction, status, confidence, scanned_at, device_name, students(full_name, student_code, class_room, department, person_type)",
          )
          .gte("scanned_at", today)
          .neq("status", "duplicate")
          .order("scanned_at", { ascending: false })
          .limit(200),
      ]);
      const enrolled = new Set((faces.data ?? []).map((f) => f.student_id)).size;
      const rows = logs.data ?? [];
      return {
        totalStudents: students.count ?? 0,
        totalStaff: staff.count ?? 0,
        enrolled,
        checkIn: rows.filter((r) => r.direction === "in" && r.status === "ok").length,
        checkOut: rows.filter((r) => r.direction === "out" && r.status === "ok").length,
        rows,
      };
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 15000,
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const totalPeople = (data?.totalStudents ?? 0) + (data?.totalStaff ?? 0);
  const enrolledPct = totalPeople ? Math.round(((data?.enrolled ?? 0) / totalPeople) * 100) : 0;
  const presentNow = useMemo(() => {
    const last = new Map<string, string>();
    for (const r of [...rows].reverse()) {
      const code = r.students?.student_code;
      if (code && r.status === "ok") last.set(code, r.direction);
    }
    return [...last.values()].filter((d) => d === "in").length;
  }, [rows]);

  const hourly = useMemo(() => {
    const buckets = new Map<number, { hour: string; count: number }>();
    for (let h = 6; h <= 19; h++) buckets.set(h, { hour: `${String(h).padStart(2, "0")}:00`, count: 0 });
    for (const r of rows) {
      if (r.status !== "ok") continue;
      const h = new Date(r.scanned_at).getHours();
      const b = buckets.get(h);
      if (b) b.count += 1;
    }
    return [...buckets.values()];
  }, [rows]);

  const recent = rows.slice(0, 12);

  // Who has not arrived yet today, and any warning raised at the gate.
  const { data: watch, refetch: refetchWatch } = useQuery({
    queryKey: ["dashboard-watch"],
    queryFn: async () => {
      const today = startOfTodayISO();
      const [people, arrivals, alerts, settings] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, student_code, class_room, department, person_type")
          .eq("is_active", true)
          .neq("person_type", "visitor")
          .limit(3000),
        supabase
          .from("attendance_logs")
          .select("student_id")
          .eq("direction", "in")
          .eq("status", "ok")
          .gte("scanned_at", today)
          .limit(5000),
        supabase
          .from("security_alerts")
          .select("id, kind, message, device_name, attempts, snapshot_path, created_at")
          .is("acknowledged_at", null)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("settings").select("absent_check_time").eq("id", true).maybeSingle(),
      ]);
      const arrived = new Set((arrivals.data ?? []).map((a) => a.student_id));
      const alertRows = alerts.data ?? [];
      const signedSnapshots = await Promise.all(
        alertRows.map(async (alert) => {
          if (!alert.snapshot_path) return null;
          const { data } = await supabase.storage.from("faces").createSignedUrl(alert.snapshot_path, 3600);
          return data?.signedUrl ?? null;
        }),
      );
      return {
        absent: (people.data ?? []).filter((p) => !arrived.has(p.id)),
        alerts: alertRows.map((alert, index) => ({ ...alert, snapshotUrl: signedSnapshots[index] })),
        absentCheckTime: settings.data?.absent_check_time ?? "09:00:00",
      };
    },
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });

  const absent = watch?.absent ?? [];
  const alerts = watch?.alerts ?? [];

  const resolveAlert = async (id: string) => {
    await supabase
      .from("security_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    void refetchWatch();
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("brand.school_name")}
        </p>
        <h1 className="font-display text-2xl font-semibold">ภาพรวมวันนี้</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("th-TH-u-ca-buddhist-nu-latn", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          • อัปเดตอัตโนมัติทุก 15 วินาที
        </p>
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="นักเรียนทั้งหมด" value={data?.totalStudents ?? 0} icon={Users} />
        <StatCard label="บุคลากรทั้งหมด" value={data?.totalStaff ?? 0} icon={Briefcase} />
        <StatCard
          label="ลงทะเบียนใบหน้าแล้ว"
          value={data?.enrolled ?? 0}
          hint={`${enrolledPct}% ของทั้งหมด`}
          icon={UserCheck}
        />
        <StatCard label="เข้าวันนี้" value={data?.checkIn ?? 0} icon={LogIn} />
        <StatCard
          label="ออกวันนี้"
          value={data?.checkOut ?? 0}
          hint={`อยู่ในพื้นที่ ${presentNow} คน`}
          icon={LogOut}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-amber-500" /> แจ้งเตือนความปลอดภัย
              </CardTitle>
              <CardDescription>
                เกิดเมื่อมีคนสแกนไม่ผ่านติดต่อกันหลายครั้งที่จุดประตู
              </CardDescription>
            </div>
            <Badge variant={alerts.length ? "destructive" : "secondary"}>{alerts.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-emerald-500" /> ยังไม่มีเหตุการณ์ผิดปกติวันนี้
              </p>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
                >
                  <div className="flex min-w-0 gap-3">
                    {a.snapshotUrl ? (
                      <img
                        src={a.snapshotUrl}
                        alt="ภาพบุคคลที่จุดสแกน"
                        className="size-16 shrink-0 rounded-md border object-cover"
                      />
                    ) : null}
                    <div className="min-w-0">
                    <p className="text-sm font-medium text-destructive">{a.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.device_name ?? "ไม่ทราบจุดสแกน"} • {timeText(a.created_at)} • {a.attempts} ครั้ง
                    </p>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void resolveAlert(a.id)}>
                    รับทราบ
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserX className="size-4 text-primary" /> ยังไม่มาวันนี้
              </CardTitle>
              <CardDescription>
                รายชื่อคนที่ยังไม่มีการสแกนเข้า (ตรวจรอบ {(watch?.absentCheckTime ?? "09:00:00").slice(0, 5)} น.)
              </CardDescription>
            </div>
            <Badge variant="secondary">{absent.length} คน</Badge>
          </CardHeader>
          <CardContent>
            {absent.length === 0 ? (
              <p className="text-sm text-muted-foreground">มาครบทุกคนแล้ว</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {absent.slice(0, 60).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <span className="truncate">{p.full_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.person_type === "staff"
                        ? (p.department ?? "บุคลากร")
                        : (p.class_room ?? "-")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">การสแกนตามช่วงเวลา</CardTitle>
            <CardDescription>จำนวนการสแกนสำเร็จในแต่ละชั่วโมงของวันนี้</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourly}>
                <defs>
                  <linearGradient id="scanArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <ReTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="ครั้ง"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#scanArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ความพร้อมของระบบ</CardTitle>
            <CardDescription>สัดส่วนผู้ที่ลงทะเบียนใบหน้าแล้ว</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">ลงทะเบียนใบหน้า</span>
                <span className="font-semibold tabular-nums">{enrolledPct}%</span>
              </div>
              <Progress value={enrolledPct} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {data?.enrolled ?? 0} จาก {totalPeople} คน
              </p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="text-muted-foreground">อยู่ในพื้นที่ขณะนี้</p>
              <p className="text-2xl font-semibold tabular-nums">{presentNow}</p>
            </div>
            <Link
              to="/admin/attendance"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              เปิดรายงานฉบับเต็ม <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">การสแกนล่าสุด</CardTitle>
            <CardDescription>12 รายการล่าสุดของวันนี้</CardDescription>
          </div>
          <Link
            to="/admin/attendance"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            ดูทั้งหมด <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>เวลา</TableHead>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ห้อง/ฝ่าย</TableHead>
                  <TableHead className="text-center">เข้า/ออก</TableHead>
                  <TableHead>เครื่อง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      ยังไม่มีการสแกนวันนี้
                    </TableCell>
                  </TableRow>
                )}
                {recent.map((row) => (
                  <TableRow key={row.id} className="even:bg-muted/20">
                    <TableCell className="tabular-nums">{timeText(row.scanned_at)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.students?.student_code ?? "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.students?.full_name ?? "ไม่ทราบชื่อ"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.students ? personGroupLabel(row.students) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.direction === "in" ? "default" : "secondary"}>
                        {row.direction === "in" ? "เข้า" : "ออก"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.device_name ?? "-"}
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
