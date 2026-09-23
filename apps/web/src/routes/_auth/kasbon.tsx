import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@BMJ-KARYAWAN/ui/components/select";
import { Textarea } from "@BMJ-KARYAWAN/ui/components/textarea";
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
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Clock, HandCoins, X } from "lucide-react";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { formatDateTime, formatRp } from "@/lib/format";
import { sessionRole, roleLabel } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import type { RouterOutputs } from "@/utils/trpc";
import { FieldError, fieldDescribedBy, focusFirstInvalid } from "@/components/field-error";
import { ClearFiltersButton, FilterBar, FilterChips } from "@/components/filter-bar";
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
import { StatusBadge } from "@/components/status-badge";

type KasbonRow = RouterOutputs["kasbon"]["list"][number];
type StatusFilter = "" | "pending" | "approved" | "rejected" | "disbursed" | "lunas";

export const KASBON_STATUS = {
  pending: { label: "Menunggu", icon: Clock, tone: "warning" },
  approved: { label: "Disetujui", icon: Check, tone: "neutral" },
  rejected: { label: "Ditolak", icon: X, tone: "danger" },
  disbursed: { label: "Dicairkan", icon: HandCoins, tone: "neutral" },
  lunas: { label: "Lunas", icon: Check, tone: "success" },
} as const;

export const Route = createFileRoute("/_auth/kasbon")({
  component: KasbonPage,
});

function KasbonPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const isKasirish = role === "kasir" || role === "supervisor";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const listQuery = useQuery({
    ...trpc.kasbon.list.queryOptions({}),
    refetchInterval: 8_000,
  });
  const summaryQuery = useQuery({
    ...trpc.kasbon.summary.queryOptions(),
    enabled: isKasirish,
    refetchInterval: 8_000,
  });
  const employeesQuery = useQuery({
    ...trpc.employee.list.queryOptions(),
    enabled: role === "supervisor",
  });

  const rows = listQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const summary = summaryQuery.data as
    | {
        ttlAmount?: number;
        ttlPaid?: number;
        ttlSisa?: number;
      }
    | undefined;

  const isKasbonListQuery = (query: { queryKey: readonly unknown[] }) => {
    const path = query.queryKey[0];
    return Array.isArray(path) && path[0] === "kasbon";
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ predicate: isKasbonListQuery });
  };

  const createMut = useMutation(
    trpc.kasbon.create.mutationOptions({
      onSuccess: () => {
        toast.success("Kasbon diajukan");
        setCreateOpen(false);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const approveMut = useMutation(
    trpc.kasbon.approve.mutationOptions({
      onMutate: async ({ kasbonId }) => {
        await queryClient.cancelQueries({ predicate: isKasbonListQuery });
        const snapshots = queryClient.getQueriesData({ predicate: isKasbonListQuery });
        queryClient.setQueriesData({ predicate: isKasbonListQuery }, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: KasbonRow) =>
            row.id === kasbonId ? { ...row, status: "approved" } : row,
          );
        });
        return { snapshots };
      },
      onSuccess: () => {
        toast.success("Kasbon disetujui");
      },
      onError: (error, _vars, context) => {
        for (const [key, data] of context?.snapshots ?? []) {
          queryClient.setQueryData(key, data);
        }
        toast.error(error.message);
      },
      onSettled: () => {
        invalidate();
      },
    }),
  );
  const rejectMut = useMutation(
    trpc.kasbon.reject.mutationOptions({
      onMutate: async ({ kasbonId }) => {
        await queryClient.cancelQueries({ predicate: isKasbonListQuery });
        const snapshots = queryClient.getQueriesData({ predicate: isKasbonListQuery });
        queryClient.setQueriesData({ predicate: isKasbonListQuery }, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: KasbonRow) =>
            row.id === kasbonId ? { ...row, status: "rejected" } : row,
          );
        });
        return { snapshots };
      },
      onSuccess: () => {
        toast.success("Kasbon ditolak");
        setRejectId(null);
        setRejectReason("");
      },
      onError: (error, _vars, context) => {
        for (const [key, data] of context?.snapshots ?? []) {
          queryClient.setQueryData(key, data);
        }
        toast.error(error.message);
      },
      onSettled: () => {
        invalidate();
      },
    }),
  );
  const disburseMut = useMutation(
    trpc.kasbon.disburse.mutationOptions({
      onMutate: async ({ kasbonId }) => {
        await queryClient.cancelQueries({ predicate: isKasbonListQuery });
        const snapshots = queryClient.getQueriesData({ predicate: isKasbonListQuery });
        queryClient.setQueriesData({ predicate: isKasbonListQuery }, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: KasbonRow) =>
            row.id === kasbonId ? { ...row, status: "disbursed" } : row,
          );
        });
        return { snapshots };
      },
      onSuccess: () => {
        toast.success("Kasbon dicairkan");
      },
      onError: (error, _vars, context) => {
        for (const [key, data] of context?.snapshots ?? []) {
          queryClient.setQueryData(key, data);
        }
        toast.error(error.message);
      },
      onSettled: () => {
        invalidate();
      },
    }),
  );
  const payMut = useMutation(
    trpc.kasbon.addPayment.mutationOptions({
      onSuccess: () => {
        toast.success("Pembayaran tercatat");
        setPayId(null);
        setPayAmount("");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useForm({
    defaultValues: {
      employeeId: "",
      keperluan: "",
      amountIdr: "",
    },
    onSubmit: async ({ value }) => {
      const payload: { keperluan: string; amountIdr: number; employeeId?: string } = {
        keperluan: value.keperluan,
        amountIdr: Number(value.amountIdr),
      };
      if (role === "supervisor") {
        payload.employeeId = value.employeeId;
      }
      await createMut.mutateAsync(payload);
      form.reset();
    },
    validators: {
      onSubmit: z
        .object({
          employeeId: z.string(),
          keperluan: z.string().min(1, "Masukkan keperluan kasbon."),
          amountIdr: z.string().refine((v) => Number(v) > 0, "Masukkan jumlah lebih dari 0."),
        })
        .superRefine((value, ctx) => {
          if (role === "supervisor" && !value.employeeId) {
            ctx.addIssue({
              code: "custom",
              path: ["employeeId"],
              message: "Pilih karyawan.",
            });
          }
        }),
    },
  });

  const pending = rows.filter((row) => row.status === "pending");
  const approved = rows.filter((row) => row.status === "approved");
  const visible = statusFilter ? rows.filter((row) => row.status === statusFilter) : rows;
  const rejectRow = rows.find((row) => row.id === rejectId);
  const payRow = rows.find((row) => row.id === payId);
  const paySisa = payRow
    ? (payRow.sisaIdr ?? Math.max(0, payRow.amountIdr - (payRow.paidIdr ?? 0)))
    : 0;

  return (
    <PageShell>
      <PageHeader
        title="Kasbon"
        description={PAGE_DESCRIPTION["/kasbon"]}
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Ajukan kasbon
          </Button>
        }
      />

      {isKasirish && summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Total kasbon" value={formatRp(summary.ttlAmount ?? 0)} />
          <MetricCard label="Telah dibayar" value={formatRp(summary.ttlPaid ?? 0)} />
          <MetricCard label="Sisa" value={formatRp(summary.ttlSisa ?? 0)} />
        </div>
      ) : null}

      {listQuery.isError ? (
        <PageError onRetry={() => void listQuery.refetch()} />
      ) : (
        <>
          {role === "supervisor" ? (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Antrian persetujuan" count={pending.length} />
              {listQuery.isPending && !listQuery.data ? (
                <Loader />
              ) : pending.length === 0 ? (
                <StatePanel
                  title="Tidak ada kasbon menunggu"
                  description="Pengajuan baru muncul di antrian ini."
                  action={
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
                      Ajukan kasbon
                    </Button>
                  }
                />
              ) : (
                <MobileList>
                  {pending.map((row) => (
                    <MobileListRow
                      key={row.id}
                      title={row.employeeName?.trim() || "—"}
                      subtitle={row.keperluan}
                      trailing={formatRp(row.amountIdr)}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveMut.mutate({ kasbonId: row.id })}
                      >
                        Setujui
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setRejectId(row.id);
                          setRejectReason("");
                        }}
                      >
                        Tolak kasbon
                      </Button>
                    </MobileListRow>
                  ))}
                </MobileList>
              )}
            </section>
          ) : null}

          {isKasirish ? (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Antrian pencairan" count={approved.length} />
              {listQuery.isPending && !listQuery.data ? (
                <Loader />
              ) : approved.length === 0 ? (
                <StatePanel
                  title="Tidak ada kasbon siap dicairkan"
                  description="Setelah disetujui supervisor, kasbon muncul di sini."
                />
              ) : (
                <MobileList>
                  {approved.map((row) => (
                    <MobileListRow
                      key={row.id}
                      title={row.employeeName?.trim() || "—"}
                      subtitle={row.keperluan}
                      trailing={formatRp(row.amountIdr)}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => disburseMut.mutate({ kasbonId: row.id })}
                      >
                        Cairkan
                      </Button>
                    </MobileListRow>
                  ))}
                </MobileList>
              )}
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <SectionHeader title="Riwayat kasbon" count={visible.length} />
            <FilterBar>
              <FilterChips
                ariaLabel="Filter status kasbon"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "", label: "Semua" },
                  { value: "pending", label: "Menunggu" },
                  { value: "approved", label: "Disetujui" },
                  { value: "rejected", label: "Ditolak" },
                  { value: "disbursed", label: "Dicairkan" },
                  { value: "lunas", label: "Lunas" },
                ]}
              />
              <ClearFiltersButton visible={statusFilter !== ""} onClick={() => setStatusFilter("")} />
            </FilterBar>

            {listQuery.isPending && !listQuery.data ? (
              <Loader />
            ) : visible.length === 0 ? (
              <StatePanel
                title={statusFilter ? "Tidak ada kasbon untuk filter ini" : "Belum ada kasbon"}
                description={
                  statusFilter
                    ? "Hapus filter untuk melihat riwayat lain."
                    : "Ajukan kasbon baru dari tombol di atas."
                }
                action={
                  statusFilter ? (
                    <Button type="button" variant="outline" onClick={() => setStatusFilter("")}>
                      Hapus filter
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
                      Ajukan kasbon
                    </Button>
                  )
                }
              />
            ) : (
              <ResponsiveRecords
                cards={
                  <MobileList>
                    {visible.map((row) => {
                      const paid = row.paidIdr ?? 0;
                      const sisa = row.sisaIdr ?? Math.max(0, row.amountIdr - paid);
                      return (
                        <MobileListRow
                          key={row.id}
                          title={row.employeeName?.trim() || "—"}
                          subtitle={
                            <>
                              {row.keperluan}
                              {formatDateTime(row.createdAt) ? (
                                <span className="mt-0.5 block tabular-nums">
                                  {formatDateTime(row.createdAt)}
                                </span>
                              ) : null}
                              {row.rejectedReason ? (
                                <span className="block text-destructive">{row.rejectedReason}</span>
                              ) : null}
                            </>
                          }
                          trailing={formatRp(row.amountIdr)}
                          meta={
                            <>
                              <StatusBadge
                                {...(KASBON_STATUS[row.status as keyof typeof KASBON_STATUS] ?? {
                                  label: row.status,
                                  icon: Clock,
                                  tone: "neutral",
                                })}
                              />
                              <span className="text-sm text-muted-foreground">
                                Dibayar <span className="tabular-nums">{formatRp(paid)}</span>
                                {" · "}
                                Sisa <span className="tabular-nums">{formatRp(sisa)}</span>
                              </span>
                            </>
                          }
                        >
                          {isKasirish && row.status === "disbursed" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPayId(row.id);
                                setPayAmount("");
                              }}
                            >
                              Catat pembayaran
                            </Button>
                          ) : null}
                        </MobileListRow>
                      );
                    })}
                  </MobileList>
                }
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Keperluan</TableHead>
                        <TableHead className="text-end">Jumlah</TableHead>
                        <TableHead className="text-end">Telah dibayar</TableHead>
                        <TableHead className="text-end">Sisa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((row) => {
                        const paid = row.paidIdr ?? 0;
                        const sisa = row.sisaIdr ?? Math.max(0, row.amountIdr - paid);
                        return (
                          <TableRow key={row.id}>
                            <TableCell>{row.employeeName?.trim() || "—"}</TableCell>
                            <TableCell>
                              {row.keperluan}
                              {formatDateTime(row.createdAt) ? (
                                <div className="text-sm tabular-nums text-muted-foreground">
                                  {formatDateTime(row.createdAt)}
                                </div>
                              ) : null}
                              {row.rejectedReason ? (
                                <div className="text-sm text-destructive">{row.rejectedReason}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-end tabular-nums">{formatRp(row.amountIdr)}</TableCell>
                            <TableCell className="text-end tabular-nums">{formatRp(paid)}</TableCell>
                            <TableCell className="text-end tabular-nums">{formatRp(sisa)}</TableCell>
                            <TableCell>
                              <StatusBadge
                                {...(KASBON_STATUS[row.status as keyof typeof KASBON_STATUS] ?? {
                                  label: row.status,
                                  icon: Clock,
                                  tone: "neutral",
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              {isKasirish && row.status === "disbursed" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setPayId(row.id);
                                    setPayAmount("");
                                  }}
                                >
                                  Catat pembayaran
                                </Button>
                              ) : null}
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
        </>
      )}

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Ajukan kasbon"
        description="Masukkan keperluan dan jumlah. Nominal dalam rupiah utuh."
        submitLabel="Ajukan kasbon"
        submitting={createMut.isPending}
        onSubmit={() => form.handleSubmit()}
      >
        {role === "supervisor" ? (
          <form.Field name="employeeId">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Karyawan</Label>
                <Select
                  value={field.state.value || null}
                  onValueChange={(value) => field.handleChange(value ?? "")}
                >
                  <SelectTrigger
                    id={field.name}
                    className="w-full"
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={fieldDescribedBy("employee-error", field.state.meta.errors)}
                  >
                    <SelectValue placeholder="Pilih karyawan" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="employee-error" errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
        ) : null}
        {role !== "supervisor" ? (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Mengajukan atas nama </span>
            <span className="font-medium">{session?.user.name}</span>
            <span className="text-muted-foreground"> · {roleLabel(role)}</span>
          </div>
        ) : null}
        <form.Field name="keperluan">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Keperluan</Label>
              <Textarea
                id={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Mis. beli oli motor"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy("keperluan-error", field.state.meta.errors)}
              />
              <FieldError id="keperluan-error" errors={field.state.meta.errors} />
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
      </FormDialog>

      <FormDialog
        open={rejectId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectId(null);
            setRejectReason("");
          }
        }}
        title="Tolak kasbon"
        description={
          rejectRow
            ? `Kasbon ${rejectRow.employeeName?.trim() || "—"} sebesar ${formatRp(rejectRow.amountIdr)} akan ditolak.`
            : "Kasbon akan ditolak."
        }
        submitLabel="Tolak kasbon"
        submitVariant="destructive"
        submitting={rejectMut.isPending}
        onSubmit={() => {
          if (!rejectId || !rejectReason.trim()) {
            focusFirstInvalid();
            return;
          }
          rejectMut.mutate({ kasbonId: rejectId, reason: rejectReason.trim() });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="reject-reason">Alasan</Label>
          <Textarea
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Mis. stok belum lunas"
            aria-invalid={!rejectReason.trim()}
            aria-describedby={!rejectReason.trim() ? "reject-reason-error" : undefined}
          />
          {!rejectReason.trim() ? (
            <p id="reject-reason-error" className="text-sm text-destructive">
              Masukkan alasan penolakan.
            </p>
          ) : null}
        </div>
      </FormDialog>

      <FormDialog
        open={payId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPayId(null);
            setPayAmount("");
          }
        }}
        title="Catat pembayaran"
        description={`Sisa yang masih harus dibayar ${formatRp(paySisa)}.`}
        submitLabel="Catat pembayaran"
        submitting={payMut.isPending}
        onSubmit={() => {
          if (!payId || !(Number(payAmount) > 0)) {
            focusFirstInvalid();
            return;
          }
          payMut.mutate({ kasbonId: payId, amountIdr: Number(payAmount) });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="pay-amount">Jumlah</Label>
          <MoneyField
            id="pay-amount"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            placeholder="50000"
            aria-invalid={!(Number(payAmount) > 0)}
            aria-describedby={!(Number(payAmount) > 0) ? "pay-amount-error" : undefined}
          />
          {!(Number(payAmount) > 0) ? (
            <p id="pay-amount-error" className="text-sm text-destructive">
              Masukkan jumlah lebih dari 0.
            </p>
          ) : null}
        </div>
      </FormDialog>
    </PageShell>
  );
}
