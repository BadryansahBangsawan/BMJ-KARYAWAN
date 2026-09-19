import type { UserRole } from "./session-role";

export type AppPath =
  | "/dashboard"
  | "/kasbon"
  | "/pekerjaan"
  | "/gaji"
  | "/toko"
  | "/absen"
  | "/laporan"
  | "/karyawan"
  | "/profil";

export const PAGE_TITLE: Record<AppPath, string> = {
  "/dashboard": "Dasbor",
  "/kasbon": "Kasbon",
  "/pekerjaan": "Pekerjaan",
  "/gaji": "Gaji",
  "/toko": "Toko",
  "/absen": "Absen",
  "/laporan": "Laporan",
  "/karyawan": "Karyawan",
  "/profil": "Profil",
};

export const PAGE_DESCRIPTION: Record<AppPath, string> = {
  "/dashboard": "Lihat yang perlu dikerjakan hari ini, lalu pilih aksi berikutnya.",
  "/kasbon": "Ajukan, setujui, cairkan, dan catat pembayaran kasbon.",
  "/pekerjaan": "Catat ongkos, ubah status, dan pantau pekerjaan bengkel.",
  "/gaji": "Hitung slip dan atur potongan kasbon.",
  "/toko": "Catat transaksi tunai, non tunai, dan panjar.",
  "/absen": "Absen mandiri berbasis GPS untuk karyawan; supervisor isi kehadiran manual.",
  "/laporan": "Ringkasan pendapatan, pengeluaran, dan bagian bengkel.",
  "/karyawan": "Tambah, ubah, dan impor data karyawan.",
  "/profil": "Ubah nama, foto, dan kata sandi akun.",
};

export type NavIcon =
  | "dasbor"
  | "kasbon"
  | "pekerjaan"
  | "gaji"
  | "toko"
  | "absen"
  | "laporan"
  | "karyawan"
  | "more";

export type NavItem = { to: AppPath; label: string; icon: NavIcon };
export type TabItem = NavItem;

export function tabsForRole(role: UserRole): TabItem[] {
  if (role === "mekanik") {
    return [
      { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
      { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
      { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
      { to: "/absen", label: "Absen", icon: "absen" },
      { to: "/gaji", label: "Gaji", icon: "gaji" },
    ];
  }
  if (role === "kasir") {
    return [
      { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
      { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
      { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
      { to: "/absen", label: "Absen", icon: "absen" },
      { to: "/toko", label: "Toko", icon: "toko" },
      { to: "/gaji", label: "Gaji", icon: "gaji" },
    ];
  }
  return [
    { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
    { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
    { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
    { to: "/absen", label: "Absen", icon: "absen" },
    { to: "/gaji", label: "Lainnya", icon: "more" },
  ];
}

export function navForRole(role: UserRole): NavItem[] {
  if (role === "mekanik") {
    return [
      { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
      { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
      { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
      { to: "/absen", label: "Absen", icon: "absen" },
      { to: "/gaji", label: "Gaji", icon: "gaji" },
    ];
  }
  if (role === "kasir") {
    return [
      { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
      { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
      { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
      { to: "/absen", label: "Absen", icon: "absen" },
      { to: "/toko", label: "Toko", icon: "toko" },
      { to: "/gaji", label: "Gaji", icon: "gaji" },
    ];
  }
  return [
    { to: "/dashboard", label: "Dasbor", icon: "dasbor" },
    { to: "/kasbon", label: "Kasbon", icon: "kasbon" },
    { to: "/pekerjaan", label: "Pekerjaan", icon: "pekerjaan" },
    { to: "/gaji", label: "Gaji", icon: "gaji" },
    { to: "/absen", label: "Absen", icon: "absen" },
    { to: "/laporan", label: "Laporan", icon: "laporan" },
    { to: "/karyawan", label: "Karyawan", icon: "karyawan" },
  ];
}

export const MORE_LINKS: { to: AppPath; label: string }[] = [
  { to: "/gaji", label: "Gaji" },
  { to: "/laporan", label: "Laporan" },
  { to: "/karyawan", label: "Karyawan" },
];
