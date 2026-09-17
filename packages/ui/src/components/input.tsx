import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-card px-3 py-2 text-base transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:h-10 md:min-h-10 md:text-sm dark:bg-input/50 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        (type === "date" || type === "datetime-local" || type === "month" || type === "time") &&
          "block appearance-none [-webkit-appearance:none] md:text-base [field-sizing:fixed] [&::-webkit-calendar-picker-indicator]:shrink-0 [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-datetime-edit]:max-w-full [&::-webkit-datetime-edit-fields-wrapper]:min-w-0",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
