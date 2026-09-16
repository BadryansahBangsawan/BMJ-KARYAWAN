import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import * as React from "react";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("motion-safe:animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
