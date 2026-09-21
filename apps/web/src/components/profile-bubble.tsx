import { Link } from "@tanstack/react-router";

import { AvatarBubble } from "@/components/avatar-bubble";
import { authClient } from "@/lib/auth-client";

export function ProfileBubble() {
  const { data: session } = authClient.useSession();
  if (!session) return null;
  const name = session.user.name?.trim() || "Karyawan";
  return (
    <Link
      to="/profil"
      aria-label={`Profil ${name}`}
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-50 inline-flex size-11 items-center justify-center rounded-full bg-card shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
    >
      <AvatarBubble name={name} image={session.user.image} className="size-10" />
    </Link>
  );
}
