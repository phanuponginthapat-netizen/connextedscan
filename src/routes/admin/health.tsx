import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CloudDownload,
  Database,
  HardDriveDownload,
  RefreshCw,
  ScanFace,
  Trash2,
  Users,
  WifiOff,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/reports/report-ui";
import {
  systemHealth,
  cleanupNow,
  notifyNow,
  weeklyReportNow,
} from "@/lib/system-admin.functions";
import { backupNow } from "@/lib/backup.functions";

export const Route = createFileRoute("/admin/health")({
  head: () => ({
    meta: [
      { title: "สุขภาพระบบ | FaceGate" },
      {
        name: "description",
        content: "ตรวจสถานะตู้สแกน เวอร์ชันโปรแกรม การสแกนล่าสุด การล้างข้อมูลและการแจ้งเตือน",
      },
      { property: "og:title", content: "สุขภาพระบบ | FaceGate" },
      {
        property: "og:description",
        content: "สถานะตู้สแกน เวอร์ชันโปรแกรม และงานเบื้องหลังของระบบสแกนใบหน้า",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HealthPage,
});

function whenText(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function agoText(value: string | null | undefined) {
  if (!value) return "ยังไม่เคยเชื่อมต่อ";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

function HealthPage() {
  const health = useServerFn(systemHealth);
  const cleanup = useServerFn(cleanupNow);
  const notify = useServerFn(notifyNow);
  const backup = useServerFn(backupNow);
  const report = useServerFn(weeklyReportNow);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: () => health(),
    refetchInterval: 60_000,
  });

  const runCleanup = useMutation({
    mutationFn: () => cleanup(),
    onSuccess: (r) => {
      toast.success(
        `ล้างข้อมูลแล้ว: ลบรูป ${r.snapshotsDeleted} รูป, ประวัติ ${r.logsDeleted} รายการ`,
      );
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runNotify = useMutation({
    mutationFn: () => notify(),
    onSuccess: (r) => {
      if (r.groups === 0) toast.success("ตรวจแล้ว ไม่มีเหตุการณ์ที่ต้องแจ้งเตือน");
      else toast.success(`ส่งแจ้งเตือน ${r.groups} เรื่อง (LINE ${r.line} / อีเมล ${r.email})`);
      if (r.blocked.length > 0) toast.warning(r.blocked[0]);
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runBackup = useMutation({
    mutationFn: () => backup(),
    onSuccess: () => {
      toast.success("สำรองข้อมูลแล้ว");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runReport = useMutation({
    mutationFn: () => report({ data: { days: 7 } }),
    onSuccess: (r) => {
      toast.success(`ส่งรายงานสรุปแล้ว (LINE ${r.line} / อีเมล ${r.email})`);
      if (r.blocked.length > 0) toast.warning(r.blocked[0]);
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const devices = data?.devices ?? [];
  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div className="animate-rise space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">สุขภาพระบบ</h1>
          <p className="text-sm text-muted-foreground">
            สถานะตู้สแกนแต่ละเครื่อง เวอร์ชันโปรแกรม การสแกนล่าสุด และงานเบื้องหลัง
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} /> รีเฟรช
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ตู้สแกนออนไลน์"
          value={`${onlineCount}/${devices.length}`}
          hint={`นับว่าออฟไลน์เมื่อเงียบเกิน ${data?.offlineMinutes ?? 15} นาที`}
          icon={Activity}
          tone={devices.length > 0 && onlineCount === 0 ? "warning" : "positive"}
        />
        <StatCard
          label="สแกนล่าสุด"
          value={agoText(data?.lastScan?.scanned_at)}
          hint={data?.lastScan?.device_name ?? "—"}
          icon={ScanFace}
        />
        <StatCard
          label="คนในระบบ"
          value={data?.counts.people ?? 0}
          hint={`ใบหน้า ${data?.counts.faces ?? 0} รูป • รอประมวลผล ${data?.counts.facesPending ?? 0}`}
          icon={Users}
        />
        <StatCard
          label="ประวัติการสแกน"
          value={data?.counts.scans ?? 0}
          hint={`แจ้งเตือนค้าง ${data?.counts.openAlerts ?? 0} รายการ`}
          icon={Database}
          tone={(data?.counts.openAlerts ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanFace className="size-4" /> ตู้สแกนที่ลงทะเบียนไว้
          </CardTitle>
          <CardDescription>
            เครื่องจะรายงานตัวทุกครั้งที่ซิงก์ข้อมูล จึงเห็นได้ว่ายังทำงานอยู่หรือไม่
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เครื่อง</TableHead>
                  <TableHead>จุดติดตั้ง</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>ติดต่อล่าสุด</TableHead>
                  <TableHead>เวอร์ชันโปรแกรม</TableHead>
                  <TableHead>ระบบปฏิบัติการ</TableHead>
                  <TableHead>พื้นที่ว่าง</TableHead>
                  <TableHead>กล้อง / ประตู</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      ยังไม่มีตู้สแกนลงทะเบียน
                    </TableCell>
                  </TableRow>
                )}
                {devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.location ?? "—"}</TableCell>
                    <TableCell>
                      {!d.is_active ? (
                        <Badge variant="outline">ปิดใช้งาน</Badge>
                      ) : d.online ? (
                        <Badge className="gap-1">
                          <CheckCircle2 className="size-3" /> ออนไลน์
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <WifiOff className="size-3" /> ออฟไลน์
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{agoText(d.last_seen_at)}</TableCell>
                    <TableCell>{d.agent_version ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{d.platform ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {d.disk_free_mb == null ? (
                        "—"
                      ) : d.disk_free_mb < 1024 ? (
                        <span className="font-medium text-destructive">
                          {(d.disk_free_mb / 1024).toFixed(1)} GB
                        </span>
                      ) : (
                        `${(d.disk_free_mb / 1024).toFixed(1)} GB`
                      )}
                    </TableCell>
                    <TableCell className="space-x-1">
                      <Badge variant={d.camera_ok === false ? "destructive" : "outline"}>
                        กล้อง {d.camera_ok === false ? "ผิดปกติ" : d.camera_ok ? "ปกติ" : "—"}
                      </Badge>
                      <Badge variant={d.door_ok === false ? "destructive" : "outline"}>
                        ประตู {d.door_ok === false ? "ไม่พบ" : d.door_ok ? "ปกติ" : "—"}
                      </Badge>
                      {d.health_note ? (
                        <p className="mt-1 text-xs text-destructive">{d.health_note}</p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDriveDownload className="size-4" /> งานเบื้องหลัง
            </CardTitle>
            <CardDescription>สั่งให้ทำเดี๋ยวนี้ได้ นอกจากรอบอัตโนมัติ</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">ล้างข้อมูลเก่า</p>
                <p className="text-xs text-muted-foreground">
                  ลบรูปสแกนเกิน {data?.settings?.snapshot_retention_days ?? 90} วัน และประวัติเกิน{" "}
                  {data?.settings?.log_retention_days ?? 365} วัน • ล่าสุด{" "}
                  {whenText(data?.settings?.cleanup_last_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => runCleanup.mutate()}
                disabled={runCleanup.isPending}
              >
                <Trash2 className="size-4" /> ล้างเลย
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">ตรวจและส่งแจ้งเตือน</p>
                <p className="text-xs text-muted-foreground">
                  ขาด / สาย / ออกก่อนเวลา / สแกนไม่ผ่าน / ตู้ออฟไลน์ • ล่าสุด{" "}
                  {whenText(data?.settings?.notify_last_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => runNotify.mutate()}
                disabled={runNotify.isPending}
              >
                <BellRing className="size-4" /> ตรวจเลย
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">สำรองข้อมูล</p>
                <p className="text-xs text-muted-foreground">
                  ล่าสุด {whenText(data?.settings?.backup_last_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => runBackup.mutate()}
                disabled={runBackup.isPending}
              >
                <CloudDownload className="size-4" /> สำรองเลย
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">รายงานสรุป 7 วัน</p>
                <p className="text-xs text-muted-foreground">
                  ส่งให้ผู้รับแจ้งเตือนทุกคน • ล่าสุด {whenText(data?.settings?.weekly_report_last_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => runReport.mutate()}
                disabled={runReport.isPending}
              >
                <FileText className="size-4" /> ส่งรายงาน
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4" /> การแจ้งเตือนล่าสุด
            </CardTitle>
            <CardDescription>ผลการส่งอีเมลและ LINE 10 รายการหลังสุด</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.notifications ?? []).length === 0 && (
              <p className="py-6 text-center text-muted-foreground">ยังไม่มีการส่งแจ้งเตือน</p>
            )}
            {(data?.notifications ?? []).map((n, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border p-2.5">
                {n.status === "sent" ? (
                  <CheckCircle2 className="mt-0.5 size-4 text-primary" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {n.channel === "line" ? "LINE" : "อีเมล"} • {n.event}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {whenText(n.created_at)}
                    {n.error ? ` — ${n.error}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
