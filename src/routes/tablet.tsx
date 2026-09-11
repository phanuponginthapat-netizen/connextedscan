import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Settings2, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCms } from "@/lib/cms-client";
import { FaceBoxOverlay } from "@/components/people/FaceBoxOverlay";
import type { FaceBox, FacePoint } from "@/lib/face-web";

export const Route = createFileRoute("/tablet")({
  head: () => ({
    meta: [
      { title: "สแกนใบหน้าบนแท็บเล็ต | FaceGate" },
      {
        name: "description",
        content: "ใช้แท็บเล็ตหรือมือถือเครื่องเก่าเป็นตู้สแกนใบหน้าเข้า-ออกโรงเรียน ไม่ต้องใช้คอมพิวเตอร์",
      },
      { property: "og:title", content: "สแกนใบหน้าบนแท็บเล็ต | FaceGate" },
      { property: "og:description", content: "เปลี่ยนแท็บเล็ตเครื่องเก่าให้เป็นตู้สแกนใบหน้าเข้า-ออกโรงเรียน" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "manifest", href: "/tablet.webmanifest" }],
  }),
  component: TabletScanner,
});

type ScanResult = {
  result: "ok" | "duplicate" | "denied" | "unknown";
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

type RecentItem = {
  id: string;
  name: string;
  detail: string;
  role: string;
  direction: "in" | "out";
  scanned_at: string;
  avatar_url: string | null;
  snapshot_url: string | null;
};

type Live = { box: FaceBox; landmarks: FacePoint[]; frame: { width: number; height: number }; score: number };

const KEY_STORAGE = "facegate_tablet_device_key";
const DIR_STORAGE = "facegate_tablet_direction";

function personRole(s: NonNullable<ScanResult["student"]>) {
  if (s.person_type === "staff") {
    const parts = [s.department, s.position].filter(Boolean).join(" / ");
    return `บุคลากร${parts ? ` • ${parts}` : ""}`;
  }
  return `นักเรียน${s.class_room ? ` • ชั้น ${s.class_room}` : ""}`;
}

function TabletScanner() {
  const { t } = useCms();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const stoppedRef = useRef(false);

  const [deviceKey, setDeviceKey] = useState("");
  const [direction, setDirection] = useState<"auto" | "in" | "out">("auto");
  const [showConfig, setShowConfig] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [guide, setGuide] = useState<"idle" | "no_face" | "multiple_faces" | "scanning">("idle");
  const [live, setLive] = useState<Live | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [clock, setClock] = useState("");

  // Saved setup for this tablet.
  useEffect(() => {
    const key = localStorage.getItem(KEY_STORAGE) ?? "";
    const dir = (localStorage.getItem(DIR_STORAGE) as "auto" | "in" | "out" | null) ?? "auto";
    setDeviceKey(key);
    setDirection(dir);
    if (!key) setShowConfig(true);
  }, []);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("th-TH", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Camera + face models.
  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCamError("เปิดกล้องไม่สำเร็จ กรุณาอนุญาตให้ใช้กล้อง แล้วลองใหม่อีกครั้ง");
        return;
      }
      const { loadFaceApi } = await import("@/lib/face-web");
      await loadFaceApi();
      setLoadingModels(false);
      setReady(true);
    })();
    return () => {
      stoppedRef.current = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const speak = useCallback(
    (text?: string) => {
      if (!text || !voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "th-TH";
      const thai = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("th"));
      if (thai) utter.voice = thai;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    },
    [voiceOn],
  );

  const enableVoice = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const warm = new SpeechSynthesisUtterance(" ");
    warm.lang = "th-TH";
    window.speechSynthesis.speak(warm);
    setVoiceOn(true);
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/public/kiosk/recent");
      if (!res.ok) return;
      const body = (await res.json()) as { items?: RecentItem[] };
      setRecent(body.items ?? []);
    } catch {
      /* offline: keep the list we already have */
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    const id = setInterval(() => void loadRecent(), 15000);
    return () => clearInterval(id);
  }, [loadRecent]);

  /** Grabs the current frame as a small JPEG for the scan evidence photo. */
  const snapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return undefined;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    const scale = 320 / video.videoWidth;
    canvas.width = 320;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  // Scanning loop. Tablets are slow, so a frame is only measured when the
  // previous one has finished and the screen is not in the cooldown pause.
  useEffect(() => {
    if (!ready || !deviceKey) return;
    let timer: number | undefined;

    const loop = async () => {
      if (stoppedRef.current) return;
      const video = videoRef.current;
      if (!busyRef.current && video && video.videoWidth > 0) {
        busyRef.current = true;
        try {
          const { measureSingleFace } = await import("@/lib/face-web");
          const outcome = await measureSingleFace(video);
          if (outcome.status === "no_face") {
            setGuide("no_face");
            setLive(null);
          } else if (outcome.status === "multiple_faces") {
            setGuide("multiple_faces");
            setLive(null);
          } else {
            const face = outcome.face;
            setLive({ box: face.box, landmarks: face.landmarks, frame: face.frame, score: face.score });
            // Too far away: keep guiding instead of scanning a blurry face.
            if (face.coverage < 0.03) {
              setGuide("no_face");
            } else {
              setGuide("scanning");
              const res = await fetch("/api/public/kiosk/web-scan", {
                method: "POST",
                headers: { "content-type": "application/json", "x-device-key": deviceKey },
                body: JSON.stringify({
                  descriptor: face.descriptor,
                  geometry: face.geometry,
                  direction: direction === "auto" ? undefined : direction,
                  snapshot: snapshot(),
                }),
              });
              const body = (await res.json()) as ScanResult & { error?: string };
              if (body.error) {
                setResult({ result: "denied", message: "รหัสเครื่องไม่ถูกต้อง กรุณาตั้งค่าใหม่" });
                setShowConfig(true);
              } else {
                setResult(body);
                speak(body.speak);
                if (body.result === "ok") void loadRecent();
                const wait = Math.max(2, body.next_delay_seconds ?? 5);
                setCountdown(wait);
                for (let left = wait; left > 0; left -= 1) {
                  setCountdown(left);
                  await new Promise((r) => setTimeout(r, 1000));
                  if (stoppedRef.current) return;
                }
                setCountdown(0);
                setResult(null);
              }
            }
          }
        } catch {
          /* a failed frame is simply skipped */
        } finally {
          busyRef.current = false;
        }
      }
      timer = window.setTimeout(() => void loop(), 400);
    };

    void loop();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ready, deviceKey, direction, snapshot, speak, loadRecent]);

  const saveConfig = () => {
    localStorage.setItem(KEY_STORAGE, deviceKey.trim());
    localStorage.setItem(DIR_STORAGE, direction);
    setShowConfig(false);
  };

  const guideText =
    countdown > 0
      ? `เตรียมคนถัดไปใน ${countdown} วินาที`
      : guide === "multiple_faces"
        ? "มีมากกว่า 1 คนในกรอบ กรุณาเข้าทีละคน"
        : guide === "scanning"
          ? "กำลังตรวจสอบใบหน้า…"
          : guide === "no_face"
            ? "กรุณาเข้ามาในกรอบให้ใบหน้าเต็มวง"
            : "พร้อมสแกน";

  const frameColor =
    result?.result === "ok"
      ? "border-emerald-400"
      : result
        ? "border-rose-400"
        : guide === "multiple_faces"
          ? "border-amber-400"
          : guide === "scanning"
            ? "border-sky-400"
            : "border-white/50";

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{t("brand.school_name", "ระบบสแกนใบหน้า")}</p>
          <p className="text-xs text-white/60">
            โหมดแท็บเล็ต • {direction === "auto" ? "อัตโนมัติตามเวลา" : direction === "in" ? "สแกนเข้า" : "สแกนออก"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-sm text-white/70">{clock}</span>
          {!voiceOn && (
            <Button size="sm" variant="secondary" onClick={enableVoice}>
              <Volume2 className="mr-1 h-4 w-4" /> เปิดเสียง
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowConfig(true)} aria-label="ตั้งค่าเครื่อง">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="relative min-h-0 overflow-hidden rounded-3xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />
          {live && (
            <FaceBoxOverlay
              boxes={[live.box]}
              landmarks={live.landmarks}
              frame={live.frame}
              mirrored
              tech
              label={`ตรวจพบใบหน้า ${(live.score * 100).toFixed(0)}%`}
            />
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-[62%] w-[46%] rounded-[50%] border-4 border-dashed ${frameColor} transition-colors`} />
          </div>

          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4">
            <p className="text-center text-lg font-medium">
              {camError ?? (loadingModels ? "กำลังเตรียมระบบตรวจจับใบหน้า…" : guideText)}
            </p>
            {result && (
              <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
                {result.result === "ok" ? (
                  <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="h-8 w-8 shrink-0 text-rose-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{result.student?.full_name ?? result.message}</p>
                  {result.student && <p className="truncate text-sm text-white/70">{personRole(result.student)}</p>}
                </div>
                {result.avatar_url && (
                  <img src={result.avatar_url} alt="รูปโปรไฟล์" className="h-14 w-14 rounded-xl object-cover" />
                )}
                {result.snapshot_url && (
                  <img src={result.snapshot_url} alt="ภาพขณะสแกน" className="h-14 w-14 rounded-xl object-cover" />
                )}
              </div>
            )}
            {loadingModels && !camError && (
              <p className="flex items-center justify-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> โหลดครั้งแรกอาจใช้เวลาสักครู่
              </p>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded-3xl bg-white/5 p-3">
          <h2 className="mb-2 text-sm font-semibold text-white/80">รายการสแกนล่าสุด</h2>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {recent.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-2">
                {item.avatar_url ? (
                  <img src={item.avatar_url} alt={item.name} className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-white/60">{item.detail}</p>
                </div>
                <div className="text-right text-xs">
                  <p className={item.direction === "in" ? "text-emerald-400" : "text-sky-400"}>
                    {item.direction === "in" ? "เข้า" : "ออก"}
                  </p>
                  <p className="tabular-nums text-white/60">
                    {new Intl.DateTimeFormat("th-TH", {
                      timeZone: "Asia/Bangkok",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    }).format(new Date(item.scanned_at))}
                  </p>
                </div>
              </li>
            ))}
            {recent.length === 0 && <li className="text-sm text-white/50">ยังไม่มีการสแกนวันนี้</li>}
          </ul>
        </aside>
      </main>

      {showConfig && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-slate-900 p-5">
            <div>
              <h2 className="text-lg font-semibold">ตั้งค่าเครื่องสแกน</h2>
              <p className="text-sm text-white/60">ใส่รหัสเครื่อง (Device Key) ที่สร้างไว้ในหน้าตั้งค่าหลังบ้าน</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="device-key">รหัสเครื่อง</Label>
              <Input
                id="device-key"
                value={deviceKey}
                onChange={(e) => setDeviceKey(e.target.value)}
                placeholder="เช่น 3f9a…"
                className="bg-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>ทิศทางการสแกนของเครื่องนี้</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["auto", "in", "out"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={direction === value ? "default" : "secondary"}
                    onClick={() => setDirection(value)}
                  >
                    {value === "auto" ? "อัตโนมัติ" : value === "in" ? "เข้า" : "ออก"}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={saveConfig} disabled={!deviceKey.trim()}>
              เริ่มใช้งาน
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
