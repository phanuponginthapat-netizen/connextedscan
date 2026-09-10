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
  student?: {
    full_name: string;
    class_room: string | null;
    student_code: string;
    person_type?: string | null;
    department?: string | null;
    position?: string | null;
  } | null;
  direction?: "in" | "out";
  avatar_url?: string | null;
  snapshot_url?: string | null;
};

type RecentScan = {
  id: string;
  name: string;
  detail: string;
  role: string;
  direction: "in" | "out";
  time: string;
  avatarUrl: string | null;
  snapshotUrl: string | null;
};

/** ตำแหน่ง/ชั้นเรียนของผู้สแกน สำหรับแสดงบนหน้าจอ */
function personRole(s: NonNullable<ScanResult["student"]>) {
  if (s.person_type === "staff") {
    const parts = [s.department, s.position].filter(Boolean).join(" / ");
    return `บุคลากร${parts ? ` • ${parts}` : ""}`;
  }
  return `นักเรียน${s.class_room ? ` • ชั้น ${s.class_room}` : ""}`;
}

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
  const [agentStats, setAgentStats] = useState<{
    known_faces?: number;
    cached_images?: number;
    pending_uploads?: number;
    last_sync?: number | null;
  } | null>(null);

  const [webReady, setWebReady] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [display, setDisplay] = useState({
    show_recent: true,
    mirror: true,
    show_clock: true,
    voice_enabled: true,
    voice_rate: 1,
    voice_volume: 1,
  });
  const displayRef = useRef(display);
  displayRef.current = display;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const thaiVoice = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("th")) ?? null;
  };

  // Play a sentence with the voice clip stored on this device. Needed on
  // machines with no Thai system voice, such as the FaceGate desktop app.
  const speakViaServer = useCallback(async (text: string) => {
    const { getVoiceClip } = await import("@/lib/voice-cache");
    const blob = await getVoiceClip(text);
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
    // Keep the common sentences on this device so they play instantly later.
    void import("@/lib/voice-cache").then((m) =>
      m.prewarmVoiceClips([
        "เปิดเสียงเรียบร้อย",
        "ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่",
        "ไม่พบข้อมูลใบหน้า กรุณาลงทะเบียนก่อน",
        "กรุณายื่นใบหน้าให้ตรงกรอบทีละคน",
      ]),
    );
    setVoiceOn(true);
  }, [speakViaServer]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !voiceOn) return;
      const cfg = displayRef.current;
      if (!cfg.voice_enabled) return;
      const voice = thaiVoice();
      if (voice && "speechSynthesis" in window) {
        const synth = window.speechSynthesis;
        synth.cancel();
        synth.resume();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "th-TH";
        utter.rate = cfg.voice_rate || 1;
        utter.volume = cfg.voice_volume ?? 1;
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

  // The latest scans come from the shared record, so every screen shows the
  // same list and it stays complete after the program is restarted.
  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/public/kiosk/recent");
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: Array<{
          id: string;
          name: string;
          detail: string;
          role?: string;
          direction: "in" | "out";
          scanned_at: string;
          avatar_url: string | null;
          snapshot_url: string | null;
        }>;
        display?: {
          show_recent?: boolean;
          mirror?: boolean;
          show_clock?: boolean;
          voice_enabled?: boolean;
          voice_rate?: number;
          voice_volume?: number;
        };
      };
      if (data.display) {
        setDisplay({
          show_recent: data.display.show_recent ?? true,
          mirror: data.display.mirror ?? true,
          show_clock: data.display.show_clock ?? true,
          voice_enabled: data.display.voice_enabled ?? true,
          voice_rate: Number(data.display.voice_rate ?? 1),
          voice_volume: Number(data.display.voice_volume ?? 1),
        });
      }
      setRecent(
        (data.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          detail: item.detail,
          role: item.role ?? "",
          direction: item.direction,
          time: new Date(item.scanned_at).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          avatarUrl: item.avatar_url,
          snapshotUrl: item.snapshot_url,
        })),
      );
    } catch {
      /* offline: keep showing the list already on screen */
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    const t = setInterval(() => void loadRecent(), 15000);
    return () => clearInterval(t);
  }, [loadRecent]);

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
        const data = (await res.json()) as {
          ok?: boolean;
          known_faces?: number;
          cached_images?: number;
          pending_uploads?: number;
          last_sync?: number | null;
        };
        if (cancelled) return;
        setAgentOnline(!!data.ok);
        setKnownFaces(data.known_faces ?? null);
        setAgentStats(data.ok ? data : null);
      } catch {
        if (!cancelled) {
          setAgentOnline(false);
          setKnownFaces(null);
          setAgentStats(null);
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
      if (scan.result === "ok" && scan.student) void loadRecent();
      if (scan.speak) speak(scan.speak);
      const delay = scan.next_delay_seconds ?? 5;
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
  }, [agentUrl, agentOnline, capture, scanViaWeb, speak, loadRecent]);

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

  const logo = t("brand.logo_url");

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background p-3 lg:p-4">
      {/* Top bar: brand + live status + controls, all on one line */}
      <header className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <img src={logo} alt={t("brand.name")} className="size-11 rounded-xl object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold tracking-[0.24em] text-muted-foreground uppercase">
              {t("brand.school_name")}
            </p>
            <h1 className="truncate font-display text-xl font-bold tracking-tight lg:text-2xl">
              {t("kiosk.title")}
            </h1>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
            {agentOnline === true ? (
              <span className="text-primary">
                โหมดโปรแกรมบนเครื่อง
                {agentStats
                  ? ` • ใบหน้า ${agentStats.known_faces ?? 0}${
                      agentStats.pending_uploads ? ` • รอส่ง ${agentStats.pending_uploads}` : ""
                    }`
                  : ""}
              </span>
            ) : webError ? (
              <span className="text-destructive">{webError}</span>
            ) : webReady ? (
              <span className="text-primary">โหมดเว็บ • พร้อมสแกน</span>
            ) : (
              <span className="text-muted-foreground">โหมดเว็บ • กำลังเตรียม…</span>
            )}
          </div>
          {!voiceOn ? (
            <Button size="sm" onClick={enableVoice}>
              <Volume2 className="size-4" /> เปิดเสียง
            </Button>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1.5 text-xs text-primary">
              <Volume2 className="size-3.5" /> เสียงพร้อม
            </span>
          )}
          <Link to="/admin">
            <Button variant="secondary" size="sm">
              หลังบ้าน
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
            <Settings2 className="size-4" />
          </Button>
        </div>
      </header>

      {agentOnline === true && knownFaces === 0 && (
        <div className="mt-2 shrink-0 rounded-xl border-2 border-accent bg-accent/10 px-4 py-2 text-center text-sm">
          เชื่อมต่อโปรแกรมแล้ว แต่ยังไม่มีข้อมูลใบหน้าที่พร้อมใช้งาน กรุณาลงทะเบียนใบหน้าในหลังบ้านก่อน
        </div>
      )}

      {showConfig && (
        <div className="mt-2 shrink-0 space-y-2 rounded-xl border p-3">
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

      {/* Body fills the rest of the screen — no page scrolling */}
      <div
        className={`mt-3 grid min-h-0 flex-1 gap-4 ${
          display.show_recent ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"
        }`}
      >
        <div className="animate-soft-in relative min-h-0 overflow-hidden rounded-3xl border shadow-panel">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full bg-muted object-cover ${display.mirror ? "scale-x-[-1]" : ""}`}
          />

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              className={`flex aspect-[3/4] h-[70%] items-center justify-center rounded-[50%] border-4 border-dashed ${guideColor} transition-all duration-500 ${
                guide === "scanning" ? "scale-[1.02] animate-glow-pulse" : "scale-100"
              }`}
            >
              <User className={`size-16 opacity-40 ${guide === "scanning" ? "animate-pulse" : ""}`} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 shimmer-line" />

          <div className="animate-rise pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm shadow backdrop-blur">
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

        {/* Right: people who already scanned */}
        {display.show_recent && (
        <aside className="animate-soft-in flex min-h-0 flex-col rounded-3xl border bg-card p-4 shadow-panel">
          <div className="flex shrink-0 items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">สแกนเข้าล่าสุด</h2>
            <span className="text-xs text-muted-foreground">{recent.length} รายการ</span>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {recent.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                ยังไม่มีรายการสแกน
              </p>
            )}
            {recent.map((item) => (
              <div key={item.id} className="animate-rise flex items-center gap-3 rounded-xl border p-2 transition-colors hover:bg-muted/50">
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
                  {item.role && (
                    <p className="truncate text-[11px] font-medium text-primary">{item.role}</p>
                  )}
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
        )}
      </div>

      {/* Scan result popup */}
      {result && (
        <div
          role="dialog"
          aria-modal="true"
          className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm duration-200"
        >
          <div
            className={`animate-soft-in w-full max-w-lg rounded-3xl border-4 bg-card p-8 text-center shadow-panel ${tone}`}
          >
            {(result.avatar_url || result.snapshot_url) && (
              <div className="flex items-end justify-center gap-6">
                <figure className="space-y-1">
                  {result.avatar_url ? (
                    <img
                      src={result.avatar_url}
                      alt={result.student ? `รูปโปรไฟล์ของ ${result.student.full_name}` : "รูปโปรไฟล์"}
                      className="animate-soft-in size-32 rounded-2xl border-4 border-primary/40 object-cover shadow-lg"
                    />
                  ) : (
                    <div className="flex size-32 items-center justify-center rounded-2xl border-4 border-dashed text-muted-foreground">
                      <User className="size-9" />
                    </div>
                  )}
                  <figcaption className="text-xs text-muted-foreground">รูปโปรไฟล์</figcaption>
                </figure>
                {result.snapshot_url && (
                  <figure className="space-y-1">
                    <img
                      src={result.snapshot_url}
                      alt="ภาพขณะสแกนจริง"
                      className="animate-soft-in size-32 rounded-2xl border-4 border-accent/50 object-cover shadow-lg [animation-delay:0.08s]"
                    />
                    <figcaption className="text-xs text-muted-foreground">ภาพตอนสแกน</figcaption>
                  </figure>
                )}
              </div>
            )}
            <div className="mt-5 flex items-center justify-center gap-2">
              {result.result === "ok" ? (
                <CheckCircle2 className="animate-soft-in size-8 shrink-0 text-primary" />
              ) : (
                <XCircle className="animate-soft-in size-8 shrink-0 text-destructive" />
              )}
              <p className="text-2xl font-bold">{result.message}</p>
            </div>
            {result.student && (
              <>
                <p className="mt-2 text-base font-semibold text-primary">
                  {personRole(result.student)}
                </p>
                <p className="text-sm text-muted-foreground">รหัส {result.student.student_code}</p>
              </>
            )}
            <p className="mt-4 text-sm text-muted-foreground">คนถัดไปในอีก {countdown} วินาที</p>
          </div>
        </div>
      )}
    </main>
  );
}
