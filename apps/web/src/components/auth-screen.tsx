import type { ReactNode } from "react";

export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <p className="text-sm text-muted-foreground">BMJ Karyawan</p>
      <h1 className="mt-2 text-2xl font-semibold leading-[1.1] tracking-tight text-balance">
        {title}
      </h1>
      <p className="mt-2 text-pretty text-muted-foreground">{description}</p>
      <div className="mt-6 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-border)]">{children}</div>
    </div>
  );
}
