import { useCallback, useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Loader2, Settings2, Sparkles, User, Users, Volume2, XCircle } from "lucide-react";
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
  registered_face_url?: string | null;
  snapshot_url?: string | null;
  confidence?: number;
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

type TodayStats = {
  school_name?: string;
  screensaver_mode?: string;
  people?: number;
  present?: number;
  students_present?: number;
  staff_present?: number;
  late?: number;
  on_time?: number;
  absent?: number;
  left?: number;
  windows_closed?: boolean;
  is_workday?: boolean;
  /** check-in only school: no closing time, no late marking */
  checkin_only?: boolean;
  /** show the statistics board after this many minutes without a scan (0 = off) */
  idle_stats_minutes?: number;
};

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
  const [now, setNow] = useState(() => new Date());
  // Last time somebody actually used the kiosk (face seen, scan, or a touch).
  // Used to rest the screen on the statistics board without ever stopping
  // the camera, so the next person is scanned the moment they step up.
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const bumpActivity = useCallback(() => setLastActivity(Date.now()), []);

  useEffect(() => {
    window.addEventListener("pointerdown", bumpActivity);
    window.addEventListener("keydown", bumpActivity);
    return () => {
      window.removeEventListener("pointerdown", bumpActivity);
      window.removeEventListener("keydown", bumpActivity);
    };
  }, [bumpActivity]);
  const displayRef = useRef(display);
  displayRef.current = display;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
          time: new Date(item.scanned_at).toLocaleTimeString("th-TH-u-ca-buddhist-nu-latn", {
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
      // Somebody is in front of the camera: wake the screen from the stats board.
      if (data.face_detection || (data.result && data.result !== "no_face")) bumpActivity();
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
  }, [agentUrl, agentOnline, booted, capture, speak, loadRecent, bumpActivity]);

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

  const scanPercent = Math.max(0, Math.min(100, Math.round((result?.confidence ?? liveDetection?.score ?? 0) * 1000) / 10));
  const resultTime = now.toLocaleTimeString("th-TH-u-ca-buddhist-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateText = now.toLocaleDateString("th-TH-u-ca-buddhist-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const success = result?.result === "ok";
  const schoolName = t("brand.school_name") || "โรงเรียนของเรา";
  const welcomeSetting = t("kiosk.welcome");
  const welcomePrefix =
    welcomeSetting === "ยินดีต้อนรับกลับโรงเรียน!" || welcomeSetting === "ยินดีต้อนรับกลับโรงเรียน"
      ? "ยินดีต้อนรับเข้าสู่"
      : welcomeSetting || "ยินดีต้อนรับเข้าสู่";
  const welcomeText = welcomePrefix.includes("{school}")
    ? welcomePrefix.replaceAll("{school}", schoolName)
    : `${welcomePrefix}${schoolName}`;
  const todayLabel = t("kiosk.today_label") === "เข้าเรียนวันนี้" ? "วันนี้" : t("kiosk.today_label");

  // Resting screen: after the configured quiet period, or once the scan
  // windows close, or when the power plan blanks the screen. The camera and
  // the scan loop keep running underneath, so the board disappears again as
  // soon as a face appears.
  const checkinOnly = Boolean(todayStats?.checkin_only);
  const idleMinutes = Number(todayStats?.idle_stats_minutes ?? 0);
  const idleRest = idleMinutes > 0 && now.getTime() - lastActivity >= idleMinutes * 60_000;
  const showSaver =
    (todayStats?.screensaver_mode ?? "stats") === "stats" &&
    Boolean(todayStats?.windows_closed || powerInfo?.screen_off || idleRest);
  const saverTiles = checkinOnly
    ? [
        { label: "มาแล้ว", value: todayStats?.present ?? 0 },
        { label: "ยังไม่มา", value: todayStats?.absent ?? 0 },
        { label: "ทั้งหมด", value: todayStats?.people ?? 0 },
      ]
    : [
        { label: "มาแล้ว", value: todayStats?.present ?? 0 },
        { label: "มาสาย", value: todayStats?.late ?? 0 },
        { label: "ขาด", value: todayStats?.absent ?? 0 },
        { label: "กลับแล้ว", value: todayStats?.left ?? 0 },
      ];

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans">
      <header className="z-20 flex min-h-20 shrink-0 items-center justify-between gap-4 border-b bg-card/95 px-5 py-3 shadow-sm backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? (
            <img src={logo} alt={t("brand.name")} className="size-12 shrink-0 rounded-xl border bg-card object-contain p-1" />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-panel">
              <Sparkles className="size-6" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold text-foreground md:text-xl">{t("brand.school_name")}</h1>
            <p className="truncate text-xs font-medium text-muted-foreground">{t("kiosk.title")}</p>
          </div>
        </div>

        <div className="hidden items-center gap-3 rounded-full border bg-muted/70 px-5 py-2 text-sm font-semibold md:flex">
          <span className="size-2 animate-pulse rounded-full bg-success" />
          <span>{todayLabel}</span>
          <span>· นักเรียน</span>
          <strong className="text-primary">{todayStats?.students_present ?? 0}</strong>
          <span>คน · บุคลากร</span>
          <strong className="text-primary">{todayStats?.staff_present ?? 0}</strong>
          <span>คน</span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2 text-primary sm:flex">
            <Users className="size-5" />
            <Clock3 className="size-5" />
          </div>
          {display.show_clock && (
            <div className="border-l pl-3 text-right">
              <p className="font-display text-xl font-bold tabular-nums text-foreground md:text-2xl">{resultTime}</p>
              <p className="text-[10px] font-medium text-muted-foreground md:text-xs">{dateText}</p>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => setShowConfig((v) => !v)} title="ตั้งค่าเครื่อง">
            <Settings2 className="size-4" />
          </Button>
        </div>
      </header>

      {showConfig && (
        <div className="z-30 flex shrink-0 items-end gap-2 border-b bg-card p-3">
          <div className="flex-1">
            <Label>ที่อยู่โปรแกรมบนเครื่องนี้</Label>
            <Input value={agentUrl} onChange={(e) => { setAgentUrl(e.target.value); localStorage.setItem(AGENT_KEY, e.target.value); }} />
          </div>
          <Link to="/admin"><Button variant="secondary">หลังบ้าน</Button></Link>
        </div>
      )}

      <section className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-muted/40 lg:grid-cols-[3fr_2fr] lg:overflow-hidden">
        <div className="relative min-h-[52vh] overflow-hidden bg-camera lg:min-h-0">
          <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover ${display.mirror ? "scale-x-[-1]" : ""}`} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-camera/55 via-transparent to-camera/55" />

          <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-camera/75 px-3 py-1.5 text-xs font-bold text-camera-foreground backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-destructive" /> {t("kiosk.live_label")}
          </div>

          {liveDetection && !result ? (
            <FaceBoxOverlay boxes={[liveDetection.box]} frame={liveDetection.frame} mirrored={display.mirror} landmarks={liveDetection.landmarks} tech tone={guide === "multiple_faces" ? "bad" : "ok"} label={`${t("kiosk.guide_scanning")} ${scanPercent}%`} />
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`relative aspect-square h-[48%] max-h-80 rounded-3xl border ${guideColor} ${guide === "scanning" ? "animate-glow-pulse" : ""}`}>
                <span className="absolute -left-1 -top-1 size-12 rounded-tl-2xl border-l-4 border-t-4 border-current" />
                <span className="absolute -right-1 -top-1 size-12 rounded-tr-2xl border-r-4 border-t-4 border-current" />
                <span className="absolute -bottom-1 -left-1 size-12 rounded-bl-2xl border-b-4 border-l-4 border-current" />
                <span className="absolute -bottom-1 -right-1 size-12 rounded-br-2xl border-b-4 border-r-4 border-current" />
              </div>
            </div>
          )}

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl border border-camera-foreground/15 bg-camera/75 px-5 py-2 text-center text-sm font-medium text-camera-foreground backdrop-blur">
            {agentOnline === false ? "กรุณาเปิดโปรแกรม FaceGate" : guide === "multiple_faces" ? t("kiosk.guide_multiple") : guide === "no_face" ? t("kiosk.guide_no_face") : status === "scanning" ? t("kiosk.guide_scanning") : t("kiosk.guide_idle")}
          </div>

          {result && (result.snapshot_url || result.avatar_url) && (
            <div className="animate-soft-in absolute bottom-5 right-5 w-[min(28rem,calc(100%-2.5rem))] rounded-2xl border bg-card/95 p-5 shadow-panel backdrop-blur">
              <h2 className="text-center font-display text-lg font-bold">{t("kiosk.comparison_title")}</h2>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <figure className="text-center">
                  <img src={result.snapshot_url ?? result.avatar_url ?? ""} alt={t("kiosk.camera_image_label")} className="mx-auto aspect-square w-full max-w-28 rounded-xl bg-muted object-cover" />
                  <figcaption className="mt-1 text-xs text-muted-foreground">{t("kiosk.camera_image_label")}</figcaption>
                </figure>
                {success ? <CheckCircle2 className="size-9 text-success" /> : <XCircle className="size-9 text-destructive" />}
                <figure className="text-center">
                  {result.registered_face_url || result.avatar_url ? (
                    <img src={result.registered_face_url ?? result.avatar_url ?? ""} alt={t("kiosk.registered_image_label")} className="mx-auto aspect-square w-full max-w-28 rounded-xl bg-muted object-cover" />
                  ) : (
                    <div className="mx-auto flex aspect-square w-full max-w-28 items-center justify-center rounded-xl bg-muted"><User className="size-10 text-muted-foreground" /></div>
                  )}
                  <figcaption className="mt-1 text-xs text-muted-foreground">{t("kiosk.registered_image_label")}</figcaption>
                </figure>
              </div>
              {result.confidence !== undefined && (
                <div className="mt-4 rounded-xl bg-muted p-3">
                  <div className="flex justify-between text-xs font-semibold"><span>{t("kiosk.match_score_label")}</span><span className="text-success">{scanPercent}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${scanPercent}%` }} /></div>
                </div>
              )}
            </div>
          )}
          {camError && <div className="absolute inset-0 flex items-center justify-center bg-camera p-6 text-center text-destructive-foreground">{camError}</div>}
        </div>

        <aside className="flex min-h-[40vh] flex-col overflow-hidden border-l bg-card p-5 md:p-7 lg:min-h-0">
          {result ? (
            <div className="animate-rise flex h-full flex-col">
              <div className="flex items-center gap-3">
                <div className={`flex size-12 items-center justify-center rounded-2xl ${success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {success ? <Sparkles className="size-6" /> : <XCircle className="size-6" />}
                </div>
                <h2 className="font-display text-2xl font-extrabold">{success ? welcomeText : result.message}</h2>
              </div>
              <div className="my-6 flex flex-col items-center text-center">
                <div className="relative">
                  {result.avatar_url ? <img src={result.avatar_url} alt={result.student?.full_name ?? "ผู้สแกน"} className="size-36 rounded-full border-8 border-background object-cover shadow-panel" /> : <div className="flex size-36 items-center justify-center rounded-full bg-muted"><User className="size-12 text-muted-foreground" /></div>}
                  <span className={`absolute bottom-1 right-1 flex size-10 items-center justify-center rounded-full border-4 border-card ${success ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
                    {success ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-2xl font-extrabold">{result.student?.full_name ?? result.message}</h3>
                {result.student && <p className="mt-1 font-semibold text-primary">{personRole(result.student)}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoTile label={t("kiosk.class_label")} value={result.student?.class_room || result.student?.department || "—"} />
                <InfoTile label={t("kiosk.id_label")} value={result.student?.student_code || "—"} />
              </div>
              <div className="mt-auto space-y-3 border-t pt-5">
                <div className="flex items-center justify-between rounded-xl bg-muted p-4"><span className="text-sm font-semibold text-muted-foreground">{t("kiosk.time_label")}</span><strong className="font-display text-xl tabular-nums text-primary">{resultTime} น.</strong></div>
                <div className={`flex items-center justify-center gap-3 rounded-2xl p-4 text-lg font-bold ${success ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  {success ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
                  {success ? t("kiosk.success_label") : result.message}
                </div>
                <p className="text-center text-xs text-muted-foreground">{t("kiosk.next_person")}ในอีก {countdown} วินาที</p>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
                <p className="text-xs font-semibold opacity-75">FACEGATE READY</p>
                <h2 className="mt-1 font-display text-2xl font-bold">{t("kiosk.subtitle")}</h2>
                <p className="mt-2 text-sm opacity-80">{agentOnline === true ? `ระบบพร้อม • ลงทะเบียนแล้ว ${knownFaces ?? 0} ใบหน้า` : "กำลังเชื่อมต่อระบบประมวลผล"}</p>
              </div>
              <div className="mt-5 flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between"><h3 className="font-display text-lg font-bold">สแกนเข้าล่าสุด</h3><span className="text-xs text-muted-foreground">{recent.length} รายการ</span></div>
                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {recent.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการสแกน</p> : recent.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border p-2">
                      {item.avatarUrl ? <img src={item.avatarUrl} alt={item.name} className="size-11 rounded-lg object-cover" /> : <div className="flex size-11 items-center justify-center rounded-lg bg-muted"><User className="size-4" /></div>}
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.role || item.detail}</p></div>
                      <div className="text-right text-xs"><strong className="text-primary">{item.direction === "in" ? "เข้า" : "ออก"}</strong><p className="text-muted-foreground">{item.time}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </section>

      {display.news_enabled && display.news_text.trim() !== "" && <NewsMarquee text={display.news_text.trim()} />}

      {!booted && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-panel">
            <Loader2 className="mx-auto size-9 animate-spin text-primary" />
            <h2 className="mt-4 font-display text-xl font-bold">กำลังเตรียม {t("kiosk.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{agentMessage || "กำลังเปิดกล้อง ระบบประมวลผล และเสียงประกาศ"}</p>
            {display.voice_enabled && !voiceOn && <Button className="mt-5 w-full" onClick={enableVoice}><Volume2 className="size-4" /> เปิดเสียงและเริ่มใช้งาน</Button>}
            {agentOnline !== true && agentWaitSeconds >= 8 && <div className="mt-5 space-y-2"><p className="text-sm text-destructive">ตัวประมวลผลใบหน้ายังไม่พร้อม</p>{agentDetail && <pre className="max-h-28 overflow-auto text-left text-xs text-muted-foreground whitespace-pre-wrap">{agentDetail}</pre>}<div className="flex gap-2"><Button className="flex-1" onClick={() => void restartDesktopAgent()}>ลองเปิดใหม่</Button><Button className="flex-1" variant="secondary" onClick={() => void openDesktopSettings()}>ตรวจการตั้งค่า</Button><Button variant="outline" size="icon" onClick={() => void openAgentLog()} title="ดูบันทึกปัญหา"><Settings2 className="size-4" /></Button></div></div>}
          </div>
        </div>
      )}

      {showSaver && (
        <button type="button" className="fixed inset-0 z-[75] flex flex-col items-center justify-center gap-8 bg-camera p-8 text-camera-foreground" onClick={() => { bumpActivity(); if (powerInfo?.screen_off) void sendPowerCommand("screen_on"); }}>
          <div className="text-center"><p className="text-sm opacity-60">สถิติวันนี้</p><p className="mt-2 font-display text-3xl font-semibold">{todayStats?.school_name || t("brand.name")}</p><p className="mt-1 opacity-60">{dateText}</p></div>
          <div className="grid w-full max-w-4xl grid-cols-2 gap-6 lg:grid-cols-4">{saverTiles.map((item) => <div key={item.label} className="rounded-2xl border border-camera-foreground/10 bg-camera-foreground/5 p-6 text-center"><p className="text-6xl font-bold text-success">{item.value}</p><p className="mt-2 text-sm opacity-70">{item.label}</p></div>)}</div>
          <p className="text-sm opacity-60">กล้องยังทำงานอยู่ — เดินเข้ามาสแกนได้ทันที</p>
        </button>
      )}

      {powerInfo?.pending && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-camera/80 p-4 backdrop-blur"><div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-panel"><p className="text-xl font-semibold">{powerInfo.pending.action === "sleep" ? "กำลังจะพักเครื่อง" : "กำลังจะปิดเครื่อง"}</p><p className="mt-2 text-5xl font-bold text-primary">{powerCountdown}</p><Button className="mt-5 w-full" onClick={() => void sendPowerCommand("cancel")}>ยังใช้งานอยู่ — ยกเลิก</Button></div></div>}
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/50 p-4">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <p className="mt-1 truncate font-display text-lg font-bold text-foreground">{value}</p>
    </div>
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
