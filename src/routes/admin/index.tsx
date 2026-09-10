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
import { ArrowRight, Briefcase, LogIn, LogOut, UserCheck, Users } from "lucide-react";
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
  return new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
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
        supabase.from("student_faces").select("student_id").eq("status", "ready"),
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
    refetchInterval: 15000,
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

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {t("brand.school_name")}
        </p>
        <h1 className="font-display text-2xl font-semibold">ภาพรวมวันนี้</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("th-TH", {
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
