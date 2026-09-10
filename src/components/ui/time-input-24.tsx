import { cn } from "@/lib/utils";

/**
 * ช่องกรอกเวลาแบบ 24 ชั่วโมง (HH:MM) — แทน <input type="time">
 * ที่บางเบราว์เซอร์แสดงเป็น AM/PM ตาม locale ของเครื่อง
 * value: "HH:MM" หรือ "HH:MM:SS"
 */
export function TimeInput24({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [hh = "", mm = ""] = String(value).slice(0, 5).split(":");

  const emit = (h: string, m: string) => {
    if (h === "" || m === "") return;
    onChange(`${h}:${m}`);
  };

  const selectCls =
    "h-10 w-full rounded-md border border-input bg-background px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <select
        aria-label="ชั่วโมง"
        className={selectCls}
        value={hh}
        onChange={(e) => emit(e.target.value, mm || "00")}
      >
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="font-semibold text-muted-foreground">:</span>
      <select
        aria-label="นาที"
        className={selectCls}
        value={mm}
        onChange={(e) => emit(hh || "00", e.target.value)}
      >
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
