import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, Save, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FaceMeasurement } from "@/lib/face-web";
import { FaceBoxOverlay } from "./FaceBoxOverlay";
import { scoreFace, type FaceQuality } from "./face-quality";
import { personGroupLabel, personLabels, type PersonType } from "./people";

const POSES = [
  "มองตรงกล้อง",
  "หันหน้าไปทางซ้ายเล็กน้อย",
  "หันหน้าไปทางขวาเล็กน้อย",
  "ก้มหน้าลงเล็กน้อย",
  "ยิ้มมองตรงกล้อง",
];

type CapturePayload = { blob: Blob; source: string; face?: FaceMeasurement; quality?: number };

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
        .select("id, image_path, status, source, error_message, quality, created_at")
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
    mutationFn: async ({ blob, source, face, quality }: CapturePayload) => {
      const path = `${id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("faces")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("student_faces").insert({
        student_id: id,
        image_path: path,
        source,
        // Measured right here in the browser, so scanning works without the
        // FaceGate program installed.
        status: face ? "ready" : "pending",
        quality: quality ?? null,
        web_embedding: face?.descriptor ?? null,
        web_geometry: face?.geometry ?? null,
        processed_at: face ? new Date().toISOString() : null,
      });
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

      // Measure the profile photo in the browser so it is usable right away.
      const { data: signed } = await supabase.storage
        .from("faces")
        .createSignedUrl(person.avatar_path, 600);
      let face: { descriptor: number[]; geometry: Record<string, number> } | null = null;
      if (signed?.signedUrl) {
        const { measureImageUrl } = await import("@/lib/face-web");
        const outcome = await measureImageUrl(signed.signedUrl);
        if (outcome.status === "multiple_faces") throw new Error("รูปโปรไฟล์มีหลายใบหน้า");
        if (outcome.status === "no_face") throw new Error("ไม่พบใบหน้าในรูปโปรไฟล์");
        face = { descriptor: outcome.face.descriptor, geometry: outcome.face.geometry };
      }

      const { error } = await supabase.from("student_faces").insert({
        student_id: id,
        image_path: person.avatar_path,
        source: "profile",
        status: face ? "ready" : "pending",
        web_embedding: face?.descriptor ?? null,
        web_geometry: face?.geometry ?? null,
        processed_at: face ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลงทะเบียนใบหน้าจากรูปโปรไฟล์แล้ว ใช้สแกนได้ทันที");
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

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!person) return;
    const rec = person as unknown as Record<string, string | null>;
    setForm(Object.fromEntries(fields.map((f) => [f.key, rec[f.key] ?? ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  const ready = (faces ?? []).filter((f) => f.status === "ready").length;

  if (!person) return <p className="text-muted-foreground">กำลังโหลด…</p>;

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
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
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
          <div className="flex items-end justify-end gap-2">
            <Button
              disabled={savePerson.isPending}
              onClick={() =>
                savePerson.mutate(
                  Object.fromEntries(fields.map((f) => [f.key, form[f.key]?.trim() || null])),
                )
              }
            >
              {savePerson.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              บันทึกข้อมูล
            </Button>
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
        <LiveCapture onCapture={(payload) => addFace.mutateAsync(payload)} />
        <PhotoUpload
          onCapture={(payload) => addFace.mutateAsync(payload)}
          canUseAvatar={!!person.avatar_path}
          enrolling={enrollAvatar.isPending}
          onUseAvatar={() => enrollAvatar.mutate()}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">รูปที่ลงทะเบียนไว้</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            รูปที่ผ่านการจับใบหน้าแล้วจะใช้กับโหมดเว็บได้ทันที และจะขึ้น “พร้อมใช้”
            เมื่อเครื่องตู้สแกนคำนวณด้วย ArcFace เสร็จ
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
                <div className="space-y-1 p-2">
                  <div className="flex items-center justify-between gap-2">
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
                  {typeof f.quality === "number" && (
                    <div className="space-y-1">
                      <Progress value={Math.round(f.quality * 100)} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">
                        คุณภาพใบหน้า {Math.round(f.quality * 100)}%
                      </p>
                    </div>
                  )}
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

function QualityPanel({ quality }: { quality: FaceQuality }) {
  const tone =
    quality.percent >= 75 ? "text-primary" : quality.percent >= 55 ? "text-accent" : "text-destructive";
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>คุณภาพใบหน้าที่จับได้</span>
        <span className={`font-semibold ${tone}`}>{quality.percent}%</span>
      </div>
      <Progress value={quality.percent} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {quality.details.map((d) => (
          <div key={d.label} className="flex justify-between gap-2">
            <span>{d.label}</span>
            <span className="text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
      {quality.hints.length > 0 && (
        <p className="text-xs text-accent-foreground">คำแนะนำ: {quality.hints.join(" • ")}</p>
      )}
    </div>
  );
}

function LiveCapture({ onCapture }: { onCapture: (p: CapturePayload) => Promise<unknown> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [detection, setDetection] = useState<
    | { status: "no_face" }
    | { status: "multiple_faces"; count: number; boxes: { x: number; y: number; width: number; height: number }[]; frame: { width: number; height: number } }
    | { status: "ok"; face: FaceMeasurement; quality: FaceQuality }
    | null
  >(null);

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

  // Continuously show where the face is, so the operator can see it is found.
  useEffect(() => {
    if (!active) {
      setDetection(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      try {
        const { measureSingleFace } = await import("@/lib/face-web");
        if (!cancelled) setModelReady(true);
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const outcome = await measureSingleFace(video);
          if (!cancelled) {
            setDetection(
              outcome.status === "ok"
                ? { status: "ok", face: outcome.face, quality: scoreFace(outcome.face) }
                : outcome,
            );
          }
        }
      } catch {
        /* keep trying */
      }
      if (!cancelled) timer = setTimeout(loop, 500);
    };
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || detection?.status !== "ok") return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (blob) {
        await onCapture({
          blob,
          source: "liveness",
          face: detection.face,
          quality: detection.quality.percent / 100,
        });
        toast.success(`บันทึกท่าที่ ${step + 1} แล้ว (คุณภาพ ${detection.quality.percent}%)`);
        setStep((s) => Math.min(s + 1, POSES.length - 1));
      }
    } finally {
      setBusy(false);
    }
  }, [detection, onCapture, step]);

  const boxes =
    detection?.status === "ok"
      ? [detection.face.box]
      : detection?.status === "multiple_faces"
        ? detection.boxes
        : [];
  const frame =
    detection?.status === "ok"
      ? detection.face.frame
      : detection?.status === "multiple_faces"
        ? detection.frame
        : { width: 0, height: 0 };

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
          <FaceBoxOverlay
            boxes={boxes}
            frame={frame}
            mirrored
            tone={detection?.status === "ok" ? "ok" : "bad"}
            label={
              detection?.status === "ok"
                ? `จับใบหน้าได้ ${detection.quality.percent}%`
                : detection?.status === "multiple_faces"
                  ? `พบ ${detection.count} ใบหน้า`
                  : undefined
            }
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
            {!modelReady && (
              <p className="text-center text-sm text-muted-foreground">กำลังเตรียมตัวจับใบหน้า…</p>
            )}
            {detection?.status === "no_face" && (
              <p className="text-center text-sm text-destructive">ยังไม่พบใบหน้าในกรอบ</p>
            )}
            {detection?.status === "multiple_faces" && (
              <p className="text-center text-sm text-destructive">
                พบหลายใบหน้า กรุณาให้อยู่หน้ากล้องคนเดียว
              </p>
            )}
            {detection?.status === "ok" && <QualityPanel quality={detection.quality} />}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={shoot}
                disabled={busy || detection?.status !== "ok"}
              >
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

function PhotoUpload({
  onCapture,
  canUseAvatar,
  enrolling,
  onUseAvatar,
}: {
  onCapture: (p: CapturePayload) => Promise<unknown>;
  canUseAvatar: boolean;
  enrolling: boolean;
  onUseAvatar: () => void;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<
    | {
        url: string;
        boxes: { x: number; y: number; width: number; height: number }[];
        frame: { width: number; height: number };
        ok: boolean;
        note: string;
        quality: FaceQuality | null;
      }
    | null
  >(null);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    const { measureSingleFace } = await import("@/lib/face-web");
    let ok = 0;
    let skipped = 0;
    setProgress({ done: 0, total: files.length, label: "กำลังตรวจใบหน้าในรูป…" });

    for (const [i, file] of files.entries()) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        setProgress({ done: i, total: files.length, label: `กำลังตรวจรูปที่ ${i + 1}` });
        const outcome = await measureSingleFace(img);
        const frame = { width: img.naturalWidth, height: img.naturalHeight };

        if (outcome.status === "ok") {
          const quality = scoreFace(outcome.face);
          setPreview({
            url,
            boxes: [outcome.face.box],
            frame,
            ok: true,
            note: `จับใบหน้าได้ คุณภาพ ${quality.percent}%`,
            quality,
          });
          setProgress({ done: i, total: files.length, label: `กำลังบันทึกรูปที่ ${i + 1}` });
          await onCapture({
            blob: file,
            source: "upload",
            face: outcome.face,
            quality: quality.percent / 100,
          });
          ok += 1;
        } else {
          setPreview({
            url,
            boxes: outcome.status === "multiple_faces" ? outcome.boxes : [],
            frame: outcome.status === "multiple_faces" ? outcome.frame : frame,
            ok: false,
            note:
              outcome.status === "multiple_faces"
                ? `รูปนี้มี ${outcome.count} ใบหน้า จึงไม่นำไปใช้`
                : "รูปนี้จับใบหน้าไม่ได้ จึงไม่นำไปใช้",
            quality: null,
          });
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
      setProgress({ done: i + 1, total: files.length, label: "กำลังประมวลผล…" });
    }

    setProgress(null);
    if (ok) toast.success(`ใช้ได้ ${ok} รูป`);
    if (skipped) toast.error(`ข้าม ${skipped} รูป เพราะจับใบหน้าไม่ได้หรือมีหลายคน`);
  }

  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">อัปโหลดรูปภาพ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          เลือกได้หลายรูปพร้อมกัน ระบบจะตรวจว่าจับใบหน้าได้จริงก่อนบันทึก ควรใช้อย่างน้อย 3 รูปต่างมุม
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
            e.target.value = "";
            await handleFiles(files);
          }}
        />

        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.label}</span>
              <span>
                {percent}% ({progress.done}/{progress.total})
              </span>
            </div>
            <Progress value={percent} />
          </div>
        )}

        {preview && (
          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-xl border">
              <img src={preview.url} alt="รูปที่กำลังตรวจใบหน้า" className="w-full object-contain" />
              <FaceBoxOverlay
                boxes={preview.boxes}
                frame={preview.frame}
                tone={preview.ok ? "ok" : "bad"}
                label={preview.ok ? "จับใบหน้าได้" : "ไม่ผ่าน"}
              />
            </div>
            <p className={`text-sm ${preview.ok ? "text-primary" : "text-destructive"}`}>
              {preview.note}
            </p>
            {preview.quality && <QualityPanel quality={preview.quality} />}
          </div>
        )}

        {canUseAvatar && (
          <Button variant="secondary" className="w-full" disabled={enrolling} onClick={onUseAvatar}>
            {enrolling ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            ใช้รูปโปรไฟล์ลงทะเบียนใบหน้า
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
