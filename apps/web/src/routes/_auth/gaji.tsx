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
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { formatHariHadir, formatRp, jayapuraYearMonth, monthLabel } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import type { RouterOutputs } from "@/utils/trpc";
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

type PayrollLine = RouterOutputs["payroll"]["get"]["lines"][number];

function lineName(line: PayrollLine) {
  return line.employeeName?.trim() || line.name?.trim() || "—";
}

export const Route = createFileRoute("/_auth/gaji")({
  beforeLoad: ({ context }) => {
    if (sessionRole(context.session?.user) !== "supervisor") {
      throw redirect({ to: "/dashboard" });
    }
  },
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

  const payrollQuery = useQuery(trpc.payroll.get.queryOptions({ year, month }));
  const meQuery = useQuery(trpc.employee.me.queryOptions());
  const allLines = payrollQuery.data?.lines ?? [];
  const meId = meQuery.data?.id;
  const lines =
    role === "supervisor"
      ? allLines
      : meId
        ? allLines.filter((line) => line.employeeId === meId)
        : [];
  const locked = payrollQuery.data?.locked === true;
  const isCurrentMonth = year === now.year && month === now.month;
  const canEdit = role === "supervisor" && !locked;
  const totalTakeHome = lines.reduce((sum, line) => sum + line.takeHomeIdr, 0);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.payroll.get.queryKey({ year, month }) });
  };

  const recomputeMut = useMutation(
    trpc.payroll.recompute.mutationOptions({
      onSuccess: () => {
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const deductionMut = useMutation(
    trpc.payroll.setDeduction.mutationOptions({
      onSuccess: () => {
        toast.success("Potongan disimpan");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const lockMut = useMutation(
    trpc.payroll.lock.mutationOptions({
      onSuccess: () => {
        toast.success("Gaji dikunci");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const unlockMut = useMutation(
    trpc.payroll.unlock.mutationOptions({
      onSuccess: () => {
        toast.success("Gaji dibuka");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function savePotongan(line: PayrollLine) {
    if (line.id == null) return;
    deductionMut.mutate({
      lineId: line.id,
      kasbonDeductionIdr: Number(draftPotongan[line.id] ?? line.kasbonDeductionIdr),
    });
  }

  function recompute(keepDeductions: boolean) {
    recomputeMut.mutate(
      { year, month, keepDeductions },
      { onSuccess: () => toast.success("Gaji dihitung ulang") },
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Gaji"
        description={PAGE_DESCRIPTION["/gaji"]}
        actions={
          role === "supervisor" ? (
            <>
              {canEdit ? (
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
              ) : (
                <p className="text-sm text-muted-foreground">Terkunci</p>
              )}
              {isCurrentMonth ? (
                locked ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={unlockMut.isPending}
                    aria-busy={unlockMut.isPending}
                    onClick={() => unlockMut.mutate({ year, month })}
                  >
                    <BusyLabel busy={unlockMut.isPending}>Buka kunci</BusyLabel>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lockMut.isPending}
                    aria-busy={lockMut.isPending}
                    onClick={() => lockMut.mutate({ year, month })}
                  >
                    <BusyLabel busy={lockMut.isPending}>Kunci bulan ini</BusyLabel>
                  </Button>
                )
              ) : null}
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
                  canEdit
                    ? "Hitung ulang untuk membuat slip dari kehadiran dan kasbon bulan ini."
                    : "Pilih bulan lain, atau minta supervisor menghitung gaji."
                }
                action={
                  canEdit ? (
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
                    key={line.id ?? line.employeeId}
                    line={line}
                    periodLabel={monthLabel(year, month)}
                    alpaDays={line.alpaDays}
                    showName={false}
                  />
                ))}
              </div>
            ) : (
              <ResponsiveRecords
                cards={
                  <div className="flex flex-col gap-3">
                    {lines.map((line) => {
                      const lineId = line.id;
                      return (
                        <PaySlip
                          key={lineId ?? line.employeeId}
                          line={line}
                          periodLabel={monthLabel(year, month)}
                          alpaDays={line.alpaDays}
                          potongan={
                            canEdit && lineId != null ? (
                              <PotonganEditor
                                id={`potongan-${lineId}`}
                                line={line}
                                value={draftPotongan[lineId] ?? String(line.kasbonDeductionIdr)}
                                onChange={(value) =>
                                  setDraftPotongan((prev) => ({ ...prev, [lineId]: value }))
                                }
                                onSave={() => savePotongan(line)}
                                saving={deductionMut.isPending}
                              />
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                }
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead className="text-end">Hari</TableHead>
                        <TableHead className="text-end">Alpa</TableHead>
                        <TableHead className="text-end">Gaji</TableHead>
                        <TableHead className="text-end">Persenan</TableHead>
                        <TableHead className="text-end">Uang makan</TableHead>
                        <TableHead className="text-end">Potongan</TableHead>
                        <TableHead className="text-end">Diterima</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => {
                        const lineId = line.id;
                        return (
                        <TableRow key={lineId ?? line.employeeId}>
                          <TableCell>{lineName(line)}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatHariHadir(line.daysPresent)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {line.alpaDays}
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
                            {canEdit && lineId != null ? (
                              <PotonganEditor
                                id={`potongan-table-${lineId}`}
                                line={line}
                                value={draftPotongan[lineId] ?? String(line.kasbonDeductionIdr)}
                                onChange={(value) =>
                                  setDraftPotongan((prev) => ({ ...prev, [lineId]: value }))
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
                        );
                      })}
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
