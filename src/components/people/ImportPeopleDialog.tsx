import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { PersonType } from "./people";

type Row = {
  student_code: string;
  full_name: string;
  nickname: string | null;
  class_room: string | null;
  department: string | null;
  position: string | null;
  guardian_phone: string | null;
  person_type: PersonType;
};

/** Accepted column names, Thai and English. */
const HEADER_MAP: Record<string, keyof Row> = {
  รหัส: "student_code",
  รหัสนักเรียน: "student_code",
  รหัสบุคลากร: "student_code",
  code: "student_code",
  student_code: "student_code",
  id: "student_code",
  ชื่อ: "full_name",
  "ชื่อ-นามสกุล": "full_name",
  ชื่อนามสกุล: "full_name",
  name: "full_name",
  full_name: "full_name",
  ชื่อเล่น: "nickname",
  nickname: "nickname",
  ห้อง: "class_room",
  ชั้น: "class_room",
  "ชั้น/ห้อง": "class_room",
  class: "class_room",
  class_room: "class_room",
  room: "class_room",
  ฝ่าย: "department",
  แผนก: "department",
  "ฝ่าย/แผนก": "department",
  department: "department",
  ตำแหน่ง: "position",
  position: "position",
  เบอร์โทร: "guardian_phone",
  โทรศัพท์: "guardian_phone",
  เบอร์ผู้ปกครอง: "guardian_phone",
  phone: "guardian_phone",
  guardian_phone: "guardian_phone",
};

function normaliseHeader(value: string): keyof Row | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, "");
  const direct = HEADER_MAP[value.trim()] ?? HEADER_MAP[key];
  return direct ?? null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

async function readSheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const first = book.SheetNames[0];
  if (!first) return [];
  const sheet = book.Sheets[first];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
}

function toRows(grid: string[][], personType: PersonType) {
  const [headerRow, ...body] = grid;
  if (!headerRow) return { rows: [] as Row[], skipped: 0, columns: [] as string[] };

  const columns = headerRow.map((h) => normaliseHeader(String(h ?? "")));
  const rows: Row[] = [];
  let skipped = 0;

  for (const line of body) {
    const record: Partial<Row> = {};
    columns.forEach((key, index) => {
      if (!key) return;
      const value = String(line[index] ?? "").trim();
      if (value) (record as Record<string, string>)[key] = value;
    });
    if (!record.student_code || !record.full_name) {
      if (line.some((c) => String(c ?? "").trim() !== "")) skipped += 1;
      continue;
    }
    rows.push({
      student_code: record.student_code,
      full_name: record.full_name,
      nickname: record.nickname ?? null,
      class_room: personType === "student" ? (record.class_room ?? null) : null,
      department: personType === "staff" ? (record.department ?? null) : null,
      position: personType === "staff" ? (record.position ?? null) : null,
      guardian_phone: record.guardian_phone ?? null,
      person_type: personType,
    });
  }

  return {
    rows,
    skipped,
    columns: headerRow.map((h) => String(h ?? "")),
  };
}

/** Bulk create people from a CSV or Excel file. */
export function ImportPeopleDialog({
  personType,
  label,
}: {
  personType: PersonType;
  label: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ rows: Row[]; skipped: number; columns: string[] } | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    try {
      const grid = await readSheet(file);
      const parsed = toRows(grid, personType);
      setFileName(file.name);
      setPreview(parsed);
      if (parsed.rows.length === 0) {
        toast.error("ไม่พบข้อมูลที่อ่านได้ ต้องมีคอลัมน์ รหัส และ ชื่อ-นามสกุล");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ");
    }
  };

  const importRows = useMutation({
    mutationFn: async () => {
      const rows = preview?.rows ?? [];
      let saved = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase
          .from("students")
          .upsert(chunk, { onConflict: "student_code" });
        if (error) throw error;
        saved += chunk.length;
      }
      return saved;
    },
    onSuccess: (saved) => {
      toast.success(`นำเข้า${label} ${saved} รายชื่อแล้ว`);
      setOpen(false);
      setPreview(null);
      setFileName("");
      qc.invalidateQueries({ queryKey: ["people", personType] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPreview(null);
          setFileName("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FileSpreadsheet className="size-4" /> นำเข้าจากไฟล์
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>นำเข้า{label}จากไฟล์ Excel หรือ CSV</DialogTitle>
          <DialogDescription>
            ไฟล์ต้องมีหัวคอลัมน์บรรทัดแรก อย่างน้อย “รหัส” และ “ชื่อ-นามสกุล”
            {personType === "student"
              ? " เพิ่มคอลัมน์ ชั้น/ห้อง, ชื่อเล่น, เบอร์ผู้ปกครอง ได้"
              : " เพิ่มคอลัมน์ ฝ่าย/แผนก, ตำแหน่ง, ชื่อเล่น, เบอร์โทร ได้"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pick(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> เลือกไฟล์ (.xlsx, .xls, .csv)
          </Button>

          {fileName && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="truncate font-medium">{fileName}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>อ่านได้ {preview?.rows.length ?? 0} รายชื่อ</Badge>
                {(preview?.skipped ?? 0) > 0 && (
                  <Badge variant="destructive">ข้าม {preview?.skipped} บรรทัด</Badge>
                )}
              </div>
              {(preview?.rows.length ?? 0) > 0 && (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {preview?.rows.slice(0, 20).map((r) => (
                    <li key={r.student_code} className="truncate">
                      {r.student_code} — {r.full_name}
                      {r.class_room ? ` • ${r.class_room}` : ""}
                      {r.department ? ` • ${r.department}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                รหัสที่มีอยู่แล้วจะถูกอัปเดตข้อมูลให้ตรงกับไฟล์ ไม่สร้างซ้ำ
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => importRows.mutate()}
            disabled={(preview?.rows.length ?? 0) === 0 || importRows.isPending}
          >
            {importRows.isPending ? "กำลังนำเข้า…" : `นำเข้า ${preview?.rows.length ?? 0} รายชื่อ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
