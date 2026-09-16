import type { UserRole } from "./session-role";

export type AppPath =
  | "/dashboard" | "/kasbon" | "/pekerjaan" | "/gaji"
  | "/toko" | "/absen" | "/laporan" | "/karyawan";

export const PAGE_TITLE: Record<AppPath, string> = {
  "/dashboard": "Dasbor",
  "/kasbon": "Kasbon",
  "/pekerjaan": "Pekerjaan",
  "/gaji": "Gaji",
  "/toko": "Toko",
  "/absen": "Absen",
  "/laporan": "Laporan",
  "/karyawan": "Karyawan",
};

export type TabItem = { to: AppPath; label: string; icon: "dasbor" | "kasbon" | "pekerjaan" | "gaji" | "toko" | "more" };

export function tabsForRole(role: UserRole): TabItem[] {
  if (role === "mekanik") {
    return [
      { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
      { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
      { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
      { to: "/gaji", label: "Gaji", icon: "gaji" },
    ];
  }
  if (role === "kasir") {
    return [
      { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
      { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
      { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
      { to: "/toko", label: "Toko", icon: "toko" },
      { to: "/gaji", label: "Gaji", icon: "gaji" },
    ];
  }
  return [
    { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
    { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
    { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
    { to: "/gaji", label: "Gaji", icon: "gaji" },
    { to: "/absen", label: "Lainnya", icon: "more" },
  ];
}

export const MORE_LINKS: { to: AppPath; label: string }[] = [
  { to: "/absen", label: "Absen" },
  { to: "/laporan", label: "Laporan" },
  { to: "/toko", label: "Toko" },
  { to: "/karyawan", label: "Karyawan" },
];
