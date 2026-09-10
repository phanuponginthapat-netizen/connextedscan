export type PersonType = "student" | "staff";

export const personLabels: Record<
  PersonType,
  {
    title: string;
    addNew: string;
    code: string;
    group: string;
    extra: string;
    empty: string;
    searchPlaceholder: string;
    deleteConfirm: string;
    subtitle: string;
  }
> = {
  student: {
    title: "นักเรียน",
    addNew: "เพิ่มนักเรียน",
    code: "รหัสนักเรียน",
    group: "ชั้น/ห้อง",
    extra: "เบอร์ผู้ปกครอง",
    empty: "ยังไม่มีข้อมูลนักเรียน",
    searchPlaceholder: "ค้นหาชื่อ รหัส หรือห้อง",
    deleteConfirm: "ลบนักเรียนคนนี้พร้อมข้อมูลใบหน้าทั้งหมด?",
    subtitle: "เฉพาะนักเรียนที่ลงทะเบียนใบหน้าแล้วเท่านั้นที่ผ่านตู้สแกนได้",
  },
  staff: {
    title: "บุคลากร",
    addNew: "เพิ่มบุคลากร",
    code: "รหัสบุคลากร",
    group: "ฝ่าย/แผนก",
    extra: "เบอร์ติดต่อ",
    empty: "ยังไม่มีข้อมูลบุคลากร",
    searchPlaceholder: "ค้นหาชื่อ รหัส หรือฝ่าย",
    deleteConfirm: "ลบบุคลากรคนนี้พร้อมข้อมูลใบหน้าทั้งหมด?",
    subtitle: "เฉพาะบุคลากรที่ลงทะเบียนใบหน้าแล้วเท่านั้นที่ผ่านตู้สแกนได้",
  },
};

export function personGroupLabel(p: {
  person_type?: string | null;
  class_room?: string | null;
  department?: string | null;
  position?: string | null;
}) {
  if (p.person_type === "staff") {
    return [p.department, p.position].filter(Boolean).join(" • ") || "ไม่ระบุฝ่าย";
  }
  return p.class_room ?? "ไม่ระบุห้อง";
}

export function personTypeLabel(t?: string | null) {
  return t === "staff" ? "บุคลากร" : "นักเรียน";
}
