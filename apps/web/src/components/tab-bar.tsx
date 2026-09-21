import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@BMJ-KARYAWAN/ui/components/dropdown-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { Ellipsis } from "lucide-react";

import { NAV_ICONS } from "@/components/nav-icons";
import { MORE_LINKS, tabsForRole } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";
import { sessionRole } from "@/lib/session-role";

const TAB_CONTROL =
  "relative flex min-h-12 min-w-0 w-full flex-col items-center justify-center gap-0.5 px-1 pt-1 text-center text-[0.6875rem] font-medium leading-tight break-words text-muted-foreground motion-safe:transition-colors motion-safe:duration-150";

const TAB_ACTIVE = "font-semibold text-primary";

const MORE_PATHS: Record<string, true> = {
  "/gaji": true,
  "/laporan": true,
  "/karyawan": true,
};

function MoreTab({ active }: { active: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        className={active ? `${TAB_CONTROL} ${TAB_ACTIVE}` : TAB_CONTROL}
        aria-current={active ? "page" : undefined}
      >
        <Ellipsis className="size-5" strokeWidth={active ? 2 : 1.5} />
        Lainnya
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="origin-bottom-right">
        {MORE_LINKS.map((link) => (
          <DropdownMenuItem key={link.to} render={<Link to={link.to} />}>
            {link.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TabBar() {
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!session) {
    return null;
  }

  const tabs = tabsForRole(sessionRole(session.user));

  return (
    <nav
      aria-label="Menu utama"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      className="app-chrome fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid h-16 rounded-2xl border border-border bg-card px-1 shadow-[var(--shadow-floating)] lg:hidden"
    >
      {tabs.map((item) => {
        if (item.icon === "more") {
          return <MoreTab key="more" active={MORE_PATHS[pathname] === true} />;
        }

        const active = pathname === item.to;
        const Icon = NAV_ICONS[item.icon];
        return (
          <Link
            key={item.to}
            to={item.to}
            preload="intent"
            activeOptions={{ exact: true }}
            aria-current={active ? "page" : undefined}
            className={active ? `${TAB_CONTROL} ${TAB_ACTIVE}` : TAB_CONTROL}
            activeProps={{ className: `${TAB_CONTROL} ${TAB_ACTIVE}` }}
          >
            <Icon className="size-5" strokeWidth={active ? 2 : 1.5} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
