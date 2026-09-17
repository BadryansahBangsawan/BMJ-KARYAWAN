import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@BMJ-KARYAWAN/ui/components/dropdown-menu";
import { Skeleton } from "@BMJ-KARYAWAN/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { sessionRole, roleLabel } from "@/lib/session-role";

export default function UserMenu({
  align = "end",
  side = "bottom",
  className,
}: {
  align?: "start" | "end" | "center";
  side?: "top" | "bottom";
  className?: string;
}) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const role = sessionRole(session?.user);

  if (isPending) {
    return <Skeleton className={`h-11 w-24 ${className ?? ""}`.trim()} />;
  }

  if (!session) {
    return (
      <Link to="/login" className={className}>
        <Button variant="outline">Masuk</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="max-w-[7.5rem] justify-start overflow-hidden" />}
        aria-label="Akun"
        title={session.user.name}
        className={className}
      >
        <span className="truncate">{session.user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card" align={align} side={side}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Akun</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="whitespace-normal">{session.user.name}</DropdownMenuItem>
          <DropdownMenuItem className="pointer-events-none select-none text-xs text-muted-foreground">
            {roleLabel(role)}
          </DropdownMenuItem>
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/profil" />}>Pengaturan profil</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/",
                    });
                  },
                },
              });
            }}
          >
            Keluar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
