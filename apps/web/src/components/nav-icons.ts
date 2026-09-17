import {
  Banknote,
  CalendarCheck,
  LayoutDashboard,
  Store,
  Users,
  Wallet,
  Wrench,
  ChartColumn,
} from "lucide-react";

import type { NavIcon } from "@/lib/app-nav";

export const NAV_ICONS = {
  dasbor: LayoutDashboard,
  kasbon: Wallet,
  pekerjaan: Wrench,
  gaji: Banknote,
  toko: Store,
  absen: CalendarCheck,
  laporan: ChartColumn,
  karyawan: Users,
} as const satisfies Record<Exclude<NavIcon, "more">, typeof LayoutDashboard>;
