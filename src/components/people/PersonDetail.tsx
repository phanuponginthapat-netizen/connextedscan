import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { personGroupLabel, personLabels, type PersonType } from "./people";

const POSES = [
  "มองตรงกล้อง",
  "หันหน้าไปทางซ้ายเล็กน้อย",
  "หันหน้าไปทางขวาเล็กน้อย",
  "ก้มหน้าลงเล็กน้อย",
  "ยิ้มมองตรงกล้อง",
];

export function PersonDetail({ id, personType }: { id: string; personType: PersonType }) {
  const L = personLabels[personType];
  const isStaff = personType === "staff";
  const basePath = isStaff ? "/admin/staff" : "/admin/students";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: person } = useQuery({
    queryKey: ["person", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: faces } = useQuery({
    queryKey: ["faces", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_faces")
        .select("id, image_path, status, source, error_message, created_at")
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const withUrls = await Promise.all(
        (data ?? []).map(async (f) => {
          const { data: signed } = await supabase.storage
            .from("faces")
            .createSignedUrl(f.image_path, 600);
          return { ...f, url: signed?.signedUrl ?? null };
        }),
      );
      return withUrls;
    },
    refetchInterval: 10000,
  });

  const addFace = useMutation({
    mutationFn: async ({ blob, source }: { blob: Blob; source: string }) => {
      const path = `${id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("faces")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("student_faces")
        .insert({ student_id: id, image_path: path, source, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faces", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeFace = useMutation({
    mutationFn: async (face: { id: string; image_path: string }) => {
      // Don't delete the file if it's also used as the profile photo.
      if (face.image_path !== person?.avatar_path) {
        await supabase.storage.from("faces").remove([face.image_path]);
      }
      const { error } = await supabase.from("student_faces").delete().eq("id", face.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faces", id] }),
  });

  const enrollAvatar = useMutation({
    mutationFn: async () => {
      if (!person?.avatar_path) throw new Error("ยังไม่มีรูปโปรไฟล์");
      const already = (faces ?? []).some(
        (f) => f.image_path === person.avatar_path && f.status !== "failed",
      );
      if (already) throw new Error("รูปโปรไฟล์นี้ถูกใช้ลงทะเบียนใบหน้าแล้ว");
      const { error } = await supabase
        .from("student_faces")
        .insert({ student_id: id, image_path: person.avatar_path, source: "profile", status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ส่งรูปโปรไฟล์ไปลงทะเบียนใบหน้าแล้ว รอตู้สแกนประมวลผล");
      qc.invalidateQueries({ queryKey: ["faces", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePerson = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase
        .from("students")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกข้อมูลแล้ว");
      qc.invalidateQueries({ queryKey: ["person", id] });
      qc.invalidateQueries({ queryKey: ["people", personType] });
    },
  });

  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar", id, person?.avatar_path],
    enabled: !!person?.avatar_path,
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("faces")
        .createSignedUrl(person!.avatar_path!, 3600);
      return data?.signedUrl ?? null;
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const path = `${id}/avatar-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("faces")
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;
      if (person?.avatar_path) {
        await supabase.storage.from("faces").remove([person.avatar_path]);
      }
      const { error } = await supabase
        .from("students")
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตรูปโปรไฟล์แล้ว");
      qc.invalidateQueries({ queryKey: ["person", id] });
      qc.invalidateQueries({ queryKey: ["avatar", id] });
      qc.invalidateQueries({ queryKey: ["people", personType] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = (faces ?? []).filter((f) => f.status === "ready").length;

  if (!person) return <p className="text-muted-foreground">กำลังโหลด…</p>;

  const fields: { key: string; label: string }[] = isStaff
    ? [
        { key: "full_name", label: "ชื่อ-นามสกุล" },
        { key: "nickname", label: "ชื่อเล่น (ใช้ขานเสียง)" },
        { key: "department", label: "ฝ่าย/แผนก" },
        { key: "position", label: "ตำแหน่ง" },
        { key: "guardian_phone", label: L.extra },
      ]
    : [
        { key: "full_name", label: "ชื่อ-นามสกุล" },
        { key: "nickname", label: "ชื่อเล่น (ใช้ขานเสียง)" },
        { key: "class_room", label: L.group },
        { key: "guardian_phone", label: L.extra },
      ];

  return (
    <div className="space-y-6">
      <Link
        to={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> กลับรายชื่อ{L.title}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Label
            htmlFor="avatar-upload"
            className="group relative block size-20 shrink-0 cursor-pointer overflow-hidden rounded-full border"
            title="คลิกเพื่อเปลี่ยนรูปโปรไฟล์"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`รูปโปรไฟล์ของ ${person.full_name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                <Camera className="size-6" />
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              เปลี่ยนรูป
            </span>
          </Label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar.mutate(file);
              e.target.value = "";
            }}
          />
          <div>
            <h1 className="text-2xl font-semibold">{person.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {person.student_code} • {personGroupLabel(person)} • คลิกที่รูปเพื่อเปลี่ยนรูปโปรไฟล์
            </p>
          </div>
        </div>
        <Badge variant={ready > 0 ? "default" : "destructive"}>
          {ready > 0 ? `พร้อมใช้งาน ${ready} ชุด` : "ยังผ่านตู้สแกนไม่ได้"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูล{L.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                defaultValue={(person as unknown as Record<string, string | null>)[f.key] ?? ""}
                onBlur={(e) => savePerson.mutate({ [f.key]: e.target.value || null })}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={person.is_active}
              onCheckedChange={(v) => savePerson.mutate({ is_active: v })}
            />
            <span className="text-sm">เปิดใช้งานให้ผ่านตู้สแกน</span>
          </div>
          <div className="flex items-end justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm(L.deleteConfirm)) return;
                await supabase.from("students").delete().eq("id", id);
                navigate({ to: basePath });
              }}
            >
              <Trash2 className="size-4" /> ลบ{L.title}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <LiveCapture onCapture={(blob) => addFace.mutate({ blob, source: "liveness" })} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">อัปโหลดรูปภาพ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              เลือกได้หลายรูปพร้อมกัน ควรเป็นรูปหน้าตรงชัด ๆ อย่างน้อย 3 รูปต่างมุม
            </p>
            <Label
              htmlFor="file"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground hover:bg-muted/50"
            >
              <Upload className="size-5" /> คลิกเพื่อเลือกไฟล์รูป
            </Label>
            <input
              id="file"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                for (const file of files) {
                  await addFace.mutateAsync({ blob: file, source: "upload" });
                }
                if (files.length) toast.success(`อัปโหลด ${files.length} รูปแล้ว`);
                e.target.value = "";
              }}
            />
            {person.avatar_path && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={enrollAvatar.isPending}
                onClick={() => enrollAvatar.mutate()}
              >
                {enrollAvatar.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                ใช้รูปโปรไฟล์ลงทะเบียนใบหน้า
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">รูปที่ลงทะเบียนไว้</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            รูปจะขึ้นสถานะ “รอประมวลผล” จนกว่าเครื่องตู้สแกนจะดึงไปคำนวณใบหน้าด้วย ArcFace
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(faces ?? []).map((f) => (
              <div key={f.id} className="overflow-hidden rounded-xl border">
                {f.url ? (
                  <img
                    src={f.url}
                    alt={`ใบหน้าของ ${person.full_name}`}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-muted" />
                )}
                <div className="flex items-center justify-between gap-2 p-2">
                  <Badge
                    variant={
                      f.status === "ready"
                        ? "default"
                        : f.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {f.status === "ready"
                      ? "พร้อมใช้"
                      : f.status === "failed"
                        ? "ใช้ไม่ได้"
                        : "รอประมวลผล"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeFace.mutate({ id: f.id, image_path: f.image_path })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {(faces ?? []).length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                ยังไม่มีรูปใบหน้า
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LiveCapture({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {
        toast.error("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้อง");
        setActive(false);
      });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [active]);

  async function shoot() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (blob) {
      onCapture(blob);
      toast.success(`บันทึกท่าที่ ${step + 1} แล้ว`);
      setStep((s) => Math.min(s + 1, POSES.length - 1));
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ถ่ายสด (ตรวจหลายมุม)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full scale-x-[-1] object-cover"
          />
          {!active && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button onClick={() => setActive(true)}>
                <Camera className="size-4" /> เปิดกล้อง
              </Button>
            </div>
          )}
        </div>
        {active && (
          <>
            <p className="rounded-lg bg-secondary px-4 py-3 text-center text-sm font-medium">
              ท่าที่ {step + 1}/{POSES.length}: {POSES[step]}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={shoot} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{" "}
                ถ่ายรูปท่านี้
              </Button>
              <Button variant="secondary" onClick={() => setActive(false)}>
                ปิดกล้อง
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
