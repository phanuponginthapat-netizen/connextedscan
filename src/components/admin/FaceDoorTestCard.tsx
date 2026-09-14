import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ScanFace, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AGENT_URL = "http://127.0.0.1:8899";

type ScanReply = {
  result?: string;
  name?: string;
  confidence?: number;
  message?: string;
  door?: string;
};

type DoorStatus = { connected?: boolean; port?: string | null; last_reply?: string | null };

const DOOR_TEXT: Record<string, string> = {
  opened: "micro:bit ยกไม้กั้นขึ้นแล้ว",
  locked: "micro:bit ปฏิเสธและปิดค้างไว้",
  offline: "ไม่พบ micro:bit ที่เสียบกับเครื่องนี้",
  free: "อยู่ในช่วงเปิดค้างอิสระ ไม้กั้นยกอยู่แล้ว",
};

const RESULT_TEXT: Record<string, string> = {
  ok: "จำใบหน้าได้",
  denied: "ไม่ผ่าน — ไม่พบข้อมูลใบหน้านี้",
  duplicate: "สแกนซ้ำ",
  multiple_faces: "มีหลายใบหน้าในกรอบ",
  no_face: "ยังไม่เห็นใบหน้าในกรอบ",
};

/**
 * Staff-facing rehearsal of a real scan: the camera frame goes to the local
 * FaceGate processor with test mode on, so the micro:bit reacts exactly like a
 * real check-in while nothing is written into the attendance history.
 */
export function FaceDoorTestCard() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<ScanReply | null>(null);
  const [door, setDoor] = useState<DoorStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const res = await fetch(`${AGENT_URL}/door/status`, {
          signal: AbortSignal.timeout(3000),
        });
        const body = (await res.json()) as DoorStatus;
        if (!cancelled) setDoor(body);
      } catch {
        if (!cancelled) setDoor(null);
      }
    };
    void read();
    const timer = window.setInterval(read, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
    } catch {
      toast.error("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์");
    }
  };

  const runTest = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast.error("กล้องยังไม่พร้อม กรุณากดเปิดกล้องก่อน");
      return;
    }
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.82);

      const res = await fetch(`${AGENT_URL}/test/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
        signal: AbortSignal.timeout(20000),
      });
      const body = (await res.json()) as ScanReply;
      setReply(body);
      if (body.result === "ok") toast.success("ทดสอบสำเร็จ — ดูผลของประตูด้านล่าง");
      else toast.message(RESULT_TEXT[body.result ?? ""] ?? body.message ?? "ทดสอบเสร็จแล้ว");
    } catch {
      toast.error(
        "เชื่อมต่อตัวประมวลผลใบหน้าไม่ได้ — ต้องเปิดหน้านี้บนเครื่องตู้สแกนที่โปรแกรมกำลังทำงาน",
      );
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanFace className="size-4 text-primary" /> ทดสอบสแกนใบหน้า + ประตูอัจฉริยะ
        </CardTitle>
        <CardDescription>
          ถ่ายภาพหน้าหนึ่งครั้งเพื่อดูว่าระบบจำใบหน้าได้ และ micro:bit ยกไม้กั้นตามหรือไม่ —
          การทดสอบนี้ไม่บันทึกลงประวัติการสแกน
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={door?.connected ? "default" : "secondary"} className="gap-1">
            {door?.connected ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {door?.connected
              ? `พบ micro:bit ที่ ${door.port ?? "พอร์ต USB"}`
              : "ยังไม่พบ micro:bit"}
          </Badge>
          {door?.last_reply && (
            <Badge variant="outline">คำตอบล่าสุด: {door.last_reply}</Badge>
          )}
        </div>

        <div className="relative overflow-hidden rounded-xl border bg-muted/40">
          <video
            ref={videoRef}
            muted
            playsInline
            className="aspect-video w-full scale-x-[-1] object-cover"
          />
          {!live && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              กดปุ่ม "เปิดกล้อง" เพื่อเริ่มทดสอบ
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={live ? "secondary" : "default"} onClick={() => void startCamera()}>
            <Camera className="size-4" /> {live ? "เปิดกล้องใหม่" : "เปิดกล้อง"}
          </Button>
          <Button disabled={!live || busy} onClick={() => void runTest()}>
            {busy ? "กำลังทดสอบ..." : "ทดสอบสแกนและสั่งประตู"}
          </Button>
        </div>

        {reply && (
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <p className="font-medium">
              ผลการจำใบหน้า: {RESULT_TEXT[reply.result ?? ""] ?? reply.result ?? "-"}
              {reply.name ? ` — ${reply.name}` : ""}
            </p>
            {typeof reply.confidence === "number" && (
              <p className="text-xs text-muted-foreground">
                ความมั่นใจ {(reply.confidence * 100).toFixed(1)}%
              </p>
            )}
            <p>
              ผลของประตู:{" "}
              <span className="font-medium">
                {DOOR_TEXT[reply.door ?? ""] ??
                  (reply.door ? reply.door : "ไม่มีการสั่งงานประตูจากผลนี้")}
              </span>
            </p>
            {reply.message && <p className="text-xs text-muted-foreground">{reply.message}</p>}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          ต้องเปิดหน้านี้บนเครื่องตู้สแกนที่ต่อ micro:bit และเปิดโปรแกรม FaceGate อยู่
          หากใช้เครื่องอื่นจะทดสอบไม่ได้
        </p>
      </CardContent>
    </Card>
  );
}
