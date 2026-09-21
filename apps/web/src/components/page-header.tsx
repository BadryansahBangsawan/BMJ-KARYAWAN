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
        <h1 className="max-lg:pe-14 text-xl font-semibold leading-[1.1] tracking-tight text-balance lg:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="hidden text-pretty text-muted-foreground lg:mt-1 lg:block">{description}</p>
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
