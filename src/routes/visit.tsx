import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Camera, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/visit")({
  head: () => ({
    meta: [
      { title: "ลงทะเบียนผู้มาเยือน | FaceGate" },
      {
        name: "description",
        content: "ลงทะเบียนเข้าโรงเรียนสำหรับผู้มาเยือนและบุคลากรภายนอก ถ่ายภาพใบหน้าเพื่อใช้สแกนเข้าโรงเรียน",
      },
      { property: "og:title", content: "ลงทะเบียนผู้มาเยือน | FaceGate" },
      {
        property: "og:description",
        content: "กรอกข้อมูลและถ่ายภาพใบหน้าเพื่อเข้าโรงเรียนในวันนี้",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisitRegister,
});

type Status = { enabled: boolean; school_name: string } | null;

function VisitRegister() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [form, setForm] = useState({
    full_name: "",
    gender: "male",
    affiliation: "",
    reason: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [camError, setCamError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; full_name: string } | null>(null);

  useEffect(() => {
    void fetch("/api/public/visit/status")
      .then((r) => r.json())
      .then((body: Status) => setStatus(body))
      .catch(() => setStatus({ enabled: false, school_name: "" }));
  }, []);

  useEffect(() => {
    if (done) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [done]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    const scale = video.videoWidth > 640 ? 640 / video.videoWidth : 1;
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
  }, []);

  const submit = useCallback(async () => {
    setError("");
    if (form.full_name.trim().length < 2) return setError("กรุณากรอกชื่อ-นามสกุล");
    if (form.affiliation.trim() === "") return setError("กรุณากรอกสังกัดหรืออาชีพ");
    if (form.reason.trim().length < 2) return setError("กรุณากรอกเหตุผลในการเข้าโรงเรียน");
    if (!photo) return setError("กรุณาถ่ายภาพใบหน้า");

    setBusy(true);
    let descriptor: number[] | undefined;
    try {
      const img = new Image();
      img.src = photo;
      await img.decode();
      const { measureSingleFace } = await import("@/lib/face-web");
      const outcome = await measureSingleFace(img);
      if (outcome.status === "multiple_faces") {
        setBusy(false);
        return setError("พบใบหน้าหลายคนในภาพ กรุณาถ่ายใหม่ให้มีเฉพาะใบหน้าของท่าน");
      }
      if (outcome.status === "no_face") {
        setBusy(false);
        return setError("ไม่พบใบหน้าในภาพ กรุณาถ่ายใหม่ให้เห็นใบหน้าชัดเจน");
      }
      descriptor = outcome.face.descriptor;
    } catch {
      descriptor = undefined;
    }

    try {
      const res = await fetch("/api/public/visit/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          gender: form.gender,
          affiliation: form.affiliation.trim(),
          reason: form.reason.trim(),
          photo,
          descriptor,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; code?: string; full_name?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่");
      } else {
        setDone({ code: body.code ?? "", full_name: body.full_name ?? form.full_name });
      }
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    }
    setBusy(false);
  }, [form, photo]);

  if (status && !status.enabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="font-display text-2xl font-bold">ยังไม่เปิดรับลงทะเบียน</h1>
          <p className="mt-3 text-muted-foreground">
            ขณะนี้โหมดผู้มาเยือนปิดอยู่ กรุณาติดต่อเจ้าหน้าที่ที่จุดประชาสัมพันธ์
          </p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <h1 className="mt-4 font-display text-2xl font-bold">ลงทะเบียนสำเร็จ</h1>
          <p className="mt-2 text-lg font-semibold">{done.full_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">รหัสผู้มาเยือน {done.code}</p>
          <p className="mt-4 rounded-xl bg-muted p-4 text-sm">
            กรุณาไปที่ตู้สแกนใบหน้าเพื่อสแกนเข้าโรงเรียน สิทธิ์นี้ใช้ได้เฉพาะวันนี้เท่านั้น
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg space-y-5">
        <header className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-7" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold">ลงทะเบียนผู้มาเยือน</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {status?.school_name || "โรงเรียนของเรา"} • สำหรับบุคลากรภายนอกและผู้มาเยือน
          </p>
        </header>

        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div>
            <Label htmlFor="v_name">ชื่อ-นามสกุล</Label>
            <Input
              id="v_name"
              maxLength={120}
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="v_gender">เพศ</Label>
            <select
              id="v_gender"
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="male">ชาย</option>
              <option value="female">หญิง</option>
              <option value="other">ไม่ระบุ</option>
            </select>
          </div>
          <div>
            <Label htmlFor="v_aff">สังกัดหรืออาชีพ</Label>
            <Input
              id="v_aff"
              maxLength={120}
              value={form.affiliation}
              onChange={(e) => setForm((f) => ({ ...f, affiliation: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="v_reason">เหตุผลในการเข้าโรงเรียน</Label>
            <Textarea
              id="v_reason"
              maxLength={300}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <Label>ภาพใบหน้าสำหรับสแกนเข้าโรงเรียน</Label>
          <div className="overflow-hidden rounded-xl bg-camera">
            {photo ? (
              <img src={photo} alt="ภาพใบหน้าที่ถ่ายไว้" className="w-full object-cover" />
            ) : (
              <video ref={videoRef} autoPlay muted playsInline className="w-full" />
            )}
          </div>
          {camError && <p className="text-sm text-destructive">{camError}</p>}
          <div className="flex gap-2">
            {photo ? (
              <Button variant="secondary" className="flex-1" onClick={() => setPhoto(null)}>
                ถ่ายใหม่
              </Button>
            ) : (
              <Button className="flex-1" onClick={takePhoto}>
                <Camera className="mr-2 size-4" /> ถ่ายภาพใบหน้า
              </Button>
            )}
          </div>
        </div>

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <Button className="w-full" size="lg" disabled={busy} onClick={() => void submit()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          ลงทะเบียนเข้าโรงเรียน
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          ข้อมูลและภาพใบหน้าใช้สำหรับการเข้าโรงเรียนในวันนี้เท่านั้น
        </p>
      </div>
    </main>
  );
}
