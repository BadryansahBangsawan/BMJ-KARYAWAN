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
    <header className="app-chrome sticky top-0 z-40 flex min-h-11 items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] bg-background/80 backdrop-blur-[20px] backdrop-saturate-150">
      <span className="w-11" />
      <h1 className="absolute inset-x-16 truncate text-center text-base font-semibold tracking-tight">
        {title}
      </h1>
      <UserMenu />
    </header>
  );
}
