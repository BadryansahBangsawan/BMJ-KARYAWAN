import { Link, useRouterState } from "@tanstack/react-router";

import { AvatarBubble } from "@/components/avatar-bubble";
import { PAGE_TITLE, type AppPath } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";

export function AppBar() {
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!session) return null;

  const name = session.user.name?.trim() || "Karyawan";
  const title = PAGE_TITLE[pathname as AppPath] ?? "BMJ Karyawan";

  return (
    <header className="app-chrome sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-background/90 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
      <p className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</p>
      <Link
        to="/profil"
        aria-label={`Profil ${name}`}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AvatarBubble name={name} image={session.user.image} className="size-9" />
      </Link>
    </header>
  );
}
