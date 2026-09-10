import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlarmClock,
  Clock,
  Download,
  LogIn,
  LogOut,
  Printer,
  ScanFace,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteAttendanceLog,
  deleteAttendanceRange,
} from "@/lib/attendance-admin.functions";
import { useCms } from "@/lib/cms-client";
import { personGroupLabel, personTypeLabel } from "@/components/people/people";
import { StatCard, SortHeader, TablePager } from "@/components/reports/report-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const PAGE_SIZE = 25;

function toDateStr(d: Date) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function todayStr() {
  return toDateStr(new Date());
}

function shiftDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function timeText(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dateText(value: string) {
  return new Date(value).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatThaiDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function durationText(minutes: number | null) {
  if (minutes == null || minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} ชม. ${m} น.` : `${m} นาที`;
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

type DailyRow = {
  key: string;
  date: string;
  code: string;
  name: string;
  type: string;
  group: string;
  inAt: string | null;
  outAt: string | null;
  scans: number;
  minutes: number | null;
  late: boolean;
};

type SummarySort = "date" | "name" | "code" | "inAt" | "outAt" | "minutes";

function AttendancePage() {
  const { t } = useCms();
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [personType, setPersonType] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SummarySort>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [summaryPage, setSummaryPage] = useState(1);
  const [logPage, setLogPage] = useState(1);

  const { data: settings } = useQuery({
    queryKey: ["settings-late"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("late_after").maybeSingle();
      return data as { late_after: string } | null;
    },
    staleTime: 60_000,
  });
  const lateAfter = settings?.late_after?.slice(0, 5) ?? null;

  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<LogRow | null>(null);
  const [confirmClearRange, setConfirmClearRange] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Only admins may delete scan history (enforced again on the server).
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (error) return false;
      return data === true;
    },
    staleTime: 60_000,
  });

  async function refreshRows() {
    await queryClient.invalidateQueries({ queryKey: ["attendance"] });
  }

  async function onDeleteOne() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAttendanceLog({ data: { id: deleteTarget.id } });
      toast.success("ลบรายการสแกนแล้ว");
      setDeleteTarget(null);
      await refreshRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  async function onDeleteRange() {
    setDeleting(true);
    try {
      const result = await deleteAttendanceRange({ data: { from, to } });
      toast.success(`ลบประวัติแล้ว ${result.deleted.toLocaleString("th-TH")} รายการ`);
      setConfirmClearRange(false);
      await refreshRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

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
        .neq("status", "duplicate")
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
      [
        r.students?.full_name,
        r.students?.student_code,
        r.students?.class_room,
        r.students?.department,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [rows, search]);

  // One line per person per day: first check-in, last check-out.
  const daily = useMemo<DailyRow[]>(() => {
    const map = new Map<string, DailyRow>();
    for (const r of filtered) {
      if (r.status !== "ok") continue;
      const day = r.scanned_at.slice(0, 10);
      const key = `${day}|${r.students?.student_code ?? r.id}`;
      const entry =
        map.get(key) ??
        ({
          key,
          date: day,
          code: r.students?.student_code ?? "-",
          name: r.students?.full_name ?? "ไม่ทราบชื่อ",
          type: r.students ? personTypeLabel(r.students.person_type) : "-",
          group: r.students ? personGroupLabel(r.students) : "-",
          inAt: null,
          outAt: null,
          scans: 0,
          minutes: null,
          late: false,
        } satisfies DailyRow);
      entry.scans += 1;
      if (r.direction === "in") {
        if (!entry.inAt || r.scanned_at < entry.inAt) entry.inAt = r.scanned_at;
      } else if (!entry.outAt || r.scanned_at > entry.outAt) {
        entry.outAt = r.scanned_at;
      }
      map.set(key, entry);
    }
    const list = [...map.values()];
    for (const entry of list) {
      if (entry.inAt && entry.outAt) {
        const diff = (new Date(entry.outAt).getTime() - new Date(entry.inAt).getTime()) / 60000;
        entry.minutes = diff > 0 ? diff : null;
      }
      if (entry.inAt && lateAfter) {
        const d = new Date(entry.inAt);
        const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        entry.late = clock > lateAfter;
      }
    }
    return list;
  }, [filtered, lateAfter]);

  const sortedDaily = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const value = (row: DailyRow) => {
      switch (sortKey) {
        case "name":
          return row.name;
        case "code":
          return row.code;
        case "inAt":
          return row.inAt ?? "";
        case "outAt":
          return row.outAt ?? "";
        case "minutes":
          return row.minutes ?? -1;
        default:
          return row.date;
      }
    };
    return [...daily].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "th") * dir;
    });
  }, [daily, sortKey, sortDir]);

  const stats = useMemo(() => {
    const withDuration = daily.filter((d) => d.minutes != null);
    const avg = withDuration.length
      ? withDuration.reduce((s, d) => s + (d.minutes ?? 0), 0) / withDuration.length
      : null;
    return {
      people: new Set(daily.map((d) => d.code)).size,
      checkIn: filtered.filter((r) => r.direction === "in" && r.status === "ok").length,
      checkOut: filtered.filter((r) => r.direction === "out" && r.status === "ok").length,
      late: daily.filter((d) => d.late).length,
      stillIn: daily.filter((d) => d.inAt && !d.outAt).length,
      avgMinutes: avg,
      scans: filtered.length,
    };
  }, [daily, filtered]);

  const chartData = useMemo(() => {
    const map = new Map<string, { day: string; label: string; in: number; out: number }>();
    for (const r of filtered) {
      if (r.status !== "ok") continue;
      const day = r.scanned_at.slice(0, 10);
      const entry =
        map.get(day) ??
        {
          day,
          label: new Date(day).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }),
          in: 0,
          out: 0,
        };
      if (r.direction === "in") entry.in += 1;
      else entry.out += 1;
      map.set(day, entry);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [filtered]);

  const summaryPageCount = Math.max(1, Math.ceil(sortedDaily.length / PAGE_SIZE));
  const summaryRows = sortedDaily.slice((summaryPage - 1) * PAGE_SIZE, summaryPage * PAGE_SIZE);
  const logPageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const logRows = filtered.slice((logPage - 1) * PAGE_SIZE, logPage * PAGE_SIZE);

  function onSort(key: SummarySort) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
    setSummaryPage(1);
  }

  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    setSummaryPage(1);
    setLogPage(1);
  }

  function exportSummary() {
    downloadCsv(
      `รายงานเข้า-ออก-${from}-ถึง-${to}.csv`,
      [
        "วันที่",
        "รหัส",
        "ชื่อ-นามสกุล",
        "ประเภทบุคคล",
        "ห้อง/ฝ่าย",
        "เวลาเข้า",
        "เวลาออก",
        "รวมเวลา (นาที)",
        "สถานะ",
        "จำนวนสแกน",
      ],
      sortedDaily.map((d) => [
        dateText(d.date),
        d.code,
        d.name,
        d.type,
        d.group,
        timeText(d.inAt),
        timeText(d.outAt),
        d.minutes != null ? Math.round(d.minutes) : "",
        d.late ? "มาสาย" : d.inAt ? "ปกติ" : "ไม่มีเวลาเข้า",
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
        new Date(r.scanned_at).toLocaleString("th-TH", { hour12: false }),
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

  const rangeLabel = from === to ? dateText(from) : `${dateText(from)} – ${dateText(to)}`;
  const presets: Array<[string, () => void]> = [
    ["วันนี้", () => applyRange(todayStr(), todayStr())],
    ["7 วันล่าสุด", () => applyRange(shiftDays(-6), todayStr())],
    ["30 วันล่าสุด", () => applyRange(shiftDays(-29), todayStr())],
    [
      "เดือนนี้",
      () => {
        const d = new Date();
        applyRange(toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), todayStr());
      },
    ],
  ];

  return (
    <div className="space-y-6">
      {/* Report header — also used as the printed cover line */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t("brand.school_name")}
          </p>
          <h1 className="font-display text-2xl font-semibold">{t("report.title")}</h1>
          <p className="text-sm text-muted-foreground">
            ช่วงวันที่ {rangeLabel} •{" "}
            {personType === "all"
              ? "ทุกประเภทบุคคล"
              : personType === "student"
                ? "เฉพาะนักเรียน"
                : "เฉพาะบุคลากร"}{" "}
            • ออกรายงานเมื่อ {new Date().toLocaleString("th-TH", { hour12: false })}
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
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            {presets.map(([label, run]) => (
              <Button key={label} variant="outline" size="sm" onClick={run}>
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>ตั้งแต่วันที่</Label>
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => applyRange(e.target.value, to)}
              />
              {from && <p className="text-xs text-muted-foreground">{formatThaiDate(from)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>ถึงวันที่</Label>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => applyRange(from, e.target.value)}
              />
              {to && <p className="text-xs text-muted-foreground">{formatThaiDate(to)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>บุคคล</Label>
              <Select
                value={personType}
                onValueChange={(v) => {
                  setPersonType(v);
                  setSummaryPage(1);
                  setLogPage(1);
                }}
              >
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSummaryPage(1);
                  setLogPage(1);
                }}
                placeholder="ชื่อ รหัส ห้อง หรือฝ่าย"
                className="w-56"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="จำนวนคน" value={stats.people} icon={Users} />
        <StatCard label="บันทึกเข้า" value={stats.checkIn} icon={LogIn} />
        <StatCard label="บันทึกออก" value={stats.checkOut} icon={LogOut} />
        <StatCard
          label="มาสาย"
          value={stats.late}
          icon={AlarmClock}
          tone={stats.late > 0 ? "warning" : "default"}
          hint={lateAfter ? `หลัง ${lateAfter} น.` : undefined}
        />
        <StatCard label="ยังไม่บันทึกออก" value={stats.stillIn} icon={Clock} />
        <StatCard
          label="เวลาเฉลี่ย"
          value={stats.avgMinutes != null ? durationText(stats.avgMinutes) : "-"}
          icon={ScanFace}
          hint={`สแกนทั้งหมด ${stats.scans.toLocaleString("th-TH")} ครั้ง`}
        />
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">สถิติการสแกนรายวัน</CardTitle>
            <CardDescription>เปรียบเทียบจำนวนบันทึกเข้าและออกในแต่ละวัน</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <ReTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="in" name="เข้า" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="out"
                  name="ออก"
                  fill="var(--muted-foreground)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="summary">
        <TabsList className="print:hidden">
          <TabsTrigger value="summary">สรุปรายบุคคล</TabsTrigger>
          <TabsTrigger value="logs">ประวัติการสแกน</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">ตารางสรุปเวลาเข้า-ออกรายบุคคล</CardTitle>
              <CardDescription>
                หนึ่งบรรทัดต่อคนต่อวัน โดยใช้เวลาเข้าแรกสุดและเวลาออกล่าสุด
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <SortHeader
                        label="วันที่"
                        sortKey="date"
                        active={sortKey}
                        dir={sortDir}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="รหัส"
                        sortKey="code"
                        active={sortKey}
                        dir={sortDir}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="ชื่อ-นามสกุล"
                        sortKey="name"
                        active={sortKey}
                        dir={sortDir}
                        onSort={onSort}
                      />
                      <TableHead>ประเภท</TableHead>
                      <TableHead>ห้อง/ฝ่าย</TableHead>
                      <SortHeader
                        label="เวลาเข้า"
                        sortKey="inAt"
                        active={sortKey}
                        dir={sortDir}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="เวลาออก"
                        sortKey="outAt"
                        active={sortKey}
                        dir={sortDir}
                        onSort={onSort}
                      />
                      <SortHeader
                        label="รวมเวลา"
                        sortKey="minutes"
                        active={sortKey}
                        dir={sortDir}
                        onSort={onSort}
                      />
                      <TableHead className="text-center">สถานะ</TableHead>
                      <TableHead className="text-center">สแกน</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                          {isLoading ? "กำลังโหลด…" : "ไม่มีข้อมูลในช่วงวันที่เลือก"}
                        </TableCell>
                      </TableRow>
                    )}
                    {summaryRows.map((d) => (
                      <TableRow key={d.key} className="even:bg-muted/20">
                        <TableCell className="whitespace-nowrap">{dateText(d.date)}</TableCell>
                        <TableCell className="font-mono text-xs">{d.code}</TableCell>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="text-muted-foreground">{d.type}</TableCell>
                        <TableCell className="text-muted-foreground">{d.group}</TableCell>
                        <TableCell className="tabular-nums">{timeText(d.inAt)}</TableCell>
                        <TableCell className="tabular-nums">{timeText(d.outAt)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {durationText(d.minutes)}
                        </TableCell>
                        <TableCell className="text-center">
                          {d.late ? (
                            <Badge variant="destructive">มาสาย</Badge>
                          ) : d.inAt && !d.outAt ? (
                            <Badge variant="outline">ยังไม่ออก</Badge>
                          ) : (
                            <Badge variant="secondary">ปกติ</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{d.scans}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePager
                page={summaryPage}
                pageCount={summaryPageCount}
                total={sortedDaily.length}
                onPage={setSummaryPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">ประวัติการสแกนทั้งหมด</CardTitle>
                <CardDescription>ไม่รวมรายการที่ระบบตัดเป็นการสแกนซ้ำ</CardDescription>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button variant="secondary" size="sm" onClick={exportLogs}>
                  <Download className="size-4" /> ดาวน์โหลดประวัติ
                </Button>
                {isAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmClearRange(true)}
                    disabled={filtered.length === 0}
                  >
                    <Trash2 className="size-4" /> ลบประวัติช่วงนี้
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>เวลา</TableHead>
                      <TableHead>รหัส</TableHead>
                      <TableHead>ชื่อ-นามสกุล</TableHead>
                      <TableHead>ห้อง/ฝ่าย</TableHead>
                      <TableHead className="text-center">เข้า/ออก</TableHead>
                      <TableHead className="text-center">สถานะ</TableHead>
                      <TableHead className="text-center">ความเหมือน</TableHead>
                      <TableHead>เครื่อง</TableHead>
                      {isAdmin && <TableHead className="text-center print:hidden">จัดการ</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={isAdmin ? 9 : 8}
                          className="py-12 text-center text-muted-foreground"
                        >
                          {isLoading ? "กำลังโหลด…" : "ไม่มีข้อมูลในช่วงวันที่เลือก"}
                        </TableCell>
                      </TableRow>
                    )}
                    {logRows.map((r) => (
                      <TableRow key={r.id} className="even:bg-muted/20">
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {dateText(r.scanned_at)} {timeText(r.scanned_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.students?.student_code ?? "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.students?.full_name ?? "ไม่ทราบชื่อ"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.students ? personGroupLabel(r.students) : "-"}
                        </TableCell>
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
                        <TableCell className="text-muted-foreground">
                          {r.device_name ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePager
                page={logPage}
                pageCount={logPageCount}
                total={filtered.length}
                onPage={setLogPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
