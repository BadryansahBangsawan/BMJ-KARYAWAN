import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@BMJ-KARYAWAN/ui/components/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@BMJ-KARYAWAN/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { formatRp, monthBounds, previousMonthBounds } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import { FilterBar, FilterChips } from "@/components/filter-bar";
import Loader from "@/components/loader";
import { MetricCard } from "@/components/metric-card";
import { MobileList, MobileListRow } from "@/components/mobile-list";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DateRangeFields } from "@/components/period-fields";
import { ResponsiveRecords } from "@/components/responsive-records";
import { SectionHeader } from "@/components/section-header";
import { PageError, StatePanel } from "@/components/state-panel";

type PeriodPreset = "this" | "last" | "custom";

type LaporanRow = {
  name?: string;
  employeeName?: string;
  totalAmount?: number;
  diterimaAmount?: number;
  mechanicShare?: number;
  bengkelShare?: number;
  kasbonSisa?: number;
};

function asRows(data: unknown): LaporanRow[] {
  if (Array.isArray(data)) return data as LaporanRow[];
  if (data && typeof data === "object") {
    const o = data as { rows?: LaporanRow[]; items?: LaporanRow[] };
    return o.rows ?? o.items ?? [];
  }
  return [];
}

function periodName(preset: PeriodPreset, from: string, to: string) {
  if (preset === "this") return "bulan ini";
  if (preset === "last") return "bulan lalu";
  return `${from}–${to}`;
}

