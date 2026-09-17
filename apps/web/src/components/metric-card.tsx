import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  hint,
  dominant = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  dominant?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card px-4 py-4 shadow-[var(--shadow-border)]",
        dominant && "sm:col-span-2",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tracking-tight tabular-nums leading-none",
          dominant ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-pretty text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
