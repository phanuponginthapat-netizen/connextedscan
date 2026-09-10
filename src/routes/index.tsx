import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanFace, ShieldCheck, Users, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FaceGate | ระบบสแกนใบหน้าเข้า-ออกโรงเรียน" },
      {
        name: "description",
        content:
          "ตู้สแกนใบหน้าเข้า-ออกโรงเรียนด้วย ArcFace พร้อมระบบลงทะเบียนใบหน้า เสียงขานชื่อ และกันสแกนซ้ำ",
      },
      { property: "og:title", content: "FaceGate | ระบบสแกนใบหน้าเข้า-ออกโรงเรียน" },
      {
        property: "og:description",
        content: "ตู้สแกนใบหน้าเข้า-ออกโรงเรียน พร้อมหลังบ้านลงทะเบียนใบหน้าและรายงาน",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: ScanFace,
    title: "จดจำใบหน้าแม่นยำ",
    body: "ประมวลผลด้วย ArcFace บนเครื่องตู้ ทำงานได้แม้อินเทอร์เน็ตหลุด",
  },
  {
    icon: Volume2,
    title: "ขานชื่ออัตโนมัติ",
    body: "พูด “สแกนสำเร็จ” พร้อมชื่อ แล้วนับถอยหลังเรียกคนถัดไป",
  },
  {
    icon: ShieldCheck,
    title: "กันสแกนซ้ำ",
    body: "ตั้งเวลาเว้นระยะได้ ใครยังไม่ลงทะเบียนจะไม่ผ่านประตู",
  },
  {
    icon: Users,
    title: "ลงทะเบียนหลายรูป",
    body: "อัปโหลดรูปหลายมุม หรือถ่ายสดแบบตรวจจับการมีชีวิต",
  },
];

function Landing() {
  return (
    <main className="min-h-screen">
      <section className="kiosk-shell text-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <p className="text-sm font-medium tracking-[0.3em] text-accent uppercase">FaceGate</p>
          <h1 className="mt-4 text-4xl leading-tight font-bold sm:text-5xl">
            ระบบสแกนใบหน้าเข้า-ออกโรงเรียน
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300">
            ตู้สแกนสำหรับเครื่อง PC สเปกเบา ทำงานคู่กับโปรแกรมจดจำใบหน้าในเครื่อง
            พร้อมหลังบ้านสำหรับลงทะเบียนใบหน้า ตั้งเวลาเข้า-ออก และดูรายงานย้อนหลัง
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/kiosk">เปิดหน้าจอตู้สแกน</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/admin">เข้าระบบหลังบ้าน</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 py-16 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-panel">
            <f.icon className="size-7 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
