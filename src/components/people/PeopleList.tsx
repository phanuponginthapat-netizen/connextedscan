import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { personGroupLabel, personLabels, type PersonType } from "./people";
import { ImportPeopleDialog } from "./ImportPeopleDialog";

export function PeopleList({ personType }: { personType: PersonType }) {
  const L = personLabels[personType];
  const isStaff = personType === "staff";
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  // Filters used when picking who to enrol next: class/department and whether
  // the person already has a registered face.
  const [group, setGroup] = useState("all");
  const [faceState, setFaceState] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    student_code: "",
    full_name: "",
    nickname: "",
    class_room: "",
    department: "",
    position: "",
    guardian_phone: "",
    gender: "unspecified",
  });

  const { data: people } = useQuery({
    queryKey: ["people", personType],
    queryFn: async () => {
      const [{ data: rows, error }, { data: faces }] = await Promise.all([
        supabase.from("students").select("*").eq("person_type", personType).order("student_code"),
        supabase.from("student_faces").select("student_id, status"),
      ]);
      if (error) throw error;
      const avatarPaths = (rows ?? []).map((r) => r.avatar_path).filter(Boolean) as string[];
      const urlMap: Record<string, string> = {};
      if (avatarPaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("faces")
          .createSignedUrls(avatarPaths, 3600);
        (signed ?? []).forEach((item) => {
          if (item.path && item.signedUrl) urlMap[item.path] = item.signedUrl;
        });
      }
      return (rows ?? []).map((s) => ({
        ...s,
        avatarUrl: s.avatar_path ? (urlMap[s.avatar_path] ?? null) : null,
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
        class_room: isStaff ? null : form.class_room.trim() || null,
        department: isStaff ? form.department.trim() || null : null,
        position: isStaff ? form.position.trim() || null : null,
        guardian_phone: form.guardian_phone.trim() || null,
        gender: isStaff ? null : form.gender,
        person_type: personType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`เพิ่ม${L.title}แล้ว`);
      setOpen(false);
      setForm({
        student_code: "",
        full_name: "",
        nickname: "",
        class_room: "",
        department: "",
        position: "",
        guardian_phone: "",
        gender: "unspecified",
      });
      qc.invalidateQueries({ queryKey: ["people", personType] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = [
    ...new Set(
      (people ?? [])
        .map((s) => (isStaff ? s.department : s.class_room) ?? "")
        .filter((v) => v.trim().length > 0),
    ),
  ].sort();

  const filtered = (people ?? []).filter((s) => {
    const matchesTerm = `${s.student_code} ${s.full_name} ${s.class_room ?? ""} ${s.department ?? ""}`
      .toLowerCase()
      .includes(term.toLowerCase());
    const personGroup = (isStaff ? s.department : s.class_room) ?? "";
    const matchesGroup = group === "all" || personGroup === group;
    const matchesFaces =
      faceState === "all" ||
      (faceState === "none" ? s.readyFaces === 0 : s.readyFaces > 0);
    return matchesTerm && matchesGroup && matchesFaces;
  });

  const fields: { key: keyof typeof form; label: string }[] = isStaff
    ? [
        { key: "student_code", label: L.code },
        { key: "full_name", label: "ชื่อ-นามสกุล" },
        { key: "nickname", label: "ชื่อเล่น (ใช้ขานเสียง)" },
        { key: "department", label: "ฝ่าย/แผนก" },
        { key: "position", label: "ตำแหน่ง" },
        { key: "guardian_phone", label: L.extra },
      ]
    : [
        { key: "student_code", label: L.code },
        { key: "full_name", label: "ชื่อ-นามสกุล" },
        { key: "nickname", label: "ชื่อเล่น (ใช้ขานเสียง)" },
        { key: "class_room", label: L.group },
        { key: "guardian_phone", label: L.extra },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{L.title}</h1>
          <p className="text-sm text-muted-foreground">{L.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <ImportPeopleDialog personType={personType} label={L.title} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> {L.addNew}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{L.addNew}ใหม่</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              {!isStaff && (
                <div className="space-y-1.5">
                  <Label htmlFor="gender">เพศ</Label>
                  <Select value={form.gender} onValueChange={(gender) => setForm({ ...form, gender })}>
                    <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">ชาย</SelectItem>
                      <SelectItem value="female">หญิง</SelectItem>
                      <SelectItem value="unspecified">ไม่ระบุ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={L.searchPlaceholder}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={L.group} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L.group}: ทั้งหมด</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={faceState} onValueChange={setFaceState}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="สถานะใบหน้า" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ใบหน้า: ทั้งหมด</SelectItem>
            <SelectItem value="none">ยังไม่ลงทะเบียนใบหน้า</SelectItem>
            <SelectItem value="some">ลงทะเบียนใบหน้าแล้ว</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">พบ {filtered.length} รายชื่อ</p>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">{L.empty}</p>
          )}
          {filtered.map((s) => (
            <Link
              key={s.id}
              to={isStaff ? "/admin/staff/$id" : "/admin/students/$id"}
              params={{ id: s.id }}
              className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center gap-3">
                {s.avatarUrl ? (
                  <img
                    src={s.avatarUrl}
                    alt={`รูปโปรไฟล์ของ ${s.full_name}`}
                    loading="lazy"
                    className="size-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="size-10 rounded-full bg-muted" />
                )}
                <div>
                <p className="font-medium">
                  {s.full_name}{" "}
                  {s.nickname && <span className="text-muted-foreground">({s.nickname})</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.student_code} • {personGroupLabel(s)}
                  {!isStaff && ` • ${s.gender === "male" ? "ชาย" : s.gender === "female" ? "หญิง" : "ไม่ระบุเพศ"}`}
                </p>
                </div>
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
