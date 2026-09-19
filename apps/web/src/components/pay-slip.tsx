import type { ReactNode } from "react";

import { formatRp } from "@/lib/format";

function formatHari(tenths: number) {
  return (tenths / 100).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

export type PaySlipLine = {
  employeeName?: string | null;
  name?: string | null;
  employeeId: string;
  daysPresent: number;
  dailyPayIdr: number;
  jobShareIdr: number;
  ongkosPercent?: number;
  konsumsiIdr: number;
  bonusIdr: number;
  kasbonDeductionIdr: number;
  takeHomeIdr: number;
};

function slipName(line: PaySlipLine) {
  return line.employeeName ?? line.name ?? line.employeeId;
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-pretty text-muted-foreground">{label}</dt>
      <dd className={muted ? "tabular-nums text-muted-foreground" : "font-medium tabular-nums"}>{value}</dd>
    </div>
  );
}

export function PaySlip({
  line,
  periodLabel,
  payDate,
  potongan,
  showName = true,
}: {
  line: PaySlipLine;
  periodLabel: string;
  payDate?: string;
  potongan?: ReactNode;
  showName?: boolean;
}) {
  return (
    <article className="rounded-xl bg-card px-4 py-5 shadow-[var(--shadow-border)]">
      <p className="text-sm text-muted-foreground">{periodLabel}</p>
      {showName ? (
        <h3 className="mt-1 text-lg font-semibold leading-[1.1] tracking-tight text-balance">{slipName(line)}</h3>
      ) : null}
      {payDate ? <p className="mt-1 text-sm text-muted-foreground tabular-nums">Bayar {payDate}</p> : null}

      <p className="mt-5 text-sm text-muted-foreground">Diterima</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums leading-none">
        {formatRp(line.takeHomeIdr)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground tabular-nums">{formatHari(line.daysPresent)} hari hadir</p>

      <dl className="mt-5 divide-y divide-border border-t border-border text-sm">
        {line.dailyPayIdr > 0 ? (
          <Row
            label={`Potongan bengkel ${line.ongkosPercent ?? 0}%`}
            value={formatRp(line.dailyPayIdr)}
          />
        ) : null}
        <Row label="Bagian mekanik" value={formatRp(line.jobShareIdr)} />
        {line.konsumsiIdr > 0 ? <Row label="Uang makan" value={formatRp(line.konsumsiIdr)} /> : null}
        {line.bonusIdr > 0 ? <Row label="Bonus" value={formatRp(line.bonusIdr)} /> : null}
        <Row
          label="Potongan kasbon"
          value={potongan ?? formatRp(line.kasbonDeductionIdr)}
          muted={!potongan && line.kasbonDeductionIdr === 0}
        />
      </dl>
    </article>
  );
}
