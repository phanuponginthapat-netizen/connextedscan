import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Briefcase, LogIn, LogOut, UserCheck, Users } from "lucide-react";
import { personGroupLabel } from "@/components/people/people";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

function Dashboard() {
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
            "id, direction, status, confidence, scanned_at, students(full_name, class_room, department, person_type)",
          )
          .gte("scanned_at", today)
          .order("scanned_at", { ascending: false })
          .limit(30),
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

  const stats = [
    { label: "นักเรียนทั้งหมด", value: data?.totalStudents ?? 0, icon: Users },
    { label: "บุคลากรทั้งหมด", value: data?.totalStaff ?? 0, icon: Briefcase },
    { label: "ลงทะเบียนใบหน้าแล้ว", value: data?.enrolled ?? 0, icon: UserCheck },
    { label: "เข้าวันนี้", value: data?.checkIn ?? 0, icon: LogIn },
    { label: "ออกวันนี้", value: data?.checkOut ?? 0, icon: LogOut },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ภาพรวมวันนี้</h1>
        <p className="text-sm text-muted-foreground">อัปเดตอัตโนมัติทุก 15 วินาที</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-xl bg-secondary p-3">
                <s.icon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">การสแกนล่าสุด</CardTitle>
          <Link
            to="/admin/attendance"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            ดูทั้งหมด <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.rows ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีการสแกนวันนี้</p>
          )}
          {(data?.rows ?? []).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-lg border px-4 py-2.5"
            >
              <div>
                <p className="font-medium">{row.students?.full_name ?? "ไม่ทราบชื่อ"}</p>
                <p className="text-xs text-muted-foreground">
                  {row.students ? personGroupLabel(row.students) : "-"} •{" "}
                  {new Date(row.scanned_at).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.status === "duplicate" && <Badge variant="outline">สแกนซ้ำ</Badge>}
                <Badge variant={row.direction === "in" ? "default" : "secondary"}>
                  {row.direction === "in" ? "เข้า" : "ออก"}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
