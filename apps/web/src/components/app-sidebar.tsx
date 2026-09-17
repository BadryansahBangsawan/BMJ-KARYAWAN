import { Link, useRouterState } from "@tanstack/react-router";

import { NAV_ICONS } from "@/components/nav-icons";
import UserMenu from "@/components/user-menu";
import { navForRole, type AppPath } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";
import { sessionRole } from "@/lib/session-role";

export function AppSidebar() {
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!session) return null;

  const items = navForRole(sessionRole(session.user));

  return (
    <aside className="app-chrome sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-e border-border bg-sidebar pt-[env(safe-area-inset-top)] lg:flex">
      <div className="px-4 py-5">
        <p className="text-sm font-semibold tracking-tight">BMJ Karyawan</p>
        <p className="mt-1 text-pretty text-xs text-muted-foreground">Hari ini</p>
      </div>
      <nav aria-label="Menu utama" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
        {items.map((item) => {
          const active = pathname === item.to;
          const Icon = NAV_ICONS[item.icon === "more" ? "dasbor" : item.icon];
          return (
            <Link
              key={item.to}
              to={item.to as AppPath}
              activeOptions={{ exact: true }}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex min-h-11 items-center gap-3 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                  : "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
              }
            >
              <Icon
                className="size-5"
                strokeWidth={active ? 2 : 1.5}
                fill={active ? "currentColor" : "none"}
                aria-hidden="true"
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <UserMenu align="start" side="top" />
      </div>
    </aside>
  );
}
