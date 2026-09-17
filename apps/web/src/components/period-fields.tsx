import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";

import { jayapuraYearMonth, todayYmd } from "@/lib/format";

export function PeriodFields({
  year,
  month,
  onYearChange,
  onMonthChange,
  capToPresent = false,
}: {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  capToPresent?: boolean;
}) {
  const now = jayapuraYearMonth();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="period-year">Tahun</Label>
        <Input
          id="period-year"
          type="number"
          className="w-28 tabular-nums"
          max={capToPresent ? now.year : undefined}
          value={year}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (capToPresent && next > now.year) return;
            onYearChange(next);
            if (capToPresent && next === now.year && month > now.month) onMonthChange(now.month);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="period-month">Bulan</Label>
        <Input
          id="period-month"
          type="number"
          min={1}
          max={capToPresent && year >= now.year ? now.month : 12}
          className="w-24 tabular-nums"
          value={month}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (capToPresent && (year > now.year || (year === now.year && next > now.month))) return;
            onMonthChange(next);
          }}
        />
      </div>
    </div>
  );
}

export function DateRangeFields({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const today = todayYmd();
  return (
    <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor="from">Dari</Label>
        <Input
          id="from"
          type="date"
          max={today}
          className="w-full min-w-0"
          value={from}
          onChange={(event) => onFromChange(event.target.value > today ? today : event.target.value)}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor="to">Sampai</Label>
        <Input
          id="to"
          type="date"
          max={today}
          className="w-full min-w-0"
          value={to}
          onChange={(event) => onToChange(event.target.value > today ? today : event.target.value)}
        />
      </div>
    </div>
  );
}
