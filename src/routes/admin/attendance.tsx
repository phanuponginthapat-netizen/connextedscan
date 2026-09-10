import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, LogIn, LogOut, Printer, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { personGroupLabel, personTypeLabel } from "@/components/people/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/attendance")({
  head: () => ({
    meta: [
      { title: "รายงานเข้า-ออก | FaceGate" },
      {
        name: "description",
        content: "รายงานสรุปเวลาเข้า-ออกรายบุคคล พร้อมประวัติการสแกนและดาวน์โหลดไฟล์",
      },
      { property: "og:title", content: "รายงานเข้า-ออก | FaceGate" },
      {
        property: "og:description",
        content: "รายงานสรุปเวลาเข้า-ออกรายบุคคล พร้อมประวัติการสแกนและดาวน์โหลดไฟล์",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttendancePage,
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function timeText(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function dateText(value: string) {
  return new Date(value).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

type LogRow = {
  id: string;
  direction: string;
  status: string;
  confidence: number | null;
  geometry_score: number | null;
  device_name: string | null;
  scanned_at: string;
  students: {
    full_name: string;
    student_code: string;
    class_room: string | null;
    department: string | null;
    person_type: string;
  } | null;
};

function AttendancePage() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [personType, setPersonType] = useState("all");
  const [search, setSearch] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["attendance", from, to, personType],
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T23:59:59.999`);
      const join =
        personType === "all"
          ? "students(full_name, student_code, class_room, department, person_type)"
          : "students!inner(full_name, student_code, class_room, department, person_type)";
      let query = supabase
        .from("attendance_logs")
        .select(
          `id, direction, status, confidence, geometry_score, device_name, scanned_at, ${join}`,
        )
        .gte("scanned_at", start.toISOString())
        .lte("scanned_at", end.toISOString())
        .order("scanned_at", { ascending: false });
      if (personType !== "all") query = query.eq("students.person_type", personType);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.students?.full_name, r.students?.student_code, r.students?.class_room, r.students?.department]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [rows, search]);

  // One line per person per day: first check-in, last check-out.
  const daily = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        date: string;
        code: string;
        name: string;
        type: string;
        group: string;
        inAt: string | null;
        outAt: string | null;
        scans: number;
      }
    >();
    for (const r of filtered) {
      if (r.status !== "ok") continue;
      const day = r.scanned_at.slice(0, 10);
      const key = `${day}|${r.students?.student_code ?? r.id}`;
      const entry = map.get(key) ?? {
        key,
        date: day,
        code: r.students?.student_code ?? "-",
        name: r.students?.full_name ?? "ไม่ทราบชื่อ",
        type: r.students ? personTypeLabel(r.students.person_type) : "-",
        group: r.students ? personGroupLabel(r.students) : "-",
        inAt: null,
        outAt: null,
        scans: 0,
      };
      entry.scans += 1;
      if (r.direction === "in") {
        if (!entry.inAt || r.scanned_at < entry.inAt) entry.inAt = r.scanned_at;
      } else if (!entry.outAt || r.scanned_at > entry.outAt) {
        entry.outAt = r.scanned_at;
      }
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) =>
      a.date === b.date ? a.name.localeCompare(b.name, "th") : b.date.localeCompare(a.date),
    );
  }, [filtered]);

  const stats = useMemo(
    () => ({
      people: new Set(daily.map((d) => d.code)).size,
      checkIn: filtered.filter((r) => r.direction === "in" && r.status === "ok").length,
      checkOut: filtered.filter((r) => r.direction === "out" && r.status === "ok").length,
    }),
    [daily, filtered],
  );

  function exportSummary() {
    downloadCsv(
      `รายงานเข้า-ออก-${from}-ถึง-${to}.csv`,
      ["วันที่", "รหัส", "ชื่อ-นามสกุล", "ประเภทบุคคล", "ห้อง/ฝ่าย", "เวลาเข้า", "เวลาออก", "จำนวนสแกน"],
      daily.map((d) => [
        dateText(d.date),
        d.code,
        d.name,
        d.type,
        d.group,
        timeText(d.inAt),
        timeText(d.outAt),
        d.scans,
      ]),
    );
  }

  function exportLogs() {
    downloadCsv(
      `ประวัติการสแกน-${from}-ถึง-${to}.csv`,
      [
        "เวลา",
        "รหัส",
        "ชื่อ-นามสกุล",
        "ประเภทบุคคล",
        "ห้อง/ฝ่าย",
        "เข้า/ออก",
        "สถานะ",
        "ความเหมือน",
        "สัดส่วนใบหน้า",
        "เครื่อง",
      ],
      filtered.map((r) => [
        new Date(r.scanned_at).toLocaleString("th-TH"),
        r.students?.student_code ?? "",
        r.students?.full_name ?? "",
        r.students ? personTypeLabel(r.students.person_type) : "",
        r.students ? personGroupLabel(r.students) : "",
        r.direction === "in" ? "เข้า" : "ออก",
        r.status === "ok" ? "สำเร็จ" : r.status === "duplicate" ? "สแกนซ้ำ" : "ไม่ผ่าน",
        r.confidence?.toFixed(3) ?? "",
        r.geometry_score?.toFixed(3) ?? "",
        r.device_name ?? "",
      ]),
    );
  }

  const summaryCards = [
    { label: "จำนวนคน", value: stats.people, icon: Users },
    { label: "บันทึกเข้า", value: stats.checkIn, icon: LogIn },
    { label: "บันทึกออก", value: stats.checkOut, icon: LogOut },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">รายงานเข้า-ออก</h1>
          <p className="text-sm text-muted-foreground">
            สรุปเวลาเข้า-ออกรายบุคคล และประวัติการสแกนทั้งหมด
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> พิมพ์รายงาน
          </Button>
          <Button onClick={exportSummary}>
            <Download className="size-4" /> ดาวน์โหลดรายงาน
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label>ตั้งแต่วันที่</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ถึงวันที่</Label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>บุคคล</Label>
            <Select value={personType} onValueChange={setPersonType}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="student">นักเรียน</SelectItem>
                <SelectItem value="staff">บุคลากร</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ค้นหา</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ชื่อ รหัส ห้อง หรือฝ่าย"
              className="w-56"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((s) => (
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

      <Tabs defaultValue="summary">
        <TabsList className="print:hidden">
          <TabsTrigger value="summary">สรุปรายบุคคล</TabsTrigger>
          <TabsTrigger value="logs">ประวัติการสแกน</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                บันทึกเข้า-ออก ({dateText(from)} - {dateText(to)})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ-นามสกุล</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>ห้อง/ฝ่าย</TableHead>
                    <TableHead className="text-center">เวลาเข้า</TableHead>
                    <TableHead className="text-center">เวลาออก</TableHead>
                    <TableHead className="text-center">สแกน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daily.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        {isLoading ? "กำลังโหลด…" : "ไม่มีข้อมูลในช่วงวันที่เลือก"}
                      </TableCell>
                    </TableRow>
                  )}
                  {daily.map((d) => (
                    <TableRow key={d.key}>
                      <TableCell className="whitespace-nowrap">{dateText(d.date)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.code}</TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell>{d.group}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {d.inAt ? (
                          timeText(d.inAt)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {d.outAt ? (
                          timeText(d.outAt)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{d.scans}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">ประวัติการสแกนทั้งหมด</CardTitle>
              <Button variant="secondary" size="sm" onClick={exportLogs} className="print:hidden">
                <Download className="size-4" /> ดาวน์โหลดประวัติ
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เวลา</TableHead>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ-นามสกุล</TableHead>
                    <TableHead>ห้อง/ฝ่าย</TableHead>
                    <TableHead className="text-center">เข้า/ออก</TableHead>
                    <TableHead className="text-center">สถานะ</TableHead>
                    <TableHead className="text-center">ความเหมือน</TableHead>
                    <TableHead>เครื่อง</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        {isLoading ? "กำลังโหลด…" : "ไม่มีข้อมูลในช่วงวันที่เลือก"}
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {dateText(r.scanned_at)} {timeText(r.scanned_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.students?.student_code ?? "-"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.students?.full_name ?? "ไม่ทราบชื่อ"}
                      </TableCell>
                      <TableCell>{r.students ? personGroupLabel(r.students) : "-"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.direction === "in" ? "default" : "secondary"}>
                          {r.direction === "in" ? "เข้า" : "ออก"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.status === "ok" && <span className="text-primary">สำเร็จ</span>}
                        {r.status === "duplicate" && <Badge variant="outline">สแกนซ้ำ</Badge>}
                        {r.status === "geometry_reject" && (
                          <Badge variant="destructive">สัดส่วนไม่ตรง</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {r.confidence != null ? r.confidence.toFixed(2) : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.device_name ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
