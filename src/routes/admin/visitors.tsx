import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, QrCode, UserRoundCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/visitors")({
  head: () => ({
    meta: [
      { title: "ผู้มาเยือน | FaceGate" },
      {
        name: "description",
        content: "แดชบอร์ดสถิติการเข้าโรงเรียนของผู้มาเยือนและบุคลากรภายนอกที่ลงทะเบียนผ่าน QR code",
      },
      { property: "og:title", content: "ผู้มาเยือน | FaceGate" },
      { property: "og:description", content: "สถิติและรายชื่อผู้มาเยือนที่เข้าโรงเรียน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisitorsPage,
});

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const genderLabel = (g: string | null) =>
  g === "male" ? "ชาย" : g === "female" ? "หญิง" : "ไม่ระบุ";

function VisitorsPage() {
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return localDateKey(d);
  });
  const [end, setEnd] = useState(localDateKey);
  const [search, setSearch] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["visitor-report", start, end],
    queryFn: async () => {
      const endNext = new Date(`${end}T00:00:00`);
      endNext.setDate(endNext.getDate() + 1);
      const [people, logs, settings] = await Promise.all([
        supabase
          .from("students")
          .select("id, student_code, full_name, gender, department, visit_reason, visit_date, created_at")
          .eq("person_type", "visitor")
          .gte("visit_date", start)
          .lte("visit_date", end)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("attendance_logs")
          .select("student_id, direction, status, scanned_at")
          .eq("status", "ok")
          .gte("scanned_at", new Date(`${start}T00:00:00`).toISOString())
          .lt("scanned_at", endNext.toISOString())
          .limit(20000),
        supabase.from("settings").select("visitor_register_enabled").eq("id", true).maybeSingle(),
      ]);
      if (people.error) throw people.error;
      if (logs.error) throw logs.error;
      return { people: people.data ?? [], logs: logs.data ?? [], settings: settings.data };
    },
    refetchInterval: end === localDateKey() ? 30_000 : false,
  });

  const report = useMemo(() => {
    const people = data?.people ?? [];
    const ids = new Set(people.map((p) => p.id));
    const firstIn = new Map<string, string>();
    const lastOut = new Map<string, string>();
    for (const log of data?.logs ?? []) {
      if (!log.student_id || !ids.has(log.student_id)) continue;
      if (log.direction === "in") {
        if (!firstIn.has(log.student_id)) firstIn.set(log.student_id, log.scanned_at);
      } else {
        lastOut.set(log.student_id, log.scanned_at);
      }
    }

    const rows = people.map((p) => ({
      ...p,
      entered_at: firstIn.get(p.id) ?? null,
      left_at: lastOut.get(p.id) ?? null,
    }));

    const today = localDateKey();
    const byDay = new Map<string, number>();
    const byAffiliation = new Map<string, number>();
    for (const row of rows) {
      const day = row.visit_date ?? localDateKey(new Date(row.created_at));
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      const key = (row.department ?? "").trim() || "ไม่ระบุสังกัด";
      byAffiliation.set(key, (byAffiliation.get(key) ?? 0) + 1);
    }

    return {
      rows,
      registered: rows.length,
      entered: rows.filter((r) => r.entered_at).length,
      waiting: rows.filter((r) => !r.entered_at).length,
      today: rows.filter((r) => r.visit_date === today).length,
      todayEntered: rows.filter((r) => r.visit_date === today && r.entered_at).length,
      male: rows.filter((r) => r.gender === "male").length,
      female: rows.filter((r) => r.gender === "female").length,
      days: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)),
      affiliations: [...byAffiliation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return report.rows;
    return report.rows.filter((r) =>
      [r.full_name, r.student_code, r.department, r.visit_reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [report.rows, search]);

  const timeText = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString("th-TH-u-ca-buddhist-nu-latn", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "-";

  const dateText = (value: string | null) =>
    value
      ? new Date(`${value}T00:00:00`).toLocaleDateString("th-TH-u-ca-buddhist-nu-latn", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "-";

  const downloadCsv = () => {
    const rows = filtered.map((r) =>
      [
        r.student_code,
        r.full_name,
        genderLabel(r.gender),
        r.department ?? "",
        r.visit_reason ?? "",
        r.visit_date ?? "",
        r.entered_at ? timeText(r.entered_at) : "ยังไม่เข้า",
        r.left_at ? timeText(r.left_at) : "",
      ]
        .map(csvCell)
        .join(","),
    );
    const head = "รหัส,ชื่อ-นามสกุล,เพศ,สังกัด/อาชีพ,เหตุผล,วันที่,เวลาเข้า,เวลาออก";
    const blob = new Blob([`\ufeff${head}\n${rows.join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ผู้มาเยือน-${start}-ถึง-${end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const kpis = [
    { label: "ลงทะเบียนในช่วงนี้", value: report.registered },
    { label: "เข้าโรงเรียนแล้ว", value: report.entered },
    { label: "ลงทะเบียนแต่ยังไม่เข้า", value: report.waiting },
    { label: "วันนี้ (เข้าแล้ว/ลงทะเบียน)", value: `${report.todayEntered}/${report.today}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold">ผู้มาเยือนและบุคลากรภายนอก</h1>
          <p className="text-sm text-muted-foreground">
            สถิติการเข้าโรงเรียนของผู้ที่ลงทะเบียนเองผ่าน QR code บนหน้าจอตู้สแกน
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-xs text-muted-foreground">ตั้งแต่</p>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ถึง</p>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ค้นหา</p>
            <Input
              placeholder="ชื่อ / รหัส / สังกัด"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={downloadCsv}>
            <Download className="mr-2 size-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" /> พิมพ์
          </Button>
        </div>
      </div>

      {data && !data.settings?.visitor_register_enabled && (
        <Card className="border-accent">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <QrCode className="size-5 text-accent" />
            โหมดลงทะเบียนผู้มาเยือนปิดอยู่ — เปิดได้ที่หน้าตั้งค่า เพื่อให้หน้าจอตู้สแกนแสดง QR code
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="font-display text-3xl">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">จำนวนผู้มาเยือนรายวัน</CardTitle>
            <CardDescription>ชาย {report.male} คน • หญิง {report.female} คน</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.days.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              report.days.map(([day, count]) => {
                const max = Math.max(...report.days.map(([, c]) => c), 1);
                return (
                  <div key={day} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{dateText(day)}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                    <strong className="w-8 text-right text-sm tabular-nums">{count}</strong>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">สังกัด/อาชีพที่เข้าบ่อย</CardTitle>
            <CardDescription>จัดอันดับจากจำนวนการลงทะเบียน</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.affiliations.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลในช่วงนี้</p>
            ) : (
              report.affiliations.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <span className="truncate">{name}</span>
                  <Badge variant="secondary">{count} ครั้ง</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">รายชื่อผู้มาเยือน</CardTitle>
            <CardDescription>
              {filtered.length} รายการ {isFetching ? "• กำลังอัปเดต…" : ""}
            </CardDescription>
          </div>
          <UserRoundCheck className="size-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ-นามสกุล</TableHead>
                <TableHead>เพศ</TableHead>
                <TableHead>สังกัด/อาชีพ</TableHead>
                <TableHead>เหตุผล</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>เข้า</TableHead>
                <TableHead>ออก</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    ไม่พบข้อมูลตามตัวกรอง
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.student_code}</TableCell>
                    <TableCell className="font-semibold">{r.full_name}</TableCell>
                    <TableCell>{genderLabel(r.gender)}</TableCell>
                    <TableCell>{r.department ?? "-"}</TableCell>
                    <TableCell className="max-w-56 truncate">{r.visit_reason ?? "-"}</TableCell>
                    <TableCell>{dateText(r.visit_date)}</TableCell>
                    <TableCell>
                      {r.entered_at ? (
                        <span className="font-semibold text-primary">{timeText(r.entered_at)}</span>
                      ) : (
                        <Badge variant="outline">ยังไม่เข้า</Badge>
                      )}
                    </TableCell>
                    <TableCell>{timeText(r.left_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
