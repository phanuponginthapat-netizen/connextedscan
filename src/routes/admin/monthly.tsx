import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Download, Printer, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCms } from "@/lib/cms-client";
import { StatCard } from "@/components/reports/report-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { parseWorkDays } from "@/lib/attendance-rules";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/monthly")({
  head: () => ({
    meta: [
      { title: "รายงานรายบุคคล | FaceGate" },
      {
        name: "description",
        content: "รายงานการมา สาย และขาดของนักเรียนและบุคลากรแต่ละคน พร้อมตัวกรองและดาวน์โหลดไฟล์",
      },
      { property: "og:title", content: "รายงานรายบุคคล | FaceGate" },
      {
        property: "og:description",
        content: "ติดตามการมา สาย และขาดของแต่ละคนตามช่วงเวลา พร้อมดาวน์โหลดเป็นไฟล์ตาราง",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MonthlyPage,
});

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonthlyPage() {
  const { t } = useCms();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [group, setGroup] = useState<"all" | "student" | "staff">("all");
  const [place, setPlace] = useState("all");
  const [query, setQuery] = useState("");

  const [yearStr = "1970", monthStr = "01"] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);

  const { data, isFetching } = useQuery({
    queryKey: ["monthly", month],
    queryFn: async () => {
      const [people, logs, settings] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, student_code, class_room, department, position, person_type")
          .eq("is_active", true)
          .limit(3000),
        supabase
          .from("attendance_logs")
          .select("student_id, direction, status, scanned_at")
          .eq("status", "ok")
          .gte("scanned_at", start.toISOString())
          .lt("scanned_at", end.toISOString())
          .limit(50000),
        supabase.from("settings").select("late_after, late_grace_minutes, work_days, block_non_work_days").eq("id", true).maybeSingle(),
      ]);
      return { people: people.data ?? [], logs: logs.data ?? [], settings: settings.data };
    },
    staleTime: 60000,
    placeholderData: (prev) => prev,
  });

  const summary = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    const people = (data?.people ?? []).filter((p) => {
      if (group !== "all" && p.person_type !== group) return false;
      const personPlace = p.person_type === "staff" ? p.department : p.class_room;
      if (place !== "all" && personPlace !== place) return false;
      if (!normalizedQuery) return true;
      return [p.student_code, p.full_name, p.class_room, p.department]
        .some((value) => (value ?? "").toLocaleLowerCase("th").includes(normalizedQuery));
    });
    const lateAfter = data?.settings?.late_after ?? "08:00:00";
    const [lh = 8, lm = 0] = lateAfter.split(":").map(Number);
    const lateMinutes = lh * 60 + lm + (data?.settings?.late_grace_minutes ?? 0);

    const perPerson = new Map<string, { days: Set<string>; late: Set<string>; first: string | null }>();
    for (const log of data?.logs ?? []) {
      if (!log.student_id || log.direction !== "in") continue;
      const d = new Date(log.scanned_at);
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
      const rec = perPerson.get(log.student_id) ?? { days: new Set(), late: new Set(), first: null };
      rec.days.add(day);
      const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).split(":").map(Number);
      if ((timeParts[0] ?? 0) * 60 + (timeParts[1] ?? 0) > lateMinutes) rec.late.add(day);
      perPerson.set(log.student_id, rec);
    }

    const configuredDays = parseWorkDays(data?.settings?.work_days);
    let workingDays = 0;
    for (let day = new Date(year, monthIndex, 1, 12); day < end && day <= new Date(); day.setDate(day.getDate() + 1)) {
      if (!data?.settings?.block_non_work_days || configuredDays.includes(day.getDay())) workingDays += 1;
    }

    const rows = people.map((p) => {
      const rec = perPerson.get(p.id);
      const present = rec?.days.size ?? 0;
      const late = rec?.late.size ?? 0;
      return {
        ...p,
        present,
        late,
        absent: Math.max(0, workingDays - present),
        rate: workingDays ? Math.round((present / workingDays) * 100) : 0,
      };
    });
    rows.sort((a, b) => a.rate - b.rate || a.full_name.localeCompare(b.full_name, "th"));
    return { rows, workingDays };
  }, [data, end, group, monthIndex, place, query, year]);

  const placeOptions = useMemo(() => {
    const values = (data?.people ?? [])
      .filter((person) => group === "all" || person.person_type === group)
      .map((person) => person.person_type === "staff" ? person.department : person.class_room)
      .filter((value): value is string => Boolean(value));
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
  }, [data, group]);

  const totals = useMemo(() => {
    const rows = summary.rows;
    const avg = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + r.rate, 0) / rows.length)
      : 0;
    return {
      people: rows.length,
      avg,
      late: rows.reduce((s, r) => s + r.late, 0),
      absent: rows.reduce((s, r) => s + r.absent, 0),
    };
  }, [summary]);

  const downloadCsv = () => {
    const header = ["รหัส", "ชื่อ-สกุล", "กลุ่ม", "ชั้น/ฝ่าย", "มา (วัน)", "สาย (วัน)", "ขาด (วัน)", "อัตรามา (%)"];
    const lines = summary.rows.map((r) =>
      [
        r.student_code,
        r.full_name,
        r.person_type === "staff" ? "บุคลากร" : "นักเรียน",
        r.person_type === "staff" ? (r.department ?? "") : (r.class_room ?? ""),
        r.present,
        r.late,
        r.absent,
        r.rate,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `รายงานรายบุคคล-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {t("brand.school_name")}
          </p>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <CalendarRange className="size-6 text-primary" /> รายงานรายบุคคล
          </h1>
          <p className="text-sm text-muted-foreground">
            ติดตามการมา สาย และขาดของแต่ละคน ประจำเดือน{THAI_MONTHS[monthIndex]} {year + 543}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
          <select
            value={group}
            onChange={(e) => { setGroup(e.target.value as typeof group); setPlace("all"); }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">ทุกคน</option>
            <option value="student">นักเรียน</option>
            <option value="staff">บุคลากร</option>
          </select>
          <select value={place} onChange={(e) => setPlace(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="all">ทุกชั้น/ฝ่าย</option>
            {placeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <div className="relative min-w-52">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหารหัสหรือชื่อ" className="pl-9" />
          </div>
          <Button variant="secondary" onClick={downloadCsv}>
            <Download className="size-4" /> ดาวน์โหลดไฟล์
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> พิมพ์
          </Button>
        </div>
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="จำนวนคนในรายงาน" value={totals.people} />
        <StatCard label="วันเรียน/วันทำงาน" value={summary.workingDays} hint="ตามวันที่ตั้งค่าไว้" />
        <StatCard label="รวมวันมาสาย" value={totals.late} />
        <StatCard label="รวมวันขาด" value={totals.absent} hint={`อัตรามาเฉลี่ย ${totals.avg}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">สรุปรายบุคคล</CardTitle>
          <CardDescription>
            เรียงจากคนที่มีอัตรามาน้อยที่สุด เพื่อช่วยค้นหาคนที่ควรติดตาม {isFetching ? "• กำลังอัปเดต…" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-สกุล</TableHead>
                  <TableHead>ชั้น/ฝ่าย</TableHead>
                  <TableHead className="text-right">มา</TableHead>
                  <TableHead className="text-right">สาย</TableHead>
                  <TableHead className="text-right">ขาด</TableHead>
                  <TableHead className="text-right">อัตรามา</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      ยังไม่มีข้อมูลในเดือนนี้
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.student_code}</TableCell>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.person_type === "staff" ? (r.department ?? "-") : (r.class_room ?? "-")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.present}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.late > 0 ? (
                          <Badge variant="secondary">{r.late}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.rate >= 80 ? "default" : "destructive"}>{r.rate}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
