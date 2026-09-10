import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
      { title: "ประวัติเข้า-ออก | FaceGate" },
      { name: "description", content: "ดูและส่งออกประวัติการสแกนเข้า-ออกของนักเรียน" },
      { property: "og:title", content: "ประวัติเข้า-ออก | FaceGate" },
      { property: "og:description", content: "ดูและส่งออกประวัติการสแกนเข้า-ออกของนักเรียน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttendancePage,
});

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function AttendancePage() {
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState("all");

  const { data: rows } = useQuery({
    queryKey: ["attendance", date, direction],
    queryFn: async () => {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      let query = supabase
        .from("attendance_logs")
        .select(
          "id, direction, status, confidence, geometry_score, snapshot_path, device_name, scanned_at, students(full_name, student_code, class_room)",
        )
        .gte("scanned_at", start.toISOString())
        .lte("scanned_at", end.toISOString())
        .order("scanned_at", { ascending: false });
      if (direction !== "all") query = query.eq("direction", direction);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const paths = (rows ?? []).map((r) => r.snapshot_path).filter(Boolean) as string[];

  const { data: snapshots } = useQuery({
    queryKey: ["attendance-snapshots", paths],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data } = await supabase.storage.from("faces").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      (data ?? []).forEach((item) => {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      });
      return map;
    },
  });

  function exportCsv() {
    const header = "เวลา,รหัส,ชื่อ,ห้อง,ประเภท,สถานะ,ความมั่นใจ,เครื่อง\n";
    const body = (rows ?? [])
      .map((r) =>
        [
          new Date(r.scanned_at).toLocaleString("th-TH"),
          r.students?.student_code ?? "",
          r.students?.full_name ?? "",
          r.students?.class_room ?? "",
          r.direction === "in" ? "เข้า" : "ออก",
          r.status,
          r.confidence?.toFixed(3) ?? "",
          r.device_name ?? "",
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${header}${body}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `attendance-${date}.csv`;
    link.click();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">ประวัติเข้า-ออก</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>วันที่</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>ประเภท</Label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="in">เข้าโรงเรียน</SelectItem>
              <SelectItem value="out">ออกจากโรงเรียน</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          <Download className="size-4" /> ส่งออก CSV
        </Button>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {(rows ?? []).length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในวันที่เลือก</p>
          )}
          {(rows ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium">{r.students?.full_name ?? "ไม่ทราบชื่อ"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.students?.student_code ?? "-"} • {r.students?.class_room ?? "-"} •{" "}
                  {new Date(r.scanned_at).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.status === "duplicate" && <Badge variant="outline">สแกนซ้ำ</Badge>}
                <Badge variant={r.direction === "in" ? "default" : "secondary"}>
                  {r.direction === "in" ? "เข้า" : "ออก"}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
