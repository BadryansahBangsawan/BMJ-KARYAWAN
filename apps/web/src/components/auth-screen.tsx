import type { ReactNode } from "react";

import { todayParts } from "@/lib/format";

export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const today = todayParts();

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="hidden lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <p className="text-sm font-semibold tracking-tight">BMJ Karyawan</p>
        <div>
          <p className="today-settle font-display text-[6rem] leading-none">{String(today.day).padStart(2, "0")}</p>
          <p className="mt-4 text-3xl font-semibold capitalize leading-tight tracking-tight">{today.weekday}</p>
          <p className="mt-2 max-w-sm text-pretty text-lg text-muted-foreground">
            {today.monthYear}. Masuk, lalu centang kerja hari ini.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">Asia/Jayapura</p>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] lg:justify-center lg:bg-card lg:px-12">
        <p className="font-display text-5xl leading-none lg:hidden">{String(today.day).padStart(2, "0")}</p>
        <p className="mt-2 text-xl font-semibold capitalize lg:hidden">{today.weekday}</p>
        <h1 className="mt-4 text-2xl font-semibold leading-[1.1] tracking-tight text-balance lg:mt-0">{title}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">{description}</p>
        <div className="mt-6 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] lg:bg-muted lg:shadow-none">
          {children}
        </div>
      </div>
    </div>
  );
}
