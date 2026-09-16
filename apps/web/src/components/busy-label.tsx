import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function BusyLabel({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <>
      {busy ? (
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </>
  );
}
