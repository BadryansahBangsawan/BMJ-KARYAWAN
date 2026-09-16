import type { ReactNode } from "react";

export function MobileList({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-white/10 overflow-hidden rounded-[1.25rem] bg-card shadow-[var(--shadow-border)]">
      {children}
    </ul>
  );
}

export function MobileListRow({
  title,
  subtitle,
  trailing,
  meta,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-snug">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 text-pretty text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {trailing ? (
          <div className="shrink-0 text-end text-sm font-medium leading-snug tabular-nums">
            {trailing}
          </div>
        ) : null}
      </div>
      {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {children ? <div className="mt-3 flex flex-wrap gap-3">{children}</div> : null}
    </li>
  );
}

export function StatTile({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[1.25rem] bg-card px-3 py-3 shadow-[var(--shadow-border)] sm:px-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={
          compact
            ? "mt-1 text-base font-semibold tracking-tight tabular-nums leading-none"
            : "mt-1 text-2xl font-semibold tracking-tight tabular-nums leading-none"
        }
      >
        {value}
      </p>
    </div>
  );
}
