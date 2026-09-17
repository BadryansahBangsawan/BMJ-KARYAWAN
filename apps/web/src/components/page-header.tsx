import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="hidden text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-balance lg:block">
          {title}
        </h1>
        {description ? (
          <p className="text-pretty text-muted-foreground lg:mt-1">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
