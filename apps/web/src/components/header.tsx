import { Link } from "@tanstack/react-router";

import { AvatarBubble } from "@/components/avatar-bubble";
import { authClient } from "@/lib/auth-client";

export default function Header() {
  const { data: session } = authClient.useSession();

  if (!session) {
    return null;
  }

  const name = session.user.name?.trim() || "Karyawan";

  return (
    <header className="app-chrome sticky top-0 z-40 flex min-h-12 items-center gap-3 border-b border-border bg-card ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] lg:hidden">
      <Link
        to="/profil"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Profil ${name}`}
      >
        <AvatarBubble name={name} image={session.user.image} />
        <span className="min-w-0 truncate text-start text-base font-semibold leading-[1.1] tracking-tight">
          {name}
        </span>
      </Link>
    </header>
  );
}
