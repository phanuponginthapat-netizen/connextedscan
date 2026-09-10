import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/students/")({
  head: () => ({
    meta: [
      { title: "รายชื่อนักเรียน | FaceGate" },
      { name: "description", content: "จัดการรายชื่อนักเรียนและสถานะการลงทะเบียนใบหน้า" },
      { property: "og:title", content: "รายชื่อนักเรียน | FaceGate" },
      { property: "og:description", content: "จัดการรายชื่อนักเรียนและการลงทะเบียนใบหน้า" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentsPage,
});

function StudentsPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    student_code: "",
    full_name: "",
    nickname: "",
    class_room: "",
    guardian_phone: "",
  });

  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const [{ data: rows, error }, { data: faces }] = await Promise.all([
        supabase.from("students").select("*").order("student_code"),
        supabase.from("student_faces").select("student_id, status"),
      ]);
      if (error) throw error;
      return (rows ?? []).map((s) => ({
        ...s,
        readyFaces: (faces ?? []).filter((f) => f.student_id === s.id && f.status === "ready")
          .length,
      }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("students").insert({
        student_code: form.student_code.trim(),
        full_name: form.full_name.trim(),
        nickname: form.nickname.trim() || null,
        class_room: form.class_room.trim() || null,
        guardian_phone: form.guardian_phone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("เพิ่มนักเรียนแล้ว");
      setOpen(false);
      setForm({ student_code: "", full_name: "", nickname: "", class_room: "", guardian_phone: "" });
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (students ?? []).filter((s) =>
    `${s.student_code} ${s.full_name} ${s.class_room ?? ""}`.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">นักเรียน</h1>
          <p className="text-sm text-muted-foreground">
            เฉพาะนักเรียนที่ลงทะเบียนใบหน้าแล้วเท่านั้นที่ผ่านตู้สแกนได้
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> เพิ่มนักเรียน
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>เพิ่มนักเรียนใหม่</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {[
                { key: "student_code", label: "รหัสนักเรียน" },
                { key: "full_name", label: "ชื่อ-นามสกุล" },
                { key: "nickname", label: "ชื่อเล่น (ใช้ขานเสียง)" },
                { key: "class_room", label: "ชั้น/ห้อง" },
                { key: "guardian_phone", label: "เบอร์ผู้ปกครอง" },
              ].map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    value={form[f.key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                onClick={() => create.mutate()}
                disabled={!form.student_code || !form.full_name || create.isPending}
              >
                บันทึก
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="ค้นหาชื่อ รหัส หรือห้อง"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลนักเรียน</p>
          )}
          {filtered.map((s) => (
            <Link
              key={s.id}
              to="/admin/students/$id"
              params={{ id: s.id }}
              className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/60"
            >
              <div>
                <p className="font-medium">
                  {s.full_name}{" "}
                  {s.nickname && <span className="text-muted-foreground">({s.nickname})</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.student_code} • {s.class_room ?? "ไม่ระบุห้อง"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!s.is_active && <Badge variant="outline">ระงับ</Badge>}
                <Badge variant={s.readyFaces > 0 ? "default" : "destructive"}>
                  {s.readyFaces > 0 ? `ใบหน้า ${s.readyFaces} ชุด` : "ยังไม่ลงทะเบียน"}
                </Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
