import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { StatePanel } from "@/components/state-panel";
import type { AppPath } from "@/lib/app-nav";

export function ActionQueue({
  title,
  items,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: ReactNode;
    to: AppPath;
    trailing?: ReactNode;
  }>;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {items.length === 0 ? (
        <StatePanel title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                className="flex min-h-16 items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-border)] transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-muted motion-safe:active:scale-[0.98]"
              >
                <span className="size-3 shrink-0 rounded-sm bg-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-word font-medium leading-[1.1]">{item.title}</p>
                  {item.subtitle ? (
                    <p className="mt-0.5 text-pretty text-sm text-muted-foreground">{item.subtitle}</p>
                  ) : null}
                </div>
                {item.trailing ? (
                  <div className="shrink-0 text-end font-display text-xl leading-none tabular-nums">
                    {item.trailing}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
