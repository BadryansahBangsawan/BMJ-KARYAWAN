import type { ReactNode } from "react";

import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";

export function PageShell({
  children,
  className,
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-6 overflow-x-clip py-4 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] sm:ps-6 sm:pe-6 lg:px-8 lg:py-8",
        narrow ? "max-w-3xl" : "max-w-[80rem]",
        className,
      )}
    >
      {children}
    </div>
  );
}
