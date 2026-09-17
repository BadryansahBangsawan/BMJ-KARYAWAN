import type { ReactNode } from "react";

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight">
        {title}
        {typeof count === "number" ? (
          <span className="ms-2 text-sm font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}
