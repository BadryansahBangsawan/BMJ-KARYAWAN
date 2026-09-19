import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@BMJ-KARYAWAN/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { formatRp, jayapuraYearMonth, monthLabel } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import { BusyLabel } from "@/components/busy-label";
import Loader from "@/components/loader";
import { MetricCard } from "@/components/metric-card";
import { PaySlip } from "@/components/pay-slip";
import { MoneyField } from "@/components/money-field";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PeriodFields } from "@/components/period-fields";
import { ResponsiveRecords } from "@/components/responsive-records";
import { SectionHeader } from "@/components/section-header";
import { PageError, StatePanel } from "@/components/state-panel";

function formatHari(tenths: number) {
  return (tenths / 100).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

type PayrollLine = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  name?: string | null;
  daysPresent: number;
  ongkosPercent: number;
  dailyPayIdr: number;
  kasbonBalanceIdr: number;
  kasbonDeductionIdr: number;
  konsumsiIdr: number;
  bonusIdr: number;
  jobShareIdr: number;
  takeHomeIdr: number;
  kasbonRemainingIdr: number;
};

type PayrollGet = {
  period?: { id: string; year: number; month: number; status: string; payDate?: string };
  lines?: PayrollLine[];
};

function lineName(line: PayrollLine) {
  return line.employeeName ?? line.name ?? line.employeeId;
}

export const Route = createFileRoute("/_auth/gaji")({
  component: GajiPage,
});

