import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Settings2, User, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/kiosk")({
  head: () => ({
    meta: [
      { title: "ตู้สแกนใบหน้า | FaceGate" },
      { name: "description", content: "หน้าจอตู้สแกนใบหน้าเข้า-ออกโรงเรียน พร้อมเสียงขานชื่อภาษาไทย" },
      { property: "og:title", content: "ตู้สแกนใบหน้า | FaceGate" },
      { property: "og:description", content: "หน้าจอตู้สแกนใบหน้าเข้า-ออกโรงเรียนพร้อมเสียงขานชื่อ" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Kiosk,
});

type ScanResult = {
  result: "ok" | "duplicate" | "denied" | "multiple_faces" | "unknown";
  message: string;
  speak?: string;
  next_delay_seconds?: number;
  student?: { full_name: string; class_room: string | null; student_code: string } | null;
  direction?: "in" | "out";
  avatar_url?: string | null;
};

type GuideState = "idle" | "no_face" | "multiple_faces" | "scanning";

const AGENT_KEY = "facegate_agent_url";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "th-TH";
  utter.rate = 1;
  const thai = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("th"));
  if (thai) utter.voice = thai;
  window.speechSynthesis.speak(utter);
}

function Kiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:8899");
  const [showConfig, setShowConfig] = useState(false);
  const [status, setStatus] = useState<"idle" | "scanning" | "cooldown">("idle");
  const [guide, setGuide] = useState<GuideState>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [knownFaces, setKnownFaces] = useState<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(AGENT_KEY);
    if (saved) setAgentUrl(saved);
    window.speechSynthesis?.getVoices();
  }, []);

  // Is the face-recognition program on this PC reachable?
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${agentUrl.replace(/\/$/, "")}/health`);
        const data = (await res.json()) as { ok?: boolean; known_faces?: number };
        if (cancelled) return;
        setAgentOnline(!!data.ok);
        setKnownFaces(data.known_faces ?? null);
      } catch {
        if (!cancelled) {
          setAgentOnline(false);
          setKnownFaces(null);
        }
      }
    };
    check();
    const t = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [agentUrl]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องแล้วรีเฟรชหน้าจอ"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const scanOnce = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || busyRef.current) return;
    busyRef.current = true;
    setStatus("scanning");
    setGuide("scanning");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const res = await fetch(`${agentUrl.replace(/\/$/, "")}/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = (await res.json()) as Omit<ScanResult, "result"> & { result?: string };
      if (!data.result || data.result === "no_face") {
        setGuide("no_face");
        setStatus("idle");
        busyRef.current = false;
        return;
      }
      if (data.result === "multiple_faces") {
        setGuide("multiple_faces");
      }
      setResult(data as unknown as ScanResult);
      if (data.speak) speak(data.speak);
      const delay = data.next_delay_seconds ?? 3;
      setStatus("cooldown");
      setCountdown(delay);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            setResult(null);
            setGuide("idle");
            setStatus("idle");
            busyRef.current = false;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch {
      setAgentOnline(false);
      setGuide("idle");
      setStatus("idle");
      busyRef.current = false;
    }
  }, [agentUrl]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!busyRef.current) scanOnce();
    }, 1200);
    return () => clearInterval(interval);
  }, [scanOnce]);

  const tone =
    result?.result === "ok"
      ? "border-primary bg-primary/10"
      : result?.result === "duplicate"
        ? "border-accent bg-accent/10"
        : "border-destructive bg-destructive/10";

  const guideColor =
    guide === "multiple_faces"
      ? "border-destructive text-destructive"
      : guide === "no_face"
        ? "border-muted-foreground text-muted-foreground"
        : "border-primary text-primary";

  return (
    <main className="kiosk-bg flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">ระบบสแกนใบหน้าเข้า-ออกโรงเรียน</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ยืนให้ใบหน้าอยู่ในกรอบคนเดียว ระบบจะขานชื่อเมื่อสแกนสำเร็จ
        </p>
      </header>

      {agentOnline === false && (
        <div className="w-full max-w-2xl rounded-2xl border-2 border-destructive bg-destructive/10 p-4 text-center text-sm">
          <p className="font-semibold text-destructive">ยังไม่ได้เชื่อมต่อโปรแกรมตรวจใบหน้าบนเครื่องนี้</p>
          <p className="mt-1 text-muted-foreground">
            หน้าจอนี้เป็นแค่กล้องกับหน้าจอแสดงผล การตรวจจับใบหน้าทำงานโดยโปรแกรมที่ติดตั้งบนตู้สแกน
            กรุณาเปิดโปรแกรมนั้นก่อน แล้วหน้านี้จะเริ่มสแกนเองอัตโนมัติ ({agentUrl})
          </p>
        </div>
      )}
      {agentOnline === true && knownFaces === 0 && (
        <div className="w-full max-w-2xl rounded-2xl border-2 border-accent bg-accent/10 p-4 text-center text-sm">
          เชื่อมต่อโปรแกรมแล้ว แต่ยังไม่มีข้อมูลใบหน้าที่พร้อมใช้งาน กรุณาลงทะเบียนใบหน้าในหลังบ้านก่อน
        </div>
      )}



      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border shadow-panel">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full scale-x-[-1] bg-muted object-cover"
        />

        {/* Single-person face guide overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div
            className={`flex aspect-[3/4] w-1/2 max-w-[260px] items-center justify-center rounded-[50%] border-4 border-dashed ${guideColor} transition-colors duration-300`}
          >
            <User className={`size-16 opacity-40 ${guide === "scanning" ? "animate-pulse" : ""}`} />
          </div>
        </div>

        {/* Guide status badge */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm shadow">
          {status === "scanning" && !result && (
            <>
              <Loader2 className="size-4 animate-spin text-primary" /> กำลังตรวจใบหน้า…
            </>
          )}
          {guide === "no_face" && status !== "scanning" && !result && (
            <span className="text-muted-foreground">ไม่พบใบหน้าในกรอบ</span>
          )}
          {guide === "multiple_faces" && !result && (
            <span className="text-destructive">พบหลายใบหน้า กรุณาเข้ามาคนเดียว</span>
          )}
          {(guide === "idle" || (result && status === "cooldown")) && !result && (
            <span className="text-primary">ยืนให้ใบหน้าอยู่ในกรอบคนเดียว</span>
          )}
        </div>

        {camError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-sm text-destructive">
            {camError}
          </div>
        )}
      </div>

      <div className={`w-full max-w-2xl rounded-2xl border-2 p-6 text-center ${result ? tone : "border-dashed"}`}>
        {!result && <p className="text-muted-foreground">รอสแกนคนถัดไป…</p>}
        {result && (
          <div className="space-y-2">
            {result.avatar_url && (
              <img
                src={result.avatar_url}
                alt={result.student ? `รูปของ ${result.student.full_name}` : "รูปโปรไฟล์"}
                className="mx-auto size-24 rounded-full border-4 border-primary/40 object-cover shadow"
              />
            )}
            <div className="flex items-center justify-center gap-2">
              {result.result === "ok" ? (
                <CheckCircle2 className="size-7 text-primary" />
              ) : (
                <XCircle className="size-7 text-destructive" />
              )}
              <p className="text-2xl font-semibold">{result.message}</p>
            </div>
            {result.student && (
              <p className="text-sm text-muted-foreground">
                {result.student.student_code} • {result.student.class_room ?? "-"}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              คนถัดไปในอีก {countdown} วินาที
            </p>
          </div>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
        <Settings2 className="size-4" /> ตั้งค่าเครื่อง
      </Button>
      {showConfig && (
        <div className="w-full max-w-sm space-y-2 rounded-xl border p-4">
          <Label>ที่อยู่โปรแกรมบนเครื่องนี้</Label>
          <Input
            value={agentUrl}
            onChange={(e) => {
              setAgentUrl(e.target.value);
              localStorage.setItem(AGENT_KEY, e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            ค่าเริ่มต้นคือ http://127.0.0.1:8899 ตามโปรแกรมที่ติดตั้งบนตู้สแกน
          </p>
        </div>
      )}
    </main>
  );
}