export const Route = createFileRoute("/_auth/laporan")({
  beforeLoad: ({ context }) => {
    if (sessionRole(context.session?.user) !== "supervisor") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LaporanPage,
});

function LaporanTable({
  rows,
  isPending,
  isError,
  onRetry,
  periodName: selectedPeriod,
  onChangePeriod,
}: {
  rows: LaporanRow[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  periodName?: string;
  onChangePeriod?: () => void;
}) {
  if (isPending && rows.length === 0) {
    return <Loader />;
  }
  if (isError) {
    return <PageError onRetry={onRetry} />;
  }
  if (rows.length === 0) {
    return (
      <StatePanel
        title={
          selectedPeriod
            ? `Tidak ada laporan di ${selectedPeriod}`
            : "Tidak ada laporan kumulatif"
        }
        description={
          selectedPeriod
            ? "Ubah periode untuk melihat rentang lain."
            : "Data kumulatif muncul setelah ada pekerjaan."
        }
        action={
          onChangePeriod ? (
            <Button type="button" variant="outline" onClick={onChangePeriod}>
              Ubah periode
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <ResponsiveRecords
      cards={
        <MobileList>
          {rows.map((row, index) => (
            <MobileListRow
              key={`${row.name ?? row.employeeName ?? "row"}-${index}`}
              title={row.employeeName?.trim() || row.name?.trim() || "—"}
              subtitle={`Diterima ${formatRp(row.diterimaAmount ?? 0)} · Mekanik ${formatRp(row.mechanicShare ?? 0)} · Bengkel ${formatRp(row.bengkelShare ?? 0)}`}
              trailing={formatRp(row.totalAmount ?? 0)}
              meta={
                <span className="text-sm text-muted-foreground">
                  Sisa kasbon <span className="tabular-nums">{formatRp(row.kasbonSisa ?? 0)}</span>
                </span>
              }
            />
          ))}
        </MobileList>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="text-end">Total</TableHead>
              <TableHead className="text-end">Diterima</TableHead>
              <TableHead className="text-end">Bagian mekanik</TableHead>
              <TableHead className="text-end">Bagian bengkel</TableHead>
              <TableHead className="text-end">Sisa kasbon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.name ?? row.employeeName ?? "row"}-${index}`}>
                <TableCell>{row.employeeName?.trim() || row.name?.trim() || "—"}</TableCell>
                <TableCell className="text-end tabular-nums">{formatRp(row.totalAmount ?? 0)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatRp(row.diterimaAmount ?? 0)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatRp(row.mechanicShare ?? 0)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatRp(row.bengkelShare ?? 0)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatRp(row.kasbonSisa ?? 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}

function LaporanPage() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const thisMonth = monthBounds();
  const [preset, setPreset] = useState<PeriodPreset>("this");
  const [from, setFrom] = useState(thisMonth.from);
  const [to, setTo] = useState(thisMonth.to);
  const [focusFrom, setFocusFrom] = useState(false);

  const ongkosQuery = useQuery(trpc.laporan.ongkos.queryOptions({ from, to }));
  const kumulatifQuery = useQuery(trpc.laporan.kumulatif.queryOptions());
  const diagramQuery = useQuery(trpc.laporan.diagram.queryOptions({ from, to }));
  const diagram = diagramQuery.data as
    | { pendapatan?: number; pengeluaran?: number; bengkel?: number }
    | undefined;
  const selectedPeriod = periodName(preset, from, to);

  useEffect(() => {
    if (!focusFrom) return;
    const node = document.getElementById("from");
    if (node) {
      node.focus();
      setFocusFrom(false);
    }
  }, [focusFrom, preset]);

  function applyPreset(next: PeriodPreset) {
    setPreset(next);
    if (next === "this") {
      const bounds = monthBounds();
      setFrom(bounds.from);
      setTo(bounds.to);
      return;
    }
    if (next === "last") {
      const bounds = previousMonthBounds();
      setFrom(bounds.from);
      setTo(bounds.to);
    }
  }

  function changePeriod() {
    setPreset("custom");
    setFocusFrom(true);
  }

  if (role === "mekanik") return null;

  return (
    <PageShell>
      <PageHeader title="Laporan" description={PAGE_DESCRIPTION["/laporan"]} />

      <FilterBar>
        <FilterChips
          ariaLabel="Periode laporan"
          value={preset}
          onChange={applyPreset}
          options={[
            { value: "this", label: "Bulan ini" },
            { value: "last", label: "Bulan lalu" },
            { value: "custom", label: "Pilih tanggal" },
          ]}
        />
      </FilterBar>
      {preset === "custom" ? (
        <DateRangeFields
          from={from}
          to={to}
          onFromChange={(value) => {
            setPreset("custom");
            setFrom(value);
          }}
          onToChange={(value) => {
            setPreset("custom");
            setTo(value);
          }}
        />
      ) : null}

      {diagramQuery.isError ? (
        <PageError onRetry={() => void diagramQuery.refetch()} />
      ) : diagramQuery.isPending && !diagramQuery.data ? (
        <Loader />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard dominant label="Pendapatan" value={formatRp(diagram?.pendapatan ?? 0)} />
          <MetricCard label="Pengeluaran" value={formatRp(diagram?.pengeluaran ?? 0)} />
          <MetricCard label="Bagian bengkel" value={formatRp(diagram?.bengkel ?? 0)} />
        </div>
      )}

      <Tabs defaultValue="ongkos">
        <TabsList>
          <TabsTrigger value="ongkos">Ongkos periode</TabsTrigger>
          <TabsTrigger value="kumulatif">Kumulatif</TabsTrigger>
        </TabsList>
        <TabsContent value="ongkos" className="flex flex-col gap-3 text-sm">
          <SectionHeader title="Laporan ongkos" />
          <LaporanTable
            rows={asRows(ongkosQuery.data)}
            isPending={ongkosQuery.isPending}
            isError={ongkosQuery.isError}
            onRetry={() => void ongkosQuery.refetch()}
            periodName={selectedPeriod}
            onChangePeriod={changePeriod}
          />
        </TabsContent>
        <TabsContent value="kumulatif" className="flex flex-col gap-3 text-sm">
          <SectionHeader title="Laporan kumulatif" />
          <p className="text-pretty text-sm text-muted-foreground">
            Semua periode, tanpa filter tanggal.
          </p>
          <LaporanTable
            rows={asRows(kumulatifQuery.data)}
            isPending={kumulatifQuery.isPending}
            isError={kumulatifQuery.isError}
            onRetry={() => void kumulatifQuery.refetch()}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
