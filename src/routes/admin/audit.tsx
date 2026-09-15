import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "บันทึกการใช้งานหลังบ้าน | FaceGate" },
      {
        name: "description",
        content:
          "ตรวจสอบว่าใครแก้ไขการตั้งค่า ลบประวัติการสแกน หรือสั่งงานเครื่อง เมื่อไร ในระบบหลังบ้าน",
      },
      { property: "og:title", content: "บันทึกการใช้งานหลังบ้าน | FaceGate" },
      {
        property: "og:description",
        content: "ประวัติการแก้ไขและการสั่งงานของผู้ดูแลระบบสแกนใบหน้า",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function whenText(value: string) {
  return new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("audit_logs")
        .select("id, actor_email, action, target, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return rows ?? [];
    },
    refetchInterval: 30_000,
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="size-6 text-primary" /> บันทึกการใช้งานหลังบ้าน
        </h1>
        <p className="text-sm text-muted-foreground">
          ทุกการแก้ไขการตั้งค่า การลบประวัติ และการสั่งงานเครื่อง จะถูกบันทึกไว้ที่นี่
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" /> 200 รายการล่าสุด
          </CardTitle>
          <CardDescription>เรียงจากใหม่ไปเก่า</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เวลา</TableHead>
                  <TableHead>ผู้ใช้งาน</TableHead>
                  <TableHead>การกระทำ</TableHead>
                  <TableHead>รายละเอียด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "กำลังโหลด…" : "ยังไม่มีบันทึกการใช้งาน"}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {whenText(row.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.actor_email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.action}</Badge>
                      {row.target && (
                        <span className="ml-2 text-xs text-muted-foreground">{row.target}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate text-muted-foreground">
                      {row.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
