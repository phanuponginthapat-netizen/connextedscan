import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, LogIn, LogOut, MonitorPlay } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCms } from "@/lib/cms-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin/live")({
  head: () => ({
    meta: [
      { title: "จอแสดงผลจอใหญ่ | FaceGate" },
      {
        name: "description",
        content: "แสดงรายชื่อผู้ที่สแกนเข้า-ออกล่าสุดแบบเรียลไทม์ สำหรับฉายบนจอทีวีหน้าโรงเรียน",
      },
      { property: "og:title", content: "จอแสดงผลจอใหญ่ | FaceGate" },
      {
        property: "og:description",
        content: "รายชื่อผู้สแกนเข้า-ออกล่าสุดแบบเรียลไทม์สำหรับจอทีวี",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivePage,
});

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function timeText(value: string) {
  return new Date(value).toLocaleTimeString("th-TH-u-ca-buddhist-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function LivePage() {
  const { t } = useCms();
  const { data } = useQuery({
    queryKey: ["live-board"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("attendance_logs")
        .select(
          "id, direction, scanned_at, students(full_name, nickname, class_room, department, person_type)",
        )
        .eq("status", "ok")
        .gte("scanned_at", startOfTodayISO())
        .order("scanned_at", { ascending: false })
        .limit(40);
      return rows ?? [];
    },
    refetchInterval: 10000,
    staleTime: 5000,
    placeholderData: (prev) => prev,
  });

  const { data: frames } = useQuery({
    queryKey: ["live-cameras"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("kiosk_live_frames")
        .select("device_id, device_name, image, status, updated_at")
        .order("device_name");
      return rows ?? [];
    },
    refetchInterval: 2000,
    placeholderData: (prev) => prev,
  });

  const cameras = frames ?? [];
  const rows = data ?? [];
  const checkIn = rows.filter((r) => r.direction === "in").length;
  const checkOut = rows.filter((r) => r.direction === "out").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {t("brand.school_name")}
          </p>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <MonitorPlay className="size-6 text-primary" /> จอแสดงผลจอใหญ่
          </h1>
          <p className="text-sm text-muted-foreground">
            เปิดหน้านี้เต็มจอบนทีวีหน้าโรงเรียน อัปเดตอัตโนมัติทุก 10 วินาที
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className="gap-1 px-3 py-1.5 text-sm">
            <LogIn className="size-4" /> เข้า {checkIn}
          </Badge>
          <Badge variant="secondary" className="gap-1 px-3 py-1.5 text-sm">
            <LogOut className="size-4" /> ออก {checkOut}
          </Badge>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Camera className="size-5 text-primary" /> ภาพสดจากตู้สแกน
        </h2>
        {cameras.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            ยังไม่มีภาพสด — เปิดหน้าจอสแกนที่เครื่องตู้ แล้วภาพจะขึ้นที่นี่ภายในไม่กี่วินาที
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cameras.map((cam) => {
              const fresh = Date.now() - new Date(cam.updated_at).getTime() < 15000;
              return (
                <Card key={cam.device_id} className="overflow-hidden">
                  <img src={cam.image} alt={`ภาพสดจาก ${cam.device_name}`} className="w-full" />
                  <CardContent className="space-y-1 p-3">
                    <p className="flex items-center gap-2 font-semibold">
                      {cam.device_name || "ตู้สแกน"}
                      <Badge variant={fresh ? "default" : "secondary"}>
                        {fresh ? "สด" : "ภาพค้าง"}
                      </Badge>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {cam.status || "กำลังรอผู้ใช้งาน"} • {timeText(cam.updated_at)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <p className="py-20 text-center text-lg text-muted-foreground">ยังไม่มีการสแกนวันนี้</p>
      ) : (
        <div className="stagger-children grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.id} className="rise-in overflow-hidden">
              <CardContent className="flex items-center gap-4 p-4">
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-xl ${
                    r.direction === "in"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-amber-500/15 text-amber-500"
                  }`}
                >
                  {r.direction === "in" ? (
                    <LogIn className="size-6" />
                  ) : (
                    <LogOut className="size-6" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">
                    {r.students?.nickname?.trim() || r.students?.full_name || "ไม่ทราบชื่อ"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {r.students?.person_type === "staff"
                      ? (r.students?.department ?? "บุคลากร")
                      : (r.students?.class_room ?? "-")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-semibold tabular-nums">
                    {timeText(r.scanned_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.direction === "in" ? "เข้า" : "ออก"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
