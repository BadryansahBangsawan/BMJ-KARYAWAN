import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import type { ChangeEvent, ComponentProps } from "react";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function formatIdrDigits(digits: string) {
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

export function MoneyField({
  className,
  value,
  defaultValue,
  onChange,
  ...props
}: ComponentProps<typeof Input>) {
  const digits = digitsOnly(String(value ?? defaultValue ?? ""));
  const display = formatIdrDigits(digits);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!onChange) return;
    const next = digitsOnly(event.target.value);
    onChange({
      ...event,
      target: { ...event.target, value: next },
      currentTarget: { ...event.currentTarget, value: next },
    } as ChangeEvent<HTMLInputElement>);
  }

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm font-medium text-muted-foreground"
        aria-hidden="true"
      >
        Rp
      </span>
      <Input
        {...props}
        className={cn("ps-10 tabular-nums", className)}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
      />
    </div>
  );
}
