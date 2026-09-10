import { useCallback, useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Settings2, User, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCms } from "@/lib/cms-client";

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
  snapshot_url?: string | null;
};

type RecentScan = {
  id: string;
  name: string;
  detail: string;
  direction: "in" | "out";
  time: string;
  avatarUrl: string | null;
  snapshotUrl: string | null;
};

type GuideState = "idle" | "no_face" | "multiple_faces" | "scanning";

const AGENT_KEY = "facegate_agent_url";

function Kiosk() {
  const { t } = useCms();
  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const lastShotRef = useRef<string | null>(null);
  const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:8899");
  const [showConfig, setShowConfig] = useState(false);
  const [status, setStatus] = useState<"idle" | "scanning" | "cooldown">("idle");
  const [guide, setGuide] = useState<GuideState>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [knownFaces, setKnownFaces] = useState<number | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const thaiVoice = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("th")) ?? null;
  };

  // Play a sentence through the cloud voice service. Needed on machines with
  // no Thai system voice, such as the FaceGate desktop app on Windows.
  const speakViaServer = useCallback(async (text: string) => {
    const res = await fetch("/api/public/kiosk/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("tts failed");
    const blob = await res.blob();
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  }, []);

  // Browsers block spoken audio until the person interacts with the page.
  const enableVoice = useCallback(() => {
    if (typeof window === "undefined") return;
    // Unlock the shared audio element with the user gesture.
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.muted = true;
    audio.src =
      "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVMRMYMSAAAA0gAAABEVEQU1FMy45OS41VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";
    void audio.play().catch(() => {});
    audio.muted = false;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const warm = new SpeechSynthesisUtterance("เปิดเสียงเรียบร้อย");
      warm.lang = "th-TH";
      const v = thaiVoice();
      if (v) {
        warm.voice = v;
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(warm);
      }
    }
    if (!thaiVoice()) void speakViaServer("เปิดเสียงเรียบร้อย").catch(() => {});
    setVoiceOn(true);
  }, [speakViaServer]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !voiceOn) return;
      const voice = thaiVoice();
      if (voice && "speechSynthesis" in window) {
        const synth = window.speechSynthesis;
        synth.cancel();
        synth.resume();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "th-TH";
        utter.rate = 1;
        utter.voice = voice;
        utter.onerror = () => void speakViaServer(text).catch(() => {});
        synth.speak(utter);
        return;
      }
      // No Thai system voice (FaceGate on Windows): use the cloud voice.
      void speakViaServer(text).catch(() => {});
    },
    [voiceOn, speakViaServer],
  );

  useEffect(() => {
    const saved = localStorage.getItem(AGENT_KEY);
    if (saved) setAgentUrl(saved);
    window.speechSynthesis?.getVoices();
    const onVoices = () => window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", onVoices);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", onVoices);
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

  // Warm up the in-browser face model whenever the local program is absent.
  useEffect(() => {
    if (agentOnline !== false || webReady) return;
    let cancelled = false;
    import("@/lib/face-web")
      .then((m) => m.loadFaceApi())
      .then(() => {
        if (!cancelled) setWebReady(true);
      })
      .catch(() => {
        if (!cancelled) setWebError("โหลดตัวตรวจใบหน้าไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วรีเฟรช");
      });
    return () => {
      cancelled = true;
    };
  }, [agentOnline, webReady]);

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

  const capture = useCallback((video: HTMLVideoElement, quality: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  // Web mode: measure the face in the browser, let the server decide.
  const scanViaWeb = useCallback(
    async (video: HTMLVideoElement) => {
      const { measureSingleFace } = await import("@/lib/face-web");
      const outcome = await measureSingleFace(video);
      if (outcome.status !== "ok") {
        return { result: outcome.status } as { result: string };
      }

      const snapshot = capture(video, 0.8);
      lastShotRef.current = snapshot;

      const res = await fetch("/api/public/kiosk/web-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          descriptor: outcome.face.descriptor,
          geometry: outcome.face.geometry,
          snapshot,
        }),
      });
      return (await res.json()) as { result?: string };
    },
    [capture],
  );

  const scanOnce = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || busyRef.current) return;
    if (agentOnline === null) return;
    if (!agentOnline && !webReady) return;
    busyRef.current = true;
    setStatus("scanning");
    setGuide("scanning");
    try {
      let data: Omit<ScanResult, "result"> & { result?: string };
      if (agentOnline) {
        const dataUrl = capture(video, 0.85);
        lastShotRef.current = dataUrl;
        const res = await fetch(`${agentUrl.replace(/\/$/, "")}/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
        });
        data = (await res.json()) as typeof data;
      } else {
        data = (await scanViaWeb(video)) as typeof data;
      }
      if (!data.result || data.result === "no_face") {
        setGuide("no_face");
        setStatus("idle");
        busyRef.current = false;
        return;
      }
      if (data.result === "multiple_faces") {
        setGuide("multiple_faces");
        setStatus("idle");
        busyRef.current = false;
        return;
      }
      const scan = data as unknown as ScanResult;
      const shotUrl = scan.snapshot_url ?? lastShotRef.current;
      setResult({ ...scan, snapshot_url: shotUrl });
      if (scan.result === "ok" && scan.student) {
        setRecent((list) =>
          [
            {
              id: `${Date.now()}`,
              name: scan.student!.full_name,
              detail: [scan.student!.student_code, scan.student!.class_room].filter(Boolean).join(" • "),
              direction: scan.direction ?? "in",
              time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
              avatarUrl: scan.avatar_url ?? null,
              snapshotUrl: shotUrl ?? null,
            },
            ...list,
          ].slice(0, 12),
        );
      }
      if (scan.speak) speak(scan.speak);
      const delay = scan.next_delay_seconds ?? 3;
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
      if (agentOnline) setAgentOnline(false);
      setGuide("idle");
      setStatus("idle");
      busyRef.current = false;
    }
  }, [agentUrl, agentOnline, capture, scanViaWeb, speak]);

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
    <main className="min-h-screen bg-background p-4 lg:p-6">
      <header className="text-center">
        <p className="text-xs font-semibold tracking-[0.28em] text-muted-foreground uppercase">
          {t("brand.school_name")}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{t("kiosk.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("kiosk.subtitle")}</p>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs">
          {agentOnline === true ? (
            <span className="text-primary">โหมดโปรแกรมบนเครื่อง (แม่นยำสูง)</span>
          ) : webError ? (
            <span className="text-destructive">{webError}</span>
          ) : webReady ? (
            <span className="text-primary">โหมดเว็บ • พร้อมสแกน</span>
          ) : (
            <span className="text-muted-foreground">โหมดเว็บ • กำลังเตรียมตัวตรวจใบหน้า…</span>
          )}
        </div>
        {!voiceOn && (
          <Button size="sm" onClick={enableVoice}>
            <Volume2 className="size-4" /> แตะเพื่อเปิดเสียง
          </Button>
        )}
        {voiceOn && (
          <span className="flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1.5 text-xs text-primary">
            <Volume2 className="size-3.5" /> เสียงพร้อมใช้งาน
          </span>
        )}
      </div>

      {agentOnline === true && knownFaces === 0 && (
        <div className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border-2 border-accent bg-accent/10 p-4 text-center text-sm">
          เชื่อมต่อโปรแกรมแล้ว แต่ยังไม่มีข้อมูลใบหน้าที่พร้อมใช้งาน กรุณาลงทะเบียนใบหน้าในหลังบ้านก่อน
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: live camera + result */}
        <div className="space-y-4">
          <div className="relative w-full overflow-hidden rounded-3xl border shadow-panel">
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
              {agentOnline === false && !webReady && !webError && (
                <span className="text-muted-foreground">กำลังเตรียมตัวตรวจใบหน้า…</span>
              )}
              {(agentOnline !== false || webReady) && (
                <>
                  {status === "scanning" && !result && (
                    <>
                      <Loader2 className="size-4 animate-spin text-primary" /> {t("kiosk.guide_scanning")}
                    </>
                  )}
                  {guide === "no_face" && status !== "scanning" && !result && (
                    <span className="text-muted-foreground">{t("kiosk.guide_no_face")}</span>
                  )}
                  {guide === "multiple_faces" && !result && (
                    <span className="text-destructive">{t("kiosk.guide_multiple")}</span>
                  )}
                  {guide === "idle" && !result && (
                    <span className="text-primary">{t("kiosk.guide_idle")}</span>
                  )}
                </>
              )}
            </div>

            {camError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center text-sm text-destructive">
                {camError}
              </div>
            )}
          </div>

          <div className="w-full rounded-2xl border-2 border-dashed p-6 text-center">
            <p className="text-muted-foreground">{t("kiosk.next_person")}</p>
          </div>
        </div>

        {/* Right: people who already scanned */}
        <aside className="rounded-3xl border bg-card p-4 shadow-panel">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">สแกนเข้าล่าสุด</h2>
            <span className="text-xs text-muted-foreground">{recent.length} รายการ</span>
          </div>
          <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {recent.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                ยังไม่มีการสแกนในรอบนี้
              </p>
            )}
            {recent.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border p-2">
                <div className="flex shrink-0 gap-1">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={`รูปโปรไฟล์ของ ${item.name}`} className="size-12 rounded-lg object-cover" />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <User className="size-5" />
                    </div>
                  )}
                  {item.snapshotUrl && (
                    <img src={item.snapshotUrl} alt={`ภาพตอนสแกนของ ${item.name}`} className="size-12 rounded-lg object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.detail || "-"}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      item.direction === "in" ? "bg-primary/10 text-primary" : "bg-accent/20 text-accent-foreground"
                    }`}
                  >
                    {item.direction === "in" ? "เข้า" : "ออก"}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
          ย้อนกลับ
        </Button>
        <Link to="/admin">
          <Button variant="secondary" size="sm">
            ไปหลังบ้าน
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
          <Settings2 className="size-4" /> ตั้งค่าเครื่อง
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (!confirm("ต้องการออกจากโปรแกรมใช่หรือไม่")) return;
            window.close();
          }}
        >
          ออกจากโปรแกรม
        </Button>
      </div>
      {showConfig && (
        <div className="mx-auto mt-4 w-full max-w-sm space-y-2 rounded-xl border p-4">
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
