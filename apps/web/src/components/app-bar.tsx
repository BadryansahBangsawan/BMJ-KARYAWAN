import { Link } from "@tanstack/react-router";

import { AvatarBubble } from "@/components/avatar-bubble";
import { authClient } from "@/lib/auth-client";

export function AppBar() {
  const { data: session } = authClient.useSession();

  if (!session) return null;

  const name = session.user.name?.trim() || "Karyawan";

  return (
    <header className="app-chrome sticky top-0 z-40 flex h-14 items-center border-b border-border/70 bg-background/90 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
      <Link
        to="/profil"
        aria-label={`Profil ${name}`}
        className="flex min-w-0 items-center gap-2.5 rounded-full pe-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AvatarBubble name={name} image={session.user.image} className="size-9" />
        <span className="min-w-0 truncate text-base font-semibold tracking-tight">{name}</span>
      </Link>
    </header>
  );
}