function PotonganEditor({
  id,
  line,
  value,
  onChange,
  onSave,
  saving,
}: {
  id: string;
  line: PayrollLine;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex min-w-40 items-center justify-end gap-1">
      <MoneyField
        id={id}
        aria-label={`Potongan kasbon ${lineName(line)}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-28"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving}
        aria-busy={saving}
        onClick={onSave}
      >
        <BusyLabel busy={saving}>Simpan</BusyLabel>
      </Button>
    </div>
  );
}

function GajiPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const now = useMemo(() => jayapuraYearMonth(), []);
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [draftPotongan, setDraftPotongan] = useState<Record<string, string>>({});
  const autoRecomputeKey = useRef<string | null>(null);

  const payrollQuery = useQuery(trpc.payroll.get.queryOptions({ year, month }));
  const meQuery = useQuery(trpc.employee.me.queryOptions());
  const data = payrollQuery.data as PayrollGet | undefined;
  const allLines = data?.lines ?? [];
  const meId = (meQuery.data as { id?: string } | null | undefined)?.id;
  const lines =
    role === "supervisor"
      ? allLines
      : meId
        ? allLines.filter((line) => line.employeeId === meId)
        : [];
  const canEditDraft = role === "supervisor";
  const totalTakeHome = lines.reduce((sum, line) => sum + line.takeHomeIdr, 0);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.payroll.get.queryKey({ year, month }) });
  };

  const recomputeMut = useMutation(
    trpc.payroll.recompute.mutationOptions({
      onSuccess: async () => {
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const deductionMut = useMutation(
    trpc.payroll.setDeduction.mutationOptions({
      onSuccess: async () => {
        toast.success("Potongan disimpan");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function savePotongan(line: PayrollLine) {
    deductionMut.mutate({
      lineId: line.id,
      kasbonDeductionIdr: Number(draftPotongan[line.id] ?? line.kasbonDeductionIdr),
    });
  }

  function recompute(keepDeductions: boolean, silent = false) {
    recomputeMut.mutate(
      { year, month, keepDeductions },
      silent ? undefined : { onSuccess: () => toast.success("Gaji dihitung ulang") },
    );
  }

  useEffect(() => {
    if (role !== "supervisor") return;
    if (payrollQuery.isPending || payrollQuery.isError) return;
    const key = `${year}-${month}`;
    if (autoRecomputeKey.current === key) return;
    autoRecomputeKey.current = key;
    recompute((data?.lines?.length ?? 0) > 0, true);
  }, [role, year, month, payrollQuery.isPending, payrollQuery.isError]);

  return (
    <PageShell>
      <PageHeader
        title="Gaji"
        description={PAGE_DESCRIPTION["/gaji"]}
        actions={
          canEditDraft ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={recomputeMut.isPending}
                aria-busy={recomputeMut.isPending}
                onClick={() => recompute(false)}
              >
                <BusyLabel busy={recomputeMut.isPending}>Hitung ulang</BusyLabel>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={recomputeMut.isPending}
                aria-busy={recomputeMut.isPending}
                onClick={() => recompute(true)}
              >
                <BusyLabel busy={recomputeMut.isPending}>Hitung ulang dan pertahankan potongan</BusyLabel>
              </Button>
            </>
          ) : null
        }
      >
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <PeriodFields
            year={year}
            month={month}
            capToPresent
            onYearChange={setYear}
            onMonthChange={setMonth}
          />
        </div>
      </PageHeader>

      {payrollQuery.isError ? (
        <PageError onRetry={() => void payrollQuery.refetch()} />
      ) : (
        <>
          {role === "supervisor" && !payrollQuery.isPending && lines.length > 0 ? (
            <MetricCard
              dominant
              label="Total diterima"
              value={formatRp(totalTakeHome)}
              hint={`${lines.length} karyawan`}
            />
          ) : null}

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Slip gaji"
              count={payrollQuery.isPending ? undefined : lines.length}
            />
            {payrollQuery.isPending && !payrollQuery.data ? (
              <Loader />
            ) : lines.length === 0 ? (
              <StatePanel
                title="Belum ada baris gaji"
                description={
                  canEditDraft
                    ? "Hitung ulang untuk membuat slip dari kehadiran dan kasbon bulan ini."
                    : "Pilih bulan lain, atau minta supervisor menghitung gaji."
                }
                action={
                  canEditDraft ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={recomputeMut.isPending}
                      aria-busy={recomputeMut.isPending}
                      onClick={() => recompute(false)}
                    >
                      <BusyLabel busy={recomputeMut.isPending}>Hitung ulang</BusyLabel>
                    </Button>
                  ) : undefined
                }
              />
            ) : role !== "supervisor" ? (
              <div className="flex flex-col gap-3">
                {lines.map((line) => (
                  <PaySlip
                    key={line.id}
                    line={line}
                    periodLabel={monthLabel(year, month)}
                    showName={false}
                  />
                ))}
              </div>
            ) : (
              <ResponsiveRecords
                cards={
                  <div className="flex flex-col gap-3">
                    {lines.map((line) => (
                      <PaySlip
                        key={line.id}
                        line={line}
                        periodLabel={monthLabel(year, month)}
                        potongan={
                          canEditDraft ? (
                            <PotonganEditor
                              id={`potongan-${line.id}`}
                              line={line}
                              value={draftPotongan[line.id] ?? String(line.kasbonDeductionIdr)}
                              onChange={(value) =>
                                setDraftPotongan((prev) => ({ ...prev, [line.id]: value }))
                              }
                              onSave={() => savePotongan(line)}
                              saving={deductionMut.isPending}
                            />
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                }
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead className="text-end">Hari</TableHead>
                        <TableHead className="text-end">Gaji</TableHead>
                        <TableHead className="text-end">Persenan</TableHead>
                        <TableHead className="text-end">Uang makan</TableHead>
                        <TableHead className="text-end">Potongan</TableHead>
                        <TableHead className="text-end">Diterima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>{lineName(line)}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatHari(line.daysPresent)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatRp(line.dailyPayIdr)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatRp(line.jobShareIdr)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatRp(line.konsumsiIdr)}
                          </TableCell>
                          <TableCell className="text-end">
                            {canEditDraft ? (
                              <PotonganEditor
                                id={`potongan-table-${line.id}`}
                                line={line}
                                value={draftPotongan[line.id] ?? String(line.kasbonDeductionIdr)}
                                onChange={(value) =>
                                  setDraftPotongan((prev) => ({ ...prev, [line.id]: value }))
                                }
                                onSave={() => savePotongan(line)}
                                saving={deductionMut.isPending}
                              />
                            ) : (
                              <span className="tabular-nums">{formatRp(line.kasbonDeductionIdr)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-end font-medium tabular-nums">
                            {formatRp(line.takeHomeIdr)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
              />
            )}
          </section>

          <div className="space-y-1">
            <p className="text-pretty text-muted-foreground">
              Gaji = gaji bulanan. Persenan = bagian ongkos. Uang makan hanya jika absen 06:00–08:59.
            </p>
          </div>
        </>
      )}

    </PageShell>
  );
}
