import type { FaceBox, FacePoint } from "@/lib/face-web";

const FACE_PATHS = [
  [0, 16], [17, 21], [22, 26], [27, 30], [30, 35],
  [36, 41], [42, 47], [48, 59], [60, 67],
] as const;

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
  landmarks = [],
  tech = false,
}: {
  boxes: FaceBox[];
  frame: { width: number; height: number };
  mirrored?: boolean;
  tone?: "ok" | "warn" | "bad";
  label?: string | undefined;
  landmarks?: FacePoint[] | undefined;
  tech?: boolean;
}) {
  if (!frame.width || !frame.height) return null;
  const color =
    tone === "ok" ? "border-primary" : tone === "warn" ? "border-accent" : "border-destructive";
  const text =
    tone === "ok" ? "bg-primary" : tone === "warn" ? "bg-accent" : "bg-destructive";

  return (
    <div className="pointer-events-none absolute inset-0">
      {landmarks.length > 0 && (
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-hidden="true">
          <g className={`${tone === "bad" ? "text-destructive" : "text-primary"} ${tech ? "animate-face-pulse" : ""}`}>
            {landmarks.length >= 68
              ? FACE_PATHS.map(([start, end]) => (
                  <polyline key={`${start}-${end}`} points={landmarks.slice(start, end + 1).map((p) => `${mirrored ? frame.width - p.x : p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={tech ? 1.7 : 1.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.9" />
                ))
              : landmarks.length >= 5 && (
                  <>
                    <polyline points={[landmarks[0], landmarks[2], landmarks[1]].filter((p): p is FacePoint => Boolean(p)).map((p) => `${mirrored ? frame.width - p.x : p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.7" vectorEffect="non-scaling-stroke" opacity="0.7" />
                    <polyline points={[landmarks[3], landmarks[2], landmarks[4]].filter((p): p is FacePoint => Boolean(p)).map((p) => `${mirrored ? frame.width - p.x : p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.7" vectorEffect="non-scaling-stroke" opacity="0.7" />
                  </>
                )}
            {landmarks.map((p, index) => <circle key={index} cx={mirrored ? frame.width - p.x : p.x} cy={p.y} r={tech ? 2.1 : 1.5} fill="currentColor" vectorEffect="non-scaling-stroke" />)}
          </g>
        </svg>
      )}
      {boxes.map((b, i) => {
        const leftPct = mirrored
          ? 100 - ((b.x + b.width) / frame.width) * 100
          : (b.x / frame.width) * 100;
        return (
          <div
            key={i}
            className={`absolute rounded-lg border-2 ${color} transition-all duration-150 ${tech ? "face-detection-box" : ""}`}
            style={{
              left: `${leftPct}%`,
              top: `${(b.y / frame.height) * 100}%`,
              width: `${(b.width / frame.width) * 100}%`,
              height: `${(b.height / frame.height) * 100}%`,
            }}
          >
            {label && i === 0 && (
              <span
                className={`absolute -top-7 left-0 rounded px-2 py-1 text-xs text-primary-foreground ${text}`}
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
