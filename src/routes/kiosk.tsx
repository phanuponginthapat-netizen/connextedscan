import { useCallback, useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Settings2, User, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCms } from "@/lib/cms-client";
import { FaceBoxOverlay } from "@/components/people/FaceBoxOverlay";
import type { FaceBox, FacePoint } from "@/lib/face-web";

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
  face_detection?: LiveDetection;
};

type LiveDetection = {
  box: FaceBox;
  landmarks: FacePoint[];
  frame: { width: number; height: number };
  score: number;
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

type FaceGateDesktopApi = {
  isFaceGate?: boolean;
  getAgentStatus?: () => Promise<{
    state?: string;
    message?: string;
    lastError?: string;
    python?: string;
    logPath?: string;
    attempts?: number;
  }>;
  restartAgent?: () => Promise<boolean>;
  openSettings?: () => Promise<void>;
  openAgentLog?: () => Promise<void>;
};

const AGENT_KEY = "facegate_agent_url";

function Kiosk() {
  const { t } = useCms();
  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const lastShotRef = useRef<string | null>(null);
  const lastDurationRef = useRef(0);
  const [agentUrl, setAgentUrl] = useState("http://127.0.0.1:8899");
  const [showConfig, setShowConfig] = useState(false);
  const [status, setStatus] = useState<"idle" | "scanning" | "cooldown">("idle");
  const [guide, setGuide] = useState<GuideState>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [liveDetection, setLiveDetection] = useState<LiveDetection | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentDetail, setAgentDetail] = useState("");
  const [agentWaitSeconds, setAgentWaitSeconds] = useState(0);
  const [knownFaces, setKnownFaces] = useState<number | null>(null);
  const [agentStats, setAgentStats] = useState<{
    known_faces?: number;
    cached_images?: number;
    pending_uploads?: number;
    last_sync?: number | null;
    stale?: boolean;
  } | null>(null);

  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [display, setDisplay] = useState({
    show_recent: true,
    mirror: true,
    show_clock: true,
    voice_enabled: true,
    voice_rate: 1,
    voice_volume: 1,
    news_enabled: false,
    news_text: "",
  });
  // Boot gate: the scan screen only appears once the camera, the FaceGate
  // program and the voice are all ready, so the kiosk works at full speed
  // from the very first scan.
  const [powerInfo, setPowerInfo] = useState<{
    screen_off?: boolean;
    pending?: { action?: string; at?: number } | null;
  } | null>(null);
  const [powerCountdown, setPowerCountdown] = useState(0);
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [booted, setBooted] = useState(false);
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
          news_enabled?: boolean;
          news_text?: string;
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
          news_enabled: data.display.news_enabled ?? false,
          news_text: data.display.news_text ?? "",
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

  // Inside the FaceGate program sound may start on its own, so turn the voice
  // on automatically instead of asking the person to tap a button. On a plain
  // browser the first touch anywhere on the screen turns it on.
  useEffect(() => {
    if (typeof window === "undefined" || voiceOn) return;
    const desktop = Boolean((window as unknown as { electronAPI?: { isFaceGate?: boolean } }).electronAPI?.isFaceGate);
    if (desktop) {
      const timer = setTimeout(() => enableVoice(), 600);
      return () => clearTimeout(timer);
    }
    const onGesture = () => enableVoice();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [voiceOn, enableVoice]);

  // Is the face-recognition program on this PC reachable?
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      let online = false;
      try {
        const res = await fetch(`${agentUrl.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          known_faces?: number;
          cached_images?: number;
          pending_uploads?: number;
          last_sync?: number | null;
          stale?: boolean;
        };
        if (cancelled) return;
        online = !!data.ok;
        setAgentOnline(online);
        setKnownFaces(data.known_faces ?? null);
        setAgentStats(online ? data : null);
      } catch {
        if (!cancelled) {
          setAgentOnline(false);
          setKnownFaces(null);
          setAgentStats(null);
        }
      }
      // Look again quickly while the program is still starting up, then relax.
      if (!cancelled) timer = setTimeout(check, online ? 10000 : 1000);
    };
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [agentUrl]);

  // Electron can tell us why its background process stopped. Previously the
  // page showed an endless spinner whenever Python or a model failed to start.
  useEffect(() => {
    if (typeof window === "undefined" || agentOnline === true) {
      setAgentWaitSeconds(0);
      setAgentMessage("");
      setAgentDetail("");
      return;
    }
    const desktop = (window as unknown as { electronAPI?: FaceGateDesktopApi }).electronAPI;
    let cancelled = false;
    const startedAt = Date.now();
    const inspect = async () => {
      setAgentWaitSeconds(Math.floor((Date.now() - startedAt) / 1000));
      if (!desktop?.getAgentStatus) return;
      try {
        const next = await desktop.getAgentStatus();
        if (cancelled) return;
        setAgentMessage(next.message || next.lastError || "");
        setAgentDetail(
          [
            next.python ? `Python: ${next.python}` : "",
            next.lastError ? `รายละเอียด: ${next.lastError}` : "",
            next.logPath ? `บันทึก: ${next.logPath}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      } catch {
        // An older FaceGate shell has no diagnostics; the health check remains active.
      }
    };
    void inspect();
    const timer = setInterval(() => void inspect(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentOnline]);

  const restartDesktopAgent = useCallback(async () => {
    const desktop = (window as unknown as { electronAPI?: FaceGateDesktopApi }).electronAPI;
    setAgentMessage("กำลังเปิดตัวประมวลผลใบหน้าใหม่…");
    setAgentOnline(null);
    await desktop?.restartAgent?.();
  }, []);

  const openDesktopSettings = useCallback(async () => {
    const desktop = (window as unknown as { electronAPI?: FaceGateDesktopApi }).electronAPI;
    if (desktop?.openSettings) await desktop.openSettings();
    else setShowConfig(true);
  }, []);

  const openAgentLog = useCallback(async () => {
    const desktop = (window as unknown as { electronAPI?: FaceGateDesktopApi }).electronAPI;
    await desktop?.openAgentLog?.();
  }, []);


  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setCamReady(true);
      })
      .catch(() => setCamError("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องแล้วรีเฟรชหน้าจอ"));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  // Enter the scan screen only when everything the kiosk needs is ready.
  // On the desktop program the voice turns itself on; in a plain browser the
  // person taps the boot screen once (browsers require a gesture for sound).
  useEffect(() => {
    if (booted) return;
    const voiceReady = voiceOn || !display.voice_enabled;
    if (camReady && agentOnline === true && voiceReady) setBooted(true);
  }, [booted, camReady, agentOnline, voiceOn, display.voice_enabled]);

  // One reusable drawing surface: creating a canvas for every frame makes the
  // kiosk PC work much harder than it needs to.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const capture = useCallback((video: HTMLVideoElement, quality: number) => {
    const maxWidth = 640;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  }, []);

  const scanOnce = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || busyRef.current) return;
    if (!agentOnline || !booted) return;
    busyRef.current = true;
    setStatus("scanning");
    setGuide("scanning");
    try {
      const startedAt = performance.now();
      const dataUrl = capture(video, 0.72);
      lastShotRef.current = dataUrl;
      const res = await fetch(`${agentUrl.replace(/\/$/, "")}/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      lastDurationRef.current = performance.now() - startedAt;
      const data = (await res.json()) as Omit<ScanResult, "result"> & { result?: string };
      setLiveDetection(data.face_detection ?? null);
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
      setLiveDetection(null);
      setAgentOnline(false);
      setGuide("idle");
      setStatus("idle");
      busyRef.current = false;
    }
  }, [agentUrl, agentOnline, booted, capture, speak, loadRecent]);

  // Pace the scanning to how fast this PC actually answers: a slow machine
  // gets breathing room instead of piling up frames it cannot process.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (!busyRef.current) void scanOnce();
      const last = lastDurationRef.current;
      const wait = Math.min(2000, Math.max(500, last ? last * 0.5 : 900));
      timer = setTimeout(tick, wait);
    };
    timer = setTimeout(tick, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [scanOnce]);

  // Power saving: ask the local program whether the screen should be dark and
  // whether the PC is about to switch itself off, so staff can stop it in time.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`${agentUrl}/power/status`, {
          signal: AbortSignal.timeout(3000),
        });
        const body = (await res.json()) as {
          screen_off?: boolean;
          pending?: { action?: string; at?: number } | null;
        };
        if (stopped) return;
        setPowerInfo(body);
        const at = body.pending?.at ? Number(body.pending.at) * 1000 : 0;
        setPowerCountdown(at ? Math.max(0, Math.round((at - Date.now()) / 1000)) : 0);
      } catch {
        if (!stopped) setPowerInfo(null);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [agentUrl]);

  // Today's figures for the summary board shown once both scan windows close.
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/public/kiosk/today-stats");
        const body = (await res.json()) as TodayStats;
        if (!stopped) setTodayStats(body);
      } catch {
        // keep the last known numbers on a network hiccup
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const sendPowerCommand = useCallback(
    async (command: string) => {
      try {
        await fetch(`${agentUrl}/power/command`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command }),
        });
      } catch {
        // the kiosk must never break because a power command failed
      }
    },
    [agentUrl],
  );

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
            ) : agentOnline === false ? (
              <span className="text-destructive">ยังไม่ได้เปิดโปรแกรม FaceGate</span>
            ) : (
              <span className="text-muted-foreground">กำลังเชื่อมต่อโปรแกรม FaceGate…</span>
            )}
          </div>
          {agentStats?.stale ? (
            <div className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              ข้อมูลใบหน้ายังไม่อัปเดต กำลังเชื่อมต่อระบบใหม่
            </div>
          ) : null}
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

          {liveDetection && !result ? (
            <FaceBoxOverlay
              boxes={[liveDetection.box]}
              frame={liveDetection.frame}
              mirrored={display.mirror}
              landmarks={liveDetection.landmarks}
              tech
              tone={guide === "multiple_faces" ? "bad" : "ok"}
              label={`FACE DETECTED ${Math.round(liveDetection.score * 100)}%`}
            />
          ) : null}

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
            {agentOnline === false && (
              <span className="text-destructive">
                กรุณาเปิดโปรแกรม FaceGate บนเครื่องนี้ก่อนเริ่มสแกน
              </span>
            )}
            {agentOnline !== false && (
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

      {/* Scrolling announcement bar, configured in Settings > หน้าจอตู้สแกน */}
      {display.news_enabled && display.news_text.trim() !== "" && (
        <NewsMarquee text={display.news_text.trim()} />
      )}

      {/* Boot screen: wait until camera, FaceGate and voice are all ready */}
      {!booted && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-6">
          <div className="animate-soft-in w-full max-w-md space-y-6 rounded-3xl border bg-card p-8 text-center shadow-panel">
            {logo ? (
              <img
                src={logo}
                alt={t("brand.name")}
                className="animate-float-soft mx-auto size-16 rounded-2xl object-contain"
              />
            ) : null}
            <div>
              <h2 className="font-display text-xl font-bold">{t("kiosk.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">กำลังเตรียมระบบให้พร้อมก่อนเริ่มสแกน</p>
            </div>
            <ul className="space-y-2 text-left text-sm">
              <li className="flex items-center gap-3 rounded-xl border p-3">
                {camReady ? (
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                ) : (
                  <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                )}
                <span>{camReady ? "กล้องพร้อมใช้งาน" : "กำลังเปิดกล้อง…"}</span>
              </li>
              <li className="flex items-center gap-3 rounded-xl border p-3">
                {agentOnline === true ? (
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                ) : (
                  <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                )}
                <span>
                  {agentOnline === true
                    ? `โปรแกรม FaceGate พร้อม (ใบหน้า ${knownFaces ?? 0} คน)`
                    : agentMessage || "กำลังรอโปรแกรม FaceGate… กรุณาเปิดโปรแกรมบนเครื่องนี้"}
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-xl border p-3">
                {voiceOn || !display.voice_enabled ? (
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                ) : (
                  <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
                )}
                <span>
                  {!display.voice_enabled
                    ? "ปิดเสียงประกาศไว้ในการตั้งค่า"
                    : voiceOn
                      ? "เสียงประกาศพร้อมใช้งาน"
                      : "กำลังเตรียมเสียงประกาศ…"}
                </span>
              </li>
            </ul>
            {display.voice_enabled && !voiceOn && (
              <Button className="w-full" onClick={enableVoice}>
                <Volume2 className="size-4" /> แตะเพื่อเปิดเสียงและเริ่มใช้งาน
              </Button>
            )}
            {agentOnline !== true && agentWaitSeconds >= 8 && (
              <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-left">
                <p className="text-sm font-semibold text-destructive">ตัวประมวลผลใบหน้ายังไม่เริ่มทำงาน</p>
                <p className="text-xs text-muted-foreground">
                  โปรแกรมจะลองเปิดใหม่อัตโนมัติ หรือกดปุ่มด้านล่างเพื่อลองทันที
                </p>
                {agentDetail && (
                  <pre className="max-h-32 overflow-auto rounded-lg bg-background/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {agentDetail}
                  </pre>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button className="flex-1" onClick={() => void restartDesktopAgent()}>
                    ลองเปิดใหม่
                  </Button>
                  <Button className="flex-1" variant="secondary" onClick={() => void openDesktopSettings()}>
                    ตรวจการตั้งค่า
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => void openAgentLog()}>
                    ดูบันทึกปัญหา
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screen asleep to save electricity — tap anywhere to wake it up */}
      {powerInfo?.screen_off && (
        <button
          type="button"
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-2 bg-black text-white/80"
          onClick={() => void sendPowerCommand("screen_on")}
        >
          <span className="text-lg font-semibold">พักหน้าจอเพื่อประหยัดไฟ</span>
          <span className="text-sm text-white/60">แตะหน้าจอเพื่อใช้งานต่อ</span>
        </button>
      )}

      {/* Countdown before the PC powers itself off */}
      {powerInfo?.pending && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-panel">
            <p className="text-xl font-semibold">
              {powerInfo.pending.action === "sleep"
                ? "กำลังจะพักเครื่อง"
                : "กำลังจะปิดเครื่อง"}
            </p>
            <p className="mt-2 text-5xl font-bold text-primary">{powerCountdown}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              ถ้ายังต้องใช้งานอยู่ กดปุ่มด้านล่างเพื่อยกเลิก
            </p>
            <Button className="mt-5 w-full" onClick={() => void sendPowerCommand("cancel")}>
              ยังใช้งานอยู่ — ยกเลิก
            </Button>
          </div>
        </div>
      )}

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

/**
 * Scrolling news bar. The track slides -50%, so it renders two identical
 * halves; each half repeats the text enough times to fill the bar, which
 * prevents a short message from appearing twice on screen at once.
 */
function NewsMarquee({ text }: { text: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLSpanElement>(null);
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    const measure = () => {
      const bar = barRef.current;
      const item = itemRef.current;
      if (!bar || !item) return;
      const itemWidth = item.getBoundingClientRect().width;
      const barWidth = bar.getBoundingClientRect().width;
      if (itemWidth <= 0 || barWidth <= 0) return;
      // One half must be at least as wide as the bar for a seamless -50% loop.
      setCopies(Math.max(1, Math.ceil(barWidth / itemWidth) + 1));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text]);

  const half = (
    <>
      {Array.from({ length: copies }).map((_, i) => (
        <span key={i} ref={i === 0 ? itemRef : undefined} className="flex items-center gap-16">
          <span>{text}</span>
          <span aria-hidden="true" className="text-muted-foreground">•</span>
        </span>
      ))}
    </>
  );

  return (
    <footer
      ref={barRef}
      className="mt-3 shrink-0 overflow-hidden rounded-full border bg-card/80 px-5 py-2 shadow-panel backdrop-blur"
    >
      <div className="facegate-marquee flex w-max gap-16 whitespace-nowrap text-sm font-medium">
        {half}
        <span aria-hidden="true" className="flex gap-16">{half}</span>
      </div>
    </footer>
  );
}
