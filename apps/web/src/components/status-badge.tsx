import type { JSX } from "react";

import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import type { LucideIcon } from "lucide-react";

export function StatusBadge({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "neutral" | "success" | "danger" | "warning";
}): JSX.Element {
  return (
    <Badge
      variant={
        tone === "success"
          ? "success"
          : tone === "danger"
            ? "destructive"
            : tone === "warning"
              ? "secondary"
              : "outline"
      }
      className="gap-1"
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
