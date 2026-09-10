import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ScanFace,
  ShieldCheck,
  Users,
  Volume2,
  Download,
  LogOut,
  Settings2,
  BarChart3,
  Clock3,
  Fingerprint,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCms } from "@/lib/cms-client";
import heroImage from "@/assets/landing-hero.jpg";

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
    tint: "bg-sky-100 text-sky-600",
    titleKey: "home.feature1_title",
    bodyKey: "home.feature1_body",
  },
  {
    icon: Volume2,
    tint: "bg-orange-100 text-orange-500",
    titleKey: "home.feature2_title",
    bodyKey: "home.feature2_body",
  },
  {
    icon: ShieldCheck,
    tint: "bg-emerald-100 text-emerald-600",
    titleKey: "home.feature3_title",
    bodyKey: "home.feature3_body",
  },
  {
    icon: Users,
    tint: "bg-indigo-100 text-indigo-600",
    titleKey: "home.feature4_title",
    bodyKey: "home.feature4_body",
  },
];

const quickActions = [
  {
    icon: Download,
    title: "ดาวน์โหลดโปรแกรมสแกน",
    body: "ไฟล์ติดตั้งสำหรับ Windows และ Linux",
    to: "/download",
    primary: true,
  },
  {
    icon: Settings2,
    title: "เข้าสู่ระบบการใช้งาน",
    body: "ลงทะเบียนใบหน้า ตั้งค่าเวลา และจัดการผู้ใช้",
    to: "/admin",
    primary: false,
  },
  {
    icon: BarChart3,
    title: "รายงานเข้า-ออก",
    body: "ดูสรุปและดาวน์โหลดประวัติการสแกน",
    to: "/admin",
    primary: false,
  },
];

const highlights = [
  { icon: Clock3, label: "กำหนดช่วงเวลาเข้า-ออกได้เอง" },
  { icon: Fingerprint, label: "เทียบใบหน้าด้วย ArcFace ความแม่นยำสูง" },
  { icon: ShieldCheck, label: "กันสแกนซ้ำและบุคคลที่ไม่ลงทะเบียน" },
];

