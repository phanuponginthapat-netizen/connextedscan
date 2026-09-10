import { useEffect } from "react";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Briefcase, CalendarClock, ChevronLeft, ChevronRight, Download, LayoutDashboard, LogOut, ScanFace, Settings, Users } from "lucide-react";
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
  { to: "/admin/install", key: "nav.install", icon: Download },
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
      <div className="flex min-h-screen animate-pulse items-center justify-center text-muted-foreground">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground md:flex">
        <Link to="/" className="flex items-center gap-3">
          {t("brand.logo_url") ? (
            <img
              src={t("brand.logo_url")}
              alt={t("brand.name")}
              className="size-9 rounded-md object-contain"
            />
          ) : (
            <span className="grid size-9 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <ScanFace className="size-5" />
            </span>
          )}
          <span className="leading-tight">
            <span className="block font-display text-base font-semibold">{t("brand.name")}</span>
            <span className="block text-xs text-sidebar-foreground/70">
              {t("brand.school_name")}
            </span>
          </span>
        </Link>
        <nav className="mt-8 flex-1 space-y-1">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:translate-x-1 hover:bg-sidebar-accent/60",
                )}
              >
                <item.icon className="size-4 transition-transform duration-200 group-hover:scale-110" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border pt-4">
          <p className="truncate text-xs text-sidebar-foreground/70">{session.user.email}</p>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" /> {t("action.logout")}
          </Button>
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
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-card/95 px-4 py-2 backdrop-blur">
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
        <main key={pathname} className="animate-rise mx-auto max-w-6xl p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
