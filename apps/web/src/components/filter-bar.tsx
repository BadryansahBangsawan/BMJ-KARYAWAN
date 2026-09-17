import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import type { ReactNode } from "react";

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex max-w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end", className)}>
      {children}
    </div>
  );
}

export function FilterSearch({
  id,
  value,
  onChange,
  placeholder,
  label = "Cari",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-2 sm:max-w-xs">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
      />
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex max-w-full min-w-0 flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={active ? "secondary" : "outline"}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span className="tabular-nums text-muted-foreground">{option.count}</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export function ClearFiltersButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick}>
      Hapus filter
    </Button>
  );
}
