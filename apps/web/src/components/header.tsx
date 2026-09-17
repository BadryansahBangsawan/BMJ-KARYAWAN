import { useRouterState } from "@tanstack/react-router";

import { PAGE_TITLE, type AppPath } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";

import UserMenu from "./user-menu";

export default function Header() {
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!session) {
    return null;
  }

  const title = PAGE_TITLE[pathname as AppPath] ?? "BMJ";

  return (
    <header className="app-chrome sticky top-0 z-40 flex min-h-12 items-center justify-between gap-3 border-b border-border bg-card ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] lg:hidden">
      <h1 className="min-w-0 flex-1 truncate text-start text-base font-semibold leading-[1.1] tracking-tight">
        {title}
      </h1>
      <UserMenu className="shrink-0" />
    </header>
  );
}
