import type { FaceBox } from "@/lib/face-web";

/**
 * Draws the detected face rectangle on top of a video or photo so the operator
 * can see the system really found a face.
 */
export function FaceBoxOverlay({
  boxes,
  frame,
  mirrored = false,
  tone = "ok",
  label,
}: {
  boxes: FaceBox[];
  frame: { width: number; height: number };
  mirrored?: boolean;
  tone?: "ok" | "warn" | "bad";
  label?: string | undefined;
}) {
  if (!frame.width || !frame.height) return null;
  const color =
    tone === "ok" ? "border-primary" : tone === "warn" ? "border-accent" : "border-destructive";
  const text =
    tone === "ok" ? "bg-primary" : tone === "warn" ? "bg-accent" : "bg-destructive";

  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((b, i) => {
        const leftPct = mirrored
          ? 100 - ((b.x + b.width) / frame.width) * 100
          : (b.x / frame.width) * 100;
        return (
          <div
            key={i}
            className={`absolute rounded-lg border-2 ${color} transition-all duration-150`}
            style={{
              left: `${leftPct}%`,
              top: `${(b.y / frame.height) * 100}%`,
              width: `${(b.width / frame.width) * 100}%`,
              height: `${(b.height / frame.height) * 100}%`,
            }}
          >
            {label && i === 0 && (
              <span
                className={`absolute -top-6 left-0 rounded px-2 py-0.5 text-xs text-white ${text}`}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
