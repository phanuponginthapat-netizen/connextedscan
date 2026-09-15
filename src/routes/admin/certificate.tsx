import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCms } from "@/lib/cms-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/certificate")({
  head: () => ({
    meta: [
      { title: "ใบรับรองเวลาเรียน | FaceGate" },
      {
        name: "description",
        content: "ออกใบรับรองเวลาเรียนรายบุคคล สรุปวันมา วันสาย และวันขาด พร้อมพิมพ์หรือบันทึกเป็น PDF",
      },
      { property: "og:title", content: "ใบรับรองเวลาเรียน | FaceGate" },
      {
        property: "og:description",
        content: "ใบรับรองเวลาเรียนรายบุคคล พิมพ์หรือบันทึกเป็นไฟล์ PDF ได้ทันที",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CertificatePage,
});

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function monthAgoISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
    new Date(Date.now() - 29 * 86_400_000),
  );
}

function CertificatePage() {
  const { t } = useCms();
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [from, setFrom] = useState(monthAgoISO());
  const [to, setTo] = useState(todayISO());

  const { data: people } = useQuery({
    queryKey: ["cert-people"],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, student_code, full_name, class_room, department, person_type")
        .eq("is_active", true)
        .order("full_name");
      return data ?? [];
    },
  });

  const matches = useMemo(() => {
    const list = people ?? [];
    if (!query.trim()) return list.slice(0, 20);
    const q = query.trim().toLowerCase();
    return list
      .filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          p.student_code.toLowerCase().includes(q) ||
          (p.class_room ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [people, query]);

  const person = (people ?? []).find((p) => p.id === personId) ?? null;

  const { data: settings } = useQuery({
    queryKey: ["cert-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("late_after, late_grace_minutes, work_days, block_non_work_days, school_name")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const { data: logs } = useQuery({
    enabled: Boolean(personId),
    queryKey: ["cert-logs", personId, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("direction, status, scanned_at")
        .eq("student_id", personId!)
        .eq("status", "ok")
        .gte("scanned_at", new Date(`${from}T00:00:00+07:00`).toISOString())
        .lte("scanned_at", new Date(`${to}T23:59:59+07:00`).toISOString())
        .order("scanned_at");
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const lateLimitParts = (settings?.late_after ?? "08:00:00").split(":").map(Number);
    const lateLimit =
      (lateLimitParts[0] ?? 8) * 60 +
      (lateLimitParts[1] ?? 0) +
      (settings?.late_grace_minutes ?? 0);
    const workDays = (settings?.work_days ?? "1,2,3,4,5")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 0 && n <= 6);

    const perDay = new Map<string, number>();
    for (const log of logs ?? []) {
      if (log.direction !== "in") continue;
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(
        new Date(log.scanned_at),
      );
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(log.scanned_at));
      const [h = 0, m = 0] = parts.split(":").map(Number);
      const minutes = h * 60 + m;
      const prev = perDay.get(date);
      if (prev === undefined || minutes < prev) perDay.set(date, minutes);
    }

    let workingDays = 0;
    const start = new Date(`${from}T00:00:00+07:00`).getTime();
    const end = new Date(`${to}T00:00:00+07:00`).getTime();
    const dates: string[] = [];
    for (let time = start; time <= end; time += 86_400_000) {
      const d = new Date(time);
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(d),
      );
      dates.push(date);
      if (!settings?.block_non_work_days || workDays.includes(weekday)) workingDays += 1;
    }

    let late = 0;
    for (const minutes of perDay.values()) if (minutes > lateLimit) late += 1;
    const present = perDay.size;

    return {
      workingDays,
      present,
      late,
      onTime: Math.max(0, present - late),
      absent: Math.max(0, workingDays - present),
      percent: workingDays > 0 ? Math.round((present / workingDays) * 100) : 0,
      totalDays: dates.length,
    };
  }, [logs, settings, from, to]);

  const school = settings?.school_name ?? t("brand.name");

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FileCheck2 className="size-6 text-primary" /> ใบรับรองเวลาเรียน
        </h1>
        <p className="text-sm text-muted-foreground">
          เลือกคน เลือกช่วงวัน แล้วกดพิมพ์ (เลือก "บันทึกเป็น PDF" ในหน้าต่างการพิมพ์ได้)
        </p>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">เลือกผู้รับใบรับรอง</CardTitle>
          <CardDescription>ค้นหาด้วยชื่อ รหัส หรือชั้นเรียน</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>ค้นหา</Label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ชื่อ / รหัส / ชั้น" />
            </div>
            <div className="space-y-1.5">
              <Label>ตั้งแต่วันที่</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ถึงวันที่</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {matches.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={p.id === personId ? "default" : "outline"}
                onClick={() => setPersonId(p.id)}
              >
                {p.full_name}
                {p.class_room ? ` · ${p.class_room}` : ""}
              </Button>
            ))}
            {matches.length === 0 && (
              <p className="text-sm text-muted-foreground">ไม่พบรายชื่อที่ค้นหา</p>
            )}
          </div>

          <Button disabled={!person} onClick={() => window.print()}>
            <Printer className="size-4" /> พิมพ์ใบรับรอง
          </Button>
        </CardContent>
      </Card>

      {person && (
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="space-y-6 py-10">
            <div className="space-y-1 text-center">
              <p className="text-lg font-semibold">{school}</p>
              <h2 className="text-2xl font-bold">ใบรับรองเวลาเรียน</h2>
              <p className="text-sm text-muted-foreground">
                ช่วงวันที่ {from} ถึง {to}
              </p>
            </div>

            <div className="mx-auto max-w-xl space-y-2 text-[15px] leading-relaxed">
              <p>
                ขอรับรองว่า <span className="font-semibold">{person.full_name}</span>
                {person.class_room ? ` ชั้น ${person.class_room}` : ""}
                {person.department ? ` แผนก ${person.department}` : ""} รหัส {person.student_code}
              </p>
              <p>
                มีเวลามาเรียน/ปฏิบัติงาน <span className="font-semibold">{summary.present}</span> วัน จาก{" "}
                {summary.workingDays} วันทำการ คิดเป็น{" "}
                <span className="font-semibold">{summary.percent}%</span>
              </p>
              <p>
                มาตรงเวลา {summary.onTime} วัน • มาสาย {summary.late} วัน • ไม่มาบันทึกเวลา{" "}
                {summary.absent} วัน
              </p>
            </div>

            <div className="grid gap-4 pt-8 text-center text-sm sm:grid-cols-2">
              <div>
                <p className="border-t pt-2">ผู้รับรองข้อมูล</p>
              </div>
              <div>
                <p className="border-t pt-2">ผู้อำนวยการ</p>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              ข้อมูลจากระบบบันทึกเวลาด้วยใบหน้า FaceGate • ออกเมื่อ{" "}
              {new Date().toLocaleString("th-TH-u-ca-buddhist-nu-latn", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
