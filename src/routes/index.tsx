import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanFace, ShieldCheck, Users, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCms } from "@/lib/cms-client";

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

const icons = [ScanFace, Volume2, ShieldCheck, Users];

function Landing() {
  const { t } = useCms();
  const logo = t("brand.logo_url");

  const features = [1, 2, 3, 4].map((n, i) => ({
    icon: icons[i]!,
    title: t(`home.feature${n}_title`),
    body: t(`home.feature${n}_body`),
  }));

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt={t("brand.name")} className="size-9 rounded-md object-contain transition-transform duration-300 hover:scale-105" />
            ) : (
              <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
                <ScanFace className="size-5" />
              </span>
            )}
            <div className="leading-tight">
              <p className="font-display text-base font-semibold">{t("brand.name")}</p>
              <p className="text-xs text-muted-foreground">{t("brand.school_name")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin">{t("home.cta_secondary")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/kiosk">{t("home.cta_primary")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="brand-hero text-slate-100">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] text-slate-300 uppercase">
              {t("home.eyebrow")}
            </p>
            <h1 className="animate-rise mt-4 font-display text-4xl leading-tight font-bold sm:text-5xl">
              {t("home.title")}
            </h1>
            <p className="animate-rise mt-5 max-w-xl text-base leading-relaxed text-slate-300 [animation-delay:0.1s]">
              {t("home.subtitle")}
            </p>
            <div className="animate-rise mt-8 flex flex-wrap gap-3 [animation-delay:0.18s]">
              <Button asChild size="lg">
                <Link to="/kiosk">{t("home.cta_primary")}</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/admin">{t("home.cta_secondary")}</Link>
              </Button>
            </div>
          </div>

          <div className="animate-soft-in animate-float-soft rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur">
            <div className="aspect-4/3 rounded-xl border border-dashed border-white/30 p-6">
              <div className="grid h-full place-items-center text-center">
                <div>
                  <ScanFace className="mx-auto size-16 text-slate-200 drop-shadow-lg" />
                  <p className="mt-4 text-sm text-slate-300">{t("kiosk.subtitle")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-semibold">{t("home.features_title")}</h2>
        <div className="stagger-children mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="panel-card hover-lift p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground transition-transform duration-300 group-hover:scale-110">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground">
          <span>
            {t("brand.name")} · {t("brand.school_name")}
          </span>
          <span>{t("home.footer")}</span>
        </div>
      </footer>
    </main>
  );
}
