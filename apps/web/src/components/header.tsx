import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

import UserMenu from "./user-menu";

type UserRole = "supervisor" | "kasir" | "mekanik";

type NavLink = {
  to: "/dashboard" | "/kasbon" | "/pekerjaan" | "/gaji" | "/toko" | "/absen" | "/laporan" | "/karyawan";
  label: string;
};

function sessionRole(user: { role?: string } | undefined): UserRole {
  if (user?.role === "supervisor" || user?.role === "kasir") {
    return user.role;
  }
  return "mekanik";
}

function linksForRole(role: UserRole): NavLink[] {
  const shared: NavLink[] = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/kasbon", label: "Kasbon" },
  ];
  if (role === "mekanik") {
    return [...shared, { to: "/pekerjaan", label: "Pekerjaan" }, { to: "/gaji", label: "Gaji" }];
  }
  if (role === "kasir") {
    return [
      ...shared,
      { to: "/pekerjaan", label: "Pekerjaan" },
      { to: "/toko", label: "Toko" },
      { to: "/gaji", label: "Gaji" },
    ];
  }
  return [
    ...shared,
    { to: "/pekerjaan", label: "Pekerjaan" },
    { to: "/absen", label: "Absen" },
    { to: "/gaji", label: "Gaji" },
    { to: "/laporan", label: "Laporan" },
    { to: "/toko", label: "Toko" },
    { to: "/karyawan", label: "Karyawan" },
  ];
}

export default function Header() {
  const { data: session } = authClient.useSession();
  const links = session?.user ? linksForRole(sessionRole(session.user)) : [];

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex flex-wrap gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
}