function Landing() {
  const { t } = useCms();
  const logo = t("brand.logo_url");

  return (
    <main className="min-h-screen bg-[#f6f9fd] text-[#132a4f]">
      {/* ===== Top nav ===== */}
      <header className="sticky top-0 z-30 border-b border-sky-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              <img
                src={logo}
                alt={t("brand.name")}
                className="size-10 rounded-xl object-contain transition-transform duration-300 hover:scale-105"
              />
            ) : (
              <span className="grid size-10 place-items-center rounded-xl bg-[#1d6fe0] text-white shadow-md shadow-blue-500/30">
                <ScanFace className="size-5" />
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-lg font-bold">{t("brand.name")}</p>
              <p className="truncate text-xs text-slate-500">{t("brand.school_name")}</p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-full bg-sky-50 p-1 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#1d6fe0] hover:shadow-sm">
              ฟีเจอร์
            </a>
            <a href="#how" className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#1d6fe0] hover:shadow-sm">
              วิธีใช้งาน
            </a>
            <a href="#contact" className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#1d6fe0] hover:shadow-sm">
              ติดต่อ
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden whitespace-nowrap rounded-full text-slate-600 hover:text-[#1d6fe0] lg:inline-flex"
            >
              <Link to="/admin">เข้าสู่ระบบการใช้งาน</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="whitespace-nowrap rounded-full bg-[#1d6fe0] px-4 text-white shadow-md shadow-blue-500/30 transition-all hover:bg-[#155fc4] hover:shadow-lg hover:shadow-blue-500/40 sm:px-5"
            >
              <Link to="/download">ดาวน์โหลดโปรแกรมสแกน</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-sky-200/50 blur-3xl" />
        <div className="pointer-events-none absolute top-32 -right-24 size-96 rounded-full bg-blue-200/40 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 pt-14 pb-0 text-center sm:px-6">
          <p className="animate-rise text-xs font-semibold text-[#1d6fe0] sm:tracking-[0.18em]">
            {t("home.eyebrow")}
          </p>
          <h1 className="animate-rise mx-auto mt-4 max-w-6xl text-balance font-display text-4xl leading-[1.2] font-bold sm:text-5xl lg:whitespace-nowrap lg:text-6xl [animation-delay:0.08s]">
            {t("home.title")}
          </h1>
          <p className="animate-rise mx-auto mt-5 max-w-4xl text-pretty text-base leading-8 text-slate-500 sm:text-lg lg:whitespace-nowrap [animation-delay:0.15s]">
            {t("home.subtitle")}
          </p>
          <div className="animate-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:0.22s]">
            <Button
              asChild
              size="lg"
              className="whitespace-nowrap rounded-full bg-[#1d6fe0] px-8 text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 hover:bg-[#155fc4]"
            >
              <Link to="/download">ดาวน์โหลดโปรแกรมสแกน</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="whitespace-nowrap rounded-full border-sky-200 bg-white px-8 text-[#1d6fe0] transition-all hover:-translate-y-0.5 hover:bg-sky-50"
            >
              <Link to="/admin">เข้าสู่ระบบการใช้งาน</Link>
            </Button>
          </div>
        </div>

        {/* Hero image */}
        <div className="relative mx-auto mt-12 max-w-5xl px-6">
          <div className="animate-soft-in overflow-hidden rounded-[2rem] border-8 border-white shadow-2xl shadow-blue-900/15">
            <img
              src={heroImage}
              alt="ตู้สแกนใบหน้า FaceGate ที่หน้าโรงเรียน"
              className="aspect-16/9 w-full object-cover sm:aspect-2/1"
              width={1280}
              height={768}
            />
          </div>
        </div>

        {/* Quick actions card */}
        <div className="relative mx-auto -mt-10 max-w-4xl px-6">
          <div className="animate-rise grid gap-3 rounded-3xl border border-sky-100 bg-white p-4 shadow-xl shadow-blue-900/10 sm:grid-cols-3 [animation-delay:0.3s]">
            {quickActions.map((a) => (
              <Link
                key={a.title}
                to={a.to}
                className={`group flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 ${
                  a.primary
                    ? "bg-[#1d6fe0] text-white shadow-md shadow-blue-500/30 hover:bg-[#155fc4]"
                    : "bg-sky-50 text-[#132a4f] hover:bg-sky-100"
                }`}
              >
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${
                    a.primary ? "bg-white/20" : "bg-white text-[#1d6fe0] shadow-sm"
                  }`}
                >
                  <a.icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{a.title}</span>
                  <span className={`block text-xs ${a.primary ? "text-blue-100" : "text-slate-500"}`}>
                    {a.body}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-[#1d6fe0] uppercase">ฟีเจอร์หลัก</p>
          <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            {t("home.features_title")}
          </h2>
        </div>
        <div className="stagger-children mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.titleKey}
              className="group rounded-3xl border border-sky-100 bg-white p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-blue-900/10"
            >
              <span
                className={`mx-auto grid size-14 place-items-center rounded-full ${f.tint} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}
              >
                <f.icon className="size-6" />
              </span>
              <h3 className="mt-5 text-base font-semibold">{t(f.titleKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(f.bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid items-center gap-10 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b3b7a] to-[#1d6fe0] p-8 text-white shadow-2xl shadow-blue-900/25 md:grid-cols-2 md:p-12">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-sky-200 uppercase">วิธีใช้งาน</p>
            <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
              ลงทะเบียนครั้งเดียว สแกนได้ทุกวัน
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-blue-100 sm:text-base">
              ผู้ดูแลลงทะเบียนใบหน้านักเรียนและบุคลากรผ่านหลังบ้าน จากนั้นตู้สแกนหน้าโรงเรียนจะจำใบหน้า
              ขานชื่อด้วยเสียง และบันทึกเวลาเข้า-ออกให้อัตโนมัติ
            </p>
            <ul className="mt-6 space-y-3">
              {highlights.map((h) => (
                <li key={h.label} className="flex items-center gap-3 text-sm sm:text-base">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15">
                    <h.icon className="size-4" />
                  </span>
                  {h.label}
                </li>
              ))}
            </ul>
            <Button
              asChild
              size="lg"
              className="mt-8 rounded-full bg-white px-8 text-[#0b3b7a] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-sky-50"
            >
              <Link to="/download">ดาวน์โหลดโปรแกรมสแกน</Link>
            </Button>
          </div>
          <div className="animate-float-soft">
            <img
              src={heroImage}
              alt="นักเรียนใช้ตู้สแกนใบหน้า"
              loading="lazy"
              width={1280}
              height={768}
              className="aspect-4/3 w-full rounded-2xl border-4 border-white/25 object-cover shadow-xl"
            />
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer id="contact" className="border-t border-sky-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-slate-500">
          <span className="flex items-center gap-2">
            {logo ? (
              <img src={logo} alt="" className="size-6 rounded-md object-contain" />
            ) : (
              <ScanFace className="size-5 text-[#1d6fe0]" />
            )}
            <span className="font-semibold text-[#132a4f]">{t("brand.name")}</span>
            · {t("brand.school_name")}
          </span>
          <span className="flex items-center gap-2">
            <Phone className="size-4 text-[#1d6fe0]" />
            {t("home.footer")}
          </span>
        </div>
      </footer>
    </main>
  );
}
