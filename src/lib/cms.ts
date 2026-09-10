// Central dictionary of every editable string / brand value in the system.
// Values live in public.site_content (key -> value). Defaults below are used
// whenever a key has not been customised in the admin CMS page.

export type CmsField = {
  key: string;
  label: string;
  default: string;
  type?: "text" | "textarea" | "color" | "url";
  help?: string;
};

export type CmsGroup = {
  id: string;
  title: string;
  description: string;
  fields: CmsField[];
};

export const CMS_GROUPS: CmsGroup[] = [
  {
    id: "brand",
    title: "แบรนด์และสีของระบบ",
    description: "ชื่อระบบ โลโก้ และสีหลักที่ใช้ทั้งเว็บ",
    fields: [
      { key: "brand.name", label: "ชื่อระบบ", default: "FaceGate" },
      { key: "brand.tagline", label: "คำอธิบายสั้น", default: "ระบบสแกนใบหน้าเข้า-ออกโรงเรียน" },
      { key: "brand.school_name", label: "ชื่อโรงเรียน/หน่วยงาน", default: "โรงเรียนของเรา" },
      { key: "brand.logo_url", label: "ลิงก์โลโก้ (ถ้ามี)", default: "", type: "url" },
      { key: "brand.primary_color", label: "สีหลัก", default: "#0B3B7A", type: "color" },
      { key: "brand.accent_color", label: "สีเน้น", default: "#1D6FE0", type: "color" },
      { key: "brand.surface_color", label: "สีพื้นหลัง", default: "#F4F7FB", type: "color" },
    ],
  },
  {
    id: "home",
    title: "หน้าแรกของเว็บ",
    description: "ข้อความบนหน้าแรกและปุ่มต่าง ๆ",
    fields: [
      { key: "home.eyebrow", label: "ข้อความเหนือหัวเรื่อง", default: "ระบบบันทึกเวลาด้วยใบหน้า" },
      { key: "home.title", label: "หัวเรื่องใหญ่", default: "ระบบสแกนใบหน้าเข้า-ออกโรงเรียน" },
      {
        key: "home.subtitle",
        label: "คำอธิบายใต้หัวเรื่อง",
        type: "textarea",
        default:
          "บันทึกเวลาเข้า-ออกด้วยใบหน้า ใช้งานได้ทั้งบนเว็บและตู้สแกน พร้อมหลังบ้านสำหรับลงทะเบียนใบหน้า ตั้งเวลาเข้า-ออก และดูรายงานย้อนหลัง",
      },
      { key: "home.cta_primary", label: "ปุ่มหลัก", default: "เปิดหน้าจอตู้สแกน" },
      { key: "home.cta_secondary", label: "ปุ่มรอง", default: "เข้าระบบหลังบ้าน" },
      { key: "home.features_title", label: "หัวข้อส่วนคุณสมบัติ", default: "ความสามารถของระบบ" },
      { key: "home.feature1_title", label: "คุณสมบัติ 1 – หัวข้อ", default: "จดจำใบหน้าแม่นยำ" },
      {
        key: "home.feature1_body",
        label: "คุณสมบัติ 1 – รายละเอียด",
        type: "textarea",
        default: "ประมวลผลด้วย ArcFace บนเครื่องตู้ ทำงานได้แม้อินเทอร์เน็ตหลุด",
      },
      { key: "home.feature2_title", label: "คุณสมบัติ 2 – หัวข้อ", default: "ขานชื่ออัตโนมัติ" },
      {
        key: "home.feature2_body",
        label: "คุณสมบัติ 2 – รายละเอียด",
        type: "textarea",
        default: "พูด “สแกนสำเร็จ” พร้อมชื่อ แล้วนับถอยหลังเรียกคนถัดไป",
      },
      { key: "home.feature3_title", label: "คุณสมบัติ 3 – หัวข้อ", default: "กันสแกนซ้ำ" },
      {
        key: "home.feature3_body",
        label: "คุณสมบัติ 3 – รายละเอียด",
        type: "textarea",
        default: "ตั้งเวลาเว้นระยะได้ ใครยังไม่ลงทะเบียนจะไม่ผ่านประตู",
      },
      { key: "home.feature4_title", label: "คุณสมบัติ 4 – หัวข้อ", default: "ลงทะเบียนหลายรูป" },
      {
        key: "home.feature4_body",
        label: "คุณสมบัติ 4 – รายละเอียด",
        type: "textarea",
        default: "อัปโหลดรูปหลายมุม หรือถ่ายสดพร้อมตรวจคุณภาพใบหน้า",
      },
      { key: "home.footer", label: "ข้อความท้ายหน้า", default: "ระบบบันทึกเวลาด้วยใบหน้า" },
    ],
  },
  {
    id: "kiosk",
    title: "หน้าจอตู้สแกน",
    description: "ข้อความที่แสดงบนหน้าจอสแกนใบหน้า",
    fields: [
      { key: "kiosk.title", label: "หัวเรื่องหน้าจอ", default: "สแกนใบหน้าเข้า-ออก" },
      { key: "kiosk.subtitle", label: "คำอธิบาย", default: "ยืนให้ใบหน้าอยู่ในกรอบทีละคน" },
      { key: "kiosk.guide_idle", label: "ข้อความเมื่อรอสแกน", default: "กรุณายืนให้ใบหน้าอยู่ในกรอบ" },
      { key: "kiosk.guide_no_face", label: "ข้อความเมื่อไม่พบใบหน้า", default: "ไม่พบใบหน้า กรุณาเข้าใกล้กล้อง" },
      {
        key: "kiosk.guide_multiple",
        label: "ข้อความเมื่อพบหลายใบหน้า",
        default: "พบหลายใบหน้า กรุณาสแกนทีละคน",
      },
      { key: "kiosk.guide_scanning", label: "ข้อความระหว่างตรวจ", default: "กำลังตรวจใบหน้า…" },
      { key: "kiosk.next_person", label: "ข้อความเรียกคนถัดไป", default: "เชิญคนถัดไป" },
      { key: "kiosk.denied", label: "ข้อความเมื่อไม่ผ่าน", default: "ไม่พบข้อมูลผู้ลงทะเบียน" },
    ],
  },
  {
    id: "system",
    title: "ข้อความในระบบหลังบ้าน",
    description: "ชื่อเมนู ปุ่ม และข้อความทั่วไปในหลังบ้าน",
    fields: [
      { key: "nav.dashboard", label: "เมนู – ภาพรวม", default: "ภาพรวม" },
      { key: "nav.students", label: "เมนู – นักเรียน", default: "นักเรียน" },
      { key: "nav.staff", label: "เมนู – บุคลากร", default: "บุคลากร" },
      { key: "nav.attendance", label: "เมนู – ประวัติเข้า-ออก", default: "ประวัติเข้า-ออก" },
      { key: "nav.install", label: "เมนู – ติดตั้งตู้สแกน", default: "ติดตั้งตู้สแกน" },
      { key: "nav.cms", label: "เมนู – จัดการเนื้อหา", default: "จัดการเนื้อหา" },
      { key: "nav.settings", label: "เมนู – ตั้งค่า", default: "ตั้งค่า" },
      { key: "action.back", label: "ปุ่ม – ย้อนกลับ", default: "ย้อนกลับ" },
      { key: "action.forward", label: "ปุ่ม – ไปต่อ", default: "ไปต่อ" },
      { key: "action.dashboard", label: "ปุ่ม – หน้าภาพรวม", default: "หน้าภาพรวม" },
      { key: "action.kiosk", label: "ปุ่ม – ไปหน้าสแกน", default: "ไปหน้าสแกน" },
      { key: "action.logout", label: "ปุ่ม – ออกจากระบบ", default: "ออกจากระบบ" },
      { key: "auth.title", label: "หน้าเข้าสู่ระบบ – หัวเรื่อง", default: "เข้าสู่ระบบหลังบ้าน" },
      {
        key: "auth.subtitle",
        label: "หน้าเข้าสู่ระบบ – คำอธิบาย",
        default: "สำหรับผู้ดูแลระบบและเจ้าหน้าที่",
      },
    ],
  },
];

export const CMS_FIELDS: CmsField[] = CMS_GROUPS.flatMap((g) => g.fields);

export const CMS_DEFAULTS: Record<string, string> = Object.fromEntries(
  CMS_FIELDS.map((f) => [f.key, f.default]),
);

export type CmsMap = Record<string, string>;

export function cmsValue(map: CmsMap | undefined, key: string): string {
  const v = map?.[key];
  if (v !== undefined && v !== "") return v;
  return CMS_DEFAULTS[key] ?? "";
}
