import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Download, Printer, UserRoundX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCms } from "@/lib/cms-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/class-report")({
  head: () => ({
    meta: [
      { title: "รายงานการมาโรงเรียน | FaceGate" },
      { name: "description", content: "สรุปการมาเรียนแยกชั้นและรายชื่อนักเรียนที่ขาด" },
    ],
  }),
  component: ClassReportPage,
});

type Gender = "male" | "female" | "unspecified";
type Counts = { male: number; female: number; unspecified: number; all: number };
const emptyCounts = (): Counts => ({ male: 0, female: 0, unspecified: 0, all: 0 });

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function ClassReportPage() {
  const { t } = useCms();
  const [date, setDate] = useState(localDateKey);
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, isFetching } = useQuery({
    queryKey: ["class-attendance-report", date],
    queryFn: async () => {
      const [people, logs, settings] = await Promise.all([
        supabase
          .from("students")
          .select("id, student_code, full_name, class_room, gender")
          .eq("person_type", "student")
          .eq("is_active", true)
          .order("class_room")
          .order("full_name")
          .limit(5000),
        supabase
          .from("attendance_logs")
          .select("student_id, direction, status, scanned_at")
          .eq("direction", "in")
          .eq("status", "ok")
          .gte("scanned_at", start.toISOString())
          .lt("scanned_at", end.toISOString())
          .order("scanned_at")
          .limit(10000),
        supabase.from("settings").select("late_after, late_grace_minutes, school_name, checkin_only_mode").eq("id", true).maybeSingle(),
      ]);
      if (people.error) throw people.error;
      if (logs.error) throw logs.error;
      return { people: people.data ?? [], logs: logs.data ?? [], settings: settings.data };
    },
    refetchInterval: date === localDateKey() ? 30_000 : false,
  });

  const report = useMemo(() => {
    const firstScan = new Map<string, string>();
    for (const log of data?.logs ?? []) {
      if (log.student_id && !firstScan.has(log.student_id)) firstScan.set(log.student_id, log.scanned_at);
    }
    const [hour = 8, minute = 0] = (data?.settings?.late_after ?? "08:00:00").split(":").map(Number);
    // Check-in only schools never mark anyone late.
    const lateLimit = data?.settings?.checkin_only_mode
      ? Number.POSITIVE_INFINITY
      : hour * 60 + minute + (data?.settings?.late_grace_minutes ?? 0);
    const roomMap = new Map<string, { classRoom: string; total: Counts; present: Counts; late: Counts; absent: Counts }>();
    const absentPeople: Array<{ student_code: string; full_name: string; class_room: string; gender: Gender }> = [];

    const add = (counts: Counts, gender: Gender) => {
      counts[gender] += 1;
      counts.all += 1;
    };
    for (const person of data?.people ?? []) {
      const classRoom = person.class_room?.trim() || "ไม่ระบุชั้น";
      const gender: Gender = person.gender === "male" || person.gender === "female" ? person.gender : "unspecified";
      const room = roomMap.get(classRoom) ?? {
        classRoom, total: emptyCounts(), present: emptyCounts(), late: emptyCounts(), absent: emptyCounts(),
      };
      add(room.total, gender);
      const scan = firstScan.get(person.id);
      if (scan) {
        add(room.present, gender);
        const scanned = new Date(scan);
        if (scanned.getHours() * 60 + scanned.getMinutes() > lateLimit) add(room.late, gender);
      } else {
        add(room.absent, gender);
        absentPeople.push({ student_code: person.student_code, full_name: person.full_name, class_room: classRoom, gender });
      }
      roomMap.set(classRoom, room);
    }
    const rooms = [...roomMap.values()].sort((a, b) => a.classRoom.localeCompare(b.classRoom, "th", { numeric: true }));
    const totals = { total: emptyCounts(), present: emptyCounts(), late: emptyCounts(), absent: emptyCounts() };
    for (const room of rooms) for (const key of ["total", "present", "late", "absent"] as const) {
      for (const gender of ["male", "female", "unspecified", "all"] as const) totals[key][gender] += room[key][gender];
    }
    return { rooms, absentPeople, totals };
  }, [data]);

  const downloadCsv = () => {
    const classRows = report.rooms.map((r) => [r.classRoom, r.total.male, r.total.female, r.total.all, r.present.male, r.present.female, r.present.all, r.late.all, 0, r.absent.all, r.total.all ? Math.round(r.present.all / r.total.all * 100) : 0]);
    const absentRows = report.absentPeople.map((p) => [p.student_code, p.full_name, p.class_room, p.gender === "male" ? "ชาย" : p.gender === "female" ? "หญิง" : "ไม่ระบุ"]);
    const csv = "\uFEFF" + [
      ["ชั้น", "นักเรียนชาย", "นักเรียนหญิง", "รวม", "มาเรียนชาย", "มาเรียนหญิง", "มาเรียนรวม", "สาย", "ลา", "ขาด", "% เข้าเรียน"],
      ...classRows,
      [], ["รายชื่อนักเรียนที่ขาด"], ["รหัส", "ชื่อ-นามสกุล", "ชั้น", "เพศ"], ...absentRows,
    ].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `รายงานการมาโรงเรียน-${date}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const value = (counts: Counts) => <><TableCell className="text-center">{counts.male}</TableCell><TableCell className="text-center">{counts.female}</TableCell><TableCell className="text-center font-semibold">{counts.all}</TableCell></>;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{data?.settings?.school_name ?? t("brand.school_name")}</p>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold"><ClipboardList className="size-6 text-primary" /> รายงานการมาโรงเรียน</h1>
          <p className="text-sm text-muted-foreground">สรุปการเข้าเรียนรายชั้น พร้อมรายชื่อนักเรียนที่ขาด {isFetching ? "• กำลังอัปเดต…" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" />
          <Button variant="secondary" onClick={downloadCsv}><Download className="size-4" /> ดาวน์โหลด CSV</Button>
          <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> พิมพ์</Button>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>สรุปประจำวันที่ {new Date(`${date}T12:00:00`).toLocaleDateString("th-TH-u-ca-buddhist-nu-latn", { dateStyle: "long" })}</CardTitle><CardDescription>“ลา” เตรียมไว้ในรายงานและจะแสดง 0 จนกว่าจะบันทึกข้อมูลการลา</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead rowSpan={2}>ชั้น/ห้อง</TableHead><TableHead colSpan={3} className="text-center">นักเรียน</TableHead><TableHead colSpan={3} className="bg-emerald-500/10 text-center">มาเรียน</TableHead><TableHead rowSpan={2} className="bg-amber-500/10 text-center">สาย</TableHead><TableHead rowSpan={2} className="text-center">ลา</TableHead><TableHead rowSpan={2} className="bg-red-500/10 text-center">ขาด</TableHead><TableHead rowSpan={2} className="text-center">% เข้าเรียน</TableHead></TableRow>
          <TableRow><TableHead className="text-center">ช</TableHead><TableHead className="text-center">ญ</TableHead><TableHead className="text-center">รวม</TableHead><TableHead className="bg-emerald-500/10 text-center">ช</TableHead><TableHead className="bg-emerald-500/10 text-center">ญ</TableHead><TableHead className="bg-emerald-500/10 text-center">รวม</TableHead></TableRow></TableHeader>
          <TableBody>{report.rooms.map((r) => { const rate = r.total.all ? Math.round(r.present.all / r.total.all * 100) : 0; return <TableRow key={r.classRoom}><TableCell className="font-semibold">{r.classRoom}</TableCell>{value(r.total)}{value(r.present)}<TableCell className="text-center">{r.late.all}</TableCell><TableCell className="text-center">0</TableCell><TableCell className="bg-red-500/5 text-center font-semibold text-red-400">{r.absent.all}</TableCell><TableCell className="text-center"><Badge variant={rate >= 80 ? "default" : "destructive"}>{rate}%</Badge></TableCell></TableRow>; })}
          {report.rooms.length > 0 && <TableRow className="bg-muted/50"><TableCell className="font-bold">รวมทั้งหมด</TableCell>{value(report.totals.total)}{value(report.totals.present)}<TableCell className="text-center font-bold">{report.totals.late.all}</TableCell><TableCell className="text-center">0</TableCell><TableCell className="text-center font-bold text-red-400">{report.totals.absent.all}</TableCell><TableCell className="text-center font-bold">{report.totals.total.all ? Math.round(report.totals.present.all / report.totals.total.all * 100) : 0}%</TableCell></TableRow>}
          {report.rooms.length === 0 && <TableRow><TableCell colSpan={11} className="py-12 text-center text-muted-foreground">ยังไม่มีข้อมูลนักเรียน</TableCell></TableRow>}</TableBody>
        </Table></div>{report.totals.total.unspecified > 0 && <p className="p-4 text-xs text-muted-foreground">นักเรียนไม่ระบุเพศ {report.totals.total.unspecified} คน รวมอยู่ในยอดรวม แต่ไม่รวมช่องชาย/หญิง</p>}</CardContent>
      </Card>

      <Card className="border-red-500/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-red-400"><UserRoundX className="size-5" /> รายชื่อนักเรียนที่ขาด <Badge variant="destructive">{report.absentPeople.length} คน</Badge></CardTitle><CardDescription>นักเรียนที่ไม่มีการสแกนเข้าที่สำเร็จในวันที่เลือก</CardDescription></CardHeader>
        <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>รหัส</TableHead><TableHead>ชื่อ-นามสกุล</TableHead><TableHead>ชั้น/ห้อง</TableHead><TableHead>เพศ</TableHead></TableRow></TableHeader><TableBody>
          {report.absentPeople.map((p) => <TableRow key={p.student_code}><TableCell className="font-mono text-xs">{p.student_code}</TableCell><TableCell>{p.full_name}</TableCell><TableCell>{p.class_room}</TableCell><TableCell>{p.gender === "male" ? "ชาย" : p.gender === "female" ? "หญิง" : "ไม่ระบุ"}</TableCell></TableRow>)}
          {report.absentPeople.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-emerald-400">ไม่มีนักเรียนขาดในวันที่เลือก</TableCell></TableRow>}
        </TableBody></Table></CardContent>
      </Card>
    </div>
  );
}