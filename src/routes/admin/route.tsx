import { useEffect } from "react";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, BellRing, Briefcase, CalendarClock, ChevronLeft, ChevronRight, DoorOpen, Download, FileBarChart, MonitorPlay, LayoutDashboard, LogOut, ScanFace, Settings, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCms } from "@/lib/cms-client";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const nav = [
  { to: "/admin", key: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/students", key: "nav.students", icon: Users },
  { to: "/admin/staff", key: "nav.staff", icon: Briefcase },
  { to: "/admin/attendance", key: "nav.attendance", icon: CalendarClock },
  { to: "/admin/monthly", key: "nav.monthly", icon: FileBarChart },
  { to: "/admin/live", key: "nav.live", icon: MonitorPlay },
  { to: "/admin/install", key: "nav.install", icon: Download },
  { to: "/admin/door", key: "nav.door", icon: DoorOpen },
  { to: "/admin/health", key: "nav.health", icon: Activity },
  { to: "/admin/notifications", key: "nav.notifications", icon: BellRing },
  { to: "/admin/settings", key: "nav.settings", icon: Settings },
];

function AdminLayout() {
  const { t } = useCms();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="dark admin-theme flex min-h-screen animate-pulse items-center justify-center bg-background text-muted-foreground">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }

  return (
    <div className="dark admin-theme flex min-h-screen bg-background text-foreground">
      <aside className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="pointer-events-none absolute -top-24 -left-24 size-64 rounded-full bg-sidebar-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-24 size-48 rounded-full bg-sidebar-primary/5 blur-3xl" />

        <div className="relative flex h-full flex-col p-4">
          <Link
            to="/"
            className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent/50"
          >
            {t("brand.logo_url") ? (
              <img
                src={t("brand.logo_url")}
                alt={t("brand.name")}
                className="size-10 rounded-xl object-contain shadow-sm ring-1 ring-sidebar-border"
              />
            ) : (
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25 transition-transform duration-300 group-hover:scale-105">
                <ScanFace className="size-5" />
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-semibold tracking-tight">
                {t("brand.name")}
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/60">
                {t("brand.school_name")}
              </span>
            </span>
          </Link>

          <p className="mt-7 mb-2 px-3 text-[10px] font-semibold tracking-[0.18em] text-sidebar-foreground/45 uppercase">
            เมนูระบบ
          </p>

          <nav className="flex-1 space-y-1">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-sidebar-border"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full bg-sidebar-primary transition-all duration-200",
                      active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
                    )}
                  />
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-lg transition-all duration-200",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/25"
                        : "bg-sidebar-accent/60 text-sidebar-foreground/70 group-hover:scale-105 group-hover:text-sidebar-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                  </span>
                  <span className="flex-1 truncate">{t(item.key)}</span>
                  {active && <ChevronRight className="size-3.5 opacity-50" />}
                </Link>
              );
            })}
          </nav>

          <div className="relative mt-6 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-primary/60 text-xs font-bold text-sidebar-primary-foreground uppercase shadow-md shadow-sidebar-primary/20">
                {(session.user.email ?? "?").slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-medium">{session.user.email}</p>
                <p className="text-[10px] text-sidebar-foreground/55">ผู้ดูแลระบบ</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start gap-2 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" /> {t("action.logout")}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1">
        <div className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t(item.key)}
            </Link>
          ))}
        </div>
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border/70 bg-card/70 px-4 py-2.5 backdrop-blur-xl">
          <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
            <ChevronLeft className="size-4" /> {t("action.back")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.history.forward()}>
            {t("action.forward")} <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin" })}>
            <LayoutDashboard className="size-4" /> {t("action.dashboard")}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/kiosk" })}>
              <ScanFace className="size-4" /> {t("action.kiosk")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm("ต้องการออกจากระบบใช่หรือไม่")) return;
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" /> {t("action.logout")}
            </Button>
          </div>
        </div>
        <main key={pathname} className="animate-rise mx-auto max-w-7xl p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
