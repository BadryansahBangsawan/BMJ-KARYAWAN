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
  "relative flex min-h-12 min-w-0 w-full flex-col items-center justify-center gap-0.5 px-1 pt-1 text-center text-xs font-medium leading-tight break-words text-muted-foreground";

const TAB_ACTIVE = "rounded-md bg-primary font-semibold text-primary-foreground";

const MORE_PATHS: Record<string, true> = {
  "/gaji": true,
  "/laporan": true,
  "/toko": true,
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
        <Ellipsis className="size-5" strokeWidth={active ? 2 : 1.5} fill={active ? "currentColor" : "none"} />
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
      className={`app-chrome fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-card ps-[max(0px,env(safe-area-inset-left))] pe-[max(0px,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] lg:hidden ${
        tabs.length === 5 ? "grid-cols-5" : "grid-cols-4"
      }`}
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
            activeOptions={{ exact: true }}
            aria-current={active ? "page" : undefined}
            className={active ? `${TAB_CONTROL} ${TAB_ACTIVE}` : TAB_CONTROL}
            activeProps={{ className: `${TAB_CONTROL} ${TAB_ACTIVE}` }}
          >
            <Icon className="size-5" strokeWidth={active ? 2 : 1.5} fill={active ? "currentColor" : "none"} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
