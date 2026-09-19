import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@BMJ-KARYAWAN/ui/components/table";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { formatDateTime, formatRp } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import { FieldError, fieldDescribedBy } from "@/components/field-error";
import { FilterChips } from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import Loader from "@/components/loader";
import { MetricCard } from "@/components/metric-card";
import { MobileList, MobileListRow } from "@/components/mobile-list";
import { MoneyField } from "@/components/money-field";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { ResponsiveRecords } from "@/components/responsive-records";
import { SectionHeader } from "@/components/section-header";
import { PageError, StatePanel } from "@/components/state-panel";

type StoreTxn = {
  id: string;
  seq: number;
  kind: string;
  amountIdr: number;
  note?: string | null;
  createdAt?: string | number | Date | null;
};

const KIND_LABEL: Record<string, string> = {
  kasir: "Tunai",
  non_tunai: "Non tunai",
  panjar: "Panjar",
};

type PaymentKind = "kasir" | "non_tunai" | "panjar";

export const Route = createFileRoute("/_auth/toko")({
  beforeLoad: ({ context }) => {
    if (sessionRole(context.session?.user) !== "kasir") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: TokoPage,
});

function TokoPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = useQuery(trpc.store.list.queryOptions());
  const summaryQuery = useQuery(trpc.store.summary.queryOptions());
  const rows = (listQuery.data ?? []) as StoreTxn[];
  const summary = summaryQuery.data as
    | {
        transaksiKali?: number;
        tunai?: number;
        nonTunai?: number;
        panjar?: number;
      }
    | undefined;

  const kali = summary?.transaksiKali ?? rows.length;
  const tunai = summary?.tunai ?? 0;
  const nonTunai = summary?.nonTunai ?? 0;
  const panjar = summary?.panjar ?? 0;
  const totalHariIni = tunai + nonTunai + panjar;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.store.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.store.summary.queryKey() });
  };

  const createMut = useMutation(
    trpc.store.create.mutationOptions({
      onSuccess: () => {
        toast.success("Transaksi tersimpan");
        setCreateOpen(false);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useForm({
    defaultValues: {
      kind: "kasir" as PaymentKind,
      amountIdr: "",
      note: "",
    },
    onSubmit: async ({ value }) => {
      await createMut.mutateAsync({
        kind: value.kind,
        amountIdr: Number(value.amountIdr),
        ...(value.note ? { note: value.note } : {}),
      });
      form.reset();
    },
    validators: {
      onSubmit: z.object({
        kind: z.enum(["kasir", "non_tunai", "panjar"]),
        amountIdr: z.string().refine((v) => Number(v) > 0, "Masukkan jumlah lebih dari 0."),
        note: z.string(),
      }),
    },
  });

  if (role !== "kasir") return null;

  return (
    <PageShell>
      <PageHeader
        title="Toko"
        description={PAGE_DESCRIPTION["/toko"]}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Catat transaksi
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          dominant
          className="sm:col-span-3"
          label="Total hari ini"
          value={formatRp(totalHariIni)}
          hint={kali === 1 ? "1 transaksi" : `${kali} transaksi`}
        />
        <MetricCard label="Tunai" value={formatRp(tunai)} />
        <MetricCard label="Non tunai" value={formatRp(nonTunai)} />
        <MetricCard label="Panjar" value={formatRp(panjar)} />
      </div>

      {listQuery.isError ? (
        <PageError onRetry={() => void listQuery.refetch()} />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Riwayat" count={rows.length} />
          {listQuery.isPending && !listQuery.data ? (
            <Loader />
          ) : rows.length === 0 ? (
            <StatePanel
              title="Belum ada transaksi"
              description="Catat transaksi tunai, non tunai, atau panjar."
              action={
                <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
                  Catat transaksi
                </Button>
              }
            />
          ) : (
            <ResponsiveRecords
              cards={
                <MobileList>
                  {rows.map((row) => (
                    <MobileListRow
                      key={row.id}
                      title={KIND_LABEL[row.kind] ?? row.kind}
                      trailing={formatRp(row.amountIdr)}
                      meta={
                        <span className="text-sm text-muted-foreground">
                          {row.note ? `${row.note} · ` : null}
                          {formatDateTime(row.createdAt) ?? "—"}
                          <span className="tabular-nums"> · {row.seq}</span>
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
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-end">Jumlah</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead className="text-end">Nomor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{KIND_LABEL[row.kind] ?? row.kind}</TableCell>
                        <TableCell className="text-end tabular-nums">{formatRp(row.amountIdr)}</TableCell>
                        <TableCell>{row.note ?? "—"}</TableCell>
                        <TableCell>{formatDateTime(row.createdAt) ?? "—"}</TableCell>
                        <TableCell className="text-end tabular-nums">{row.seq}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}
        </section>
      )}

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Catat transaksi"
        description="Pilih jenis pembayaran dan jumlah. Nominal dalam rupiah utuh."
        submitLabel="Catat transaksi"
        submitting={createMut.isPending}
        onSubmit={() => form.handleSubmit()}
      >
        <form.Field name="kind">
          {(field) => (
            <div className="space-y-2">
              <Label>Jenis pembayaran</Label>
              <FilterChips
                ariaLabel="Jenis pembayaran"
                value={field.state.value}
                onChange={field.handleChange}
                options={[
                  { value: "kasir", label: "Tunai" },
                  { value: "non_tunai", label: "Non tunai" },
                  { value: "panjar", label: "Panjar" },
                ]}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="amountIdr">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Jumlah</Label>
              <MoneyField
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="50000"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy("amount-error", field.state.meta.errors)}
              />
              <FieldError id="amount-error" errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="note">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Catatan</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </FormDialog>
    </PageShell>
  );
}
