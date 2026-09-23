import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import { Button } from "@BMJ-KARYAWAN/ui/components/button";
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
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, CircleOff } from "lucide-react";
import { useState } from "react";
import z from "zod";

import { BusyLabel } from "@/components/busy-label";
import {
  ClearFiltersButton,
  FilterBar,
  FilterChips,
  FilterSearch,
} from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import Loader from "@/components/loader";
import { MobileList, MobileListRow } from "@/components/mobile-list";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { ResponsiveRecords } from "@/components/responsive-records";
import { SectionHeader } from "@/components/section-header";
import { PageError, StatePanel } from "@/components/state-panel";
import { StatusBadge } from "@/components/status-badge";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";
import { formatRp } from "@/lib/format";
import { roleLabel, sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import type { RouterOutputs } from "@/utils/trpc";
import {
  EmployeeFields,
  LoginReceiptCard,
  defaultEmployeeValues,
  employeeFormFields,
  refineLoginPair,
  type LoginReceipt,
} from "./-karyawan-form";

type Role = "supervisor" | "kasir" | "mekanik";
type RoleFilter = "" | Role;
type StatusFilter = "" | "aktif" | "nonaktif";

type EmployeeRow = RouterOutputs["employee"]["list"][number];

type ImportSheetResult = {
  employees: number;
  jobs: number;
  kasbon: number;
  kasbonPayments: number;
  attendance: number;
  storeTxns: number;
  ttlAmount: number;
  ttlPaid: number;
  ttlSisa: number;
};


const IMPORT_HUMAN_KEYS = [
  "employees",
  "jobs",
  "kasbon",
  "kasbonPayments",
  "attendance",
  "storeTxns",
  "ttlAmount",
  "ttlPaid",
  "ttlSisa",
] as const;


function isEmployeeActive(row: EmployeeRow) {
  return row.active !== false;
}

function asRole(role: string): Role {
  return role === "supervisor" || role === "kasir" ? role : "mekanik";
}

function asPayKind(value: string | null | undefined): "gaji" | "persenan" {
  return value === "gaji" ? "gaji" : "persenan";
}

function countOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function leftoverImport(result: Record<string, unknown>) {
  const leftover: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (!(IMPORT_HUMAN_KEYS as readonly string[]).includes(key)) {
      leftover[key] = value;
    }
  }
  return leftover;
}

function optionalLoginFields(email: string, password: string) {
  const trimmed = email.trim();
  return {
    ...(trimmed ? { email: trimmed } : {}),
    ...(password ? { password } : {}),
  };
}


export const Route = createFileRoute("/_auth/karyawan")({
  beforeLoad: ({ context }) => {
    if (sessionRole(context.session?.user) !== "supervisor") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: KaryawanPage,
});

function KaryawanPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createdLogin, setCreatedLogin] = useState<LoginReceipt | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [importResult, setImportResult] = useState<(ImportSheetResult & Record<string, unknown>) | null>(
    null,
  );

  const listQuery = useQuery(trpc.employee.list.queryOptions());
  const rows = listQuery.data ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries();
    void authClient.getSession({ query: { disableCookieCache: true } });
    void router.invalidate();
  };

  const createMut = useMutation(
    trpc.employee.create.mutationOptions({
      onSuccess: () => {
        toast.success("Karyawan ditambah");
        setCreateOpen(false);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const updateMut = useMutation(
    trpc.employee.update.mutationOptions({
      onSuccess: () => {
        toast.success("Karyawan diperbarui");
        setEditingId(null);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const importMut = useMutation(
    trpc.admin.importSheet.mutationOptions({
      onSuccess: (result) => {
        setImportResult((result ?? {}) as ImportSheetResult & Record<string, unknown>);
        toast.success("Impor selesai");
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const createForm = useForm({
    defaultValues: defaultEmployeeValues,
    onSubmit: async ({ value }) => {
      await createMut.mutateAsync({
        name: value.name,
        role: value.role,
        payKind: value.payKind,
        ongkosPercent: Number(value.ongkosPercent),
        uangMakanHarianIdr: Number(value.uangMakanHarianIdr || 0),
        bonusIdr: Number(value.bonusIdr || 0),
        active: value.active,
        ...optionalLoginFields(value.email, value.password),
      });
      if (value.email.trim() && value.password) {
        setCreatedLogin({
          name: value.name.trim(),
          email: value.email.trim(),
          password: value.password,
        });
      }
      createForm.reset();
    },
    validators: {
      onSubmit: employeeFormFields.superRefine((value, ctx) => refineLoginPair(value, ctx, "create")),
    },
  });

  const editForm = useForm({
    defaultValues: { id: "", ...defaultEmployeeValues },
    onSubmit: async ({ value }) => {
      await updateMut.mutateAsync({
        id: value.id,
        name: value.name,
        role: value.role,
        payKind: value.payKind,
        ongkosPercent: Number(value.ongkosPercent),
        uangMakanHarianIdr: Number(value.uangMakanHarianIdr || 0),
        bonusIdr: Number(value.bonusIdr || 0),
        active: value.active,
        ...optionalLoginFields(value.email, value.password),
      });
      if (value.email.trim() && value.password) {
        setCreatedLogin({
          name: value.name.trim(),
          email: value.email.trim(),
          password: value.password,
        });
      }
    },
    validators: {
      onSubmit: employeeFormFields.extend({ id: z.string() }).superRefine((value, ctx) =>
        refineLoginPair(value, ctx, "edit"),
      ),
    },
  });

  function startEdit(row: EmployeeRow) {
    setCreateOpen(false);
    setEditingId(row.id);
    editForm.setFieldValue("id", row.id);
    editForm.setFieldValue("name", row.name);
    editForm.setFieldValue("role", asRole(row.role));
    editForm.setFieldValue("email", row.email ?? "");
    editForm.setFieldValue("password", "");
    editForm.setFieldValue("payKind", asPayKind(row.payKind));
    editForm.setFieldValue("ongkosPercent", String(row.ongkosPercent ?? 0));
    editForm.setFieldValue("uangMakanHarianIdr", String(row.uangMakanHarianIdr ?? 0));
    editForm.setFieldValue("bonusIdr", String(row.bonusIdr ?? 0));
    editForm.setFieldValue("active", isEmployeeActive(row));
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
  }

  const query = search.trim().toLowerCase();
  const filtersActive = query !== "" || roleFilter !== "" || statusFilter !== "";
  const visible = rows.filter((row) => {
    if (query) {
      const haystack = `${row.name} ${row.email ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (roleFilter && row.role !== roleFilter) return false;
    if (statusFilter === "aktif" && !isEmployeeActive(row)) return false;
    if (statusFilter === "nonaktif" && isEmployeeActive(row)) return false;
    return true;
  });
  const leftover = importResult ? leftoverImport(importResult) : {};
  const leftoverEntries = Object.keys(leftover);

  if (role !== "supervisor") return null;

  return (
    <PageShell>
      <PageHeader
        title="Karyawan"
        description={PAGE_DESCRIPTION["/karyawan"]}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={importMut.isPending}
              aria-busy={importMut.isPending}
              onClick={() => importMut.mutate()}
            >
              <BusyLabel busy={importMut.isPending}>Impor spreadsheet</BusyLabel>
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditingId(null);
                setCreateOpen(true);
              }}
            >
              Tambah karyawan
            </Button>
          </>
        }
      />

      {createdLogin ? (
        <LoginReceiptCard login={createdLogin} onDismiss={() => setCreatedLogin(null)} />
      ) : null}
      {importResult ? (
        <section className="flex flex-col gap-3 rounded-xl bg-card px-4 py-4 shadow-[var(--shadow-border)]">
          <SectionHeader title="Hasil impor" />
          <p className="text-pretty">
            {countOf(importResult.employees)} karyawan, {countOf(importResult.jobs)} pekerjaan,{" "}
            {countOf(importResult.kasbon)} kasbon, {countOf(importResult.kasbonPayments)} pembayaran,{" "}
            {countOf(importResult.attendance)} absen, {countOf(importResult.storeTxns)} transaksi toko.
          </p>
          <p className="text-pretty">
            Total kasbon{" "}
            <span className="font-medium tabular-nums">{formatRp(countOf(importResult.ttlAmount))}</span>
            {" · "}
            Telah dibayar{" "}
            <span className="font-medium tabular-nums">{formatRp(countOf(importResult.ttlPaid))}</span>
            {" · "}
            Sisa kasbon{" "}
            <span className="font-medium tabular-nums">{formatRp(countOf(importResult.ttlSisa))}</span>.
          </p>
          {leftoverEntries.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Detail impor</summary>
              <pre className="mt-2 overflow-x-auto bg-muted p-3 text-xs">
                {JSON.stringify(leftover, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}

      {listQuery.isError ? (
        <PageError onRetry={() => void listQuery.refetch()} />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Daftar karyawan" count={listQuery.isPending ? undefined : visible.length} />
          <FilterBar>
            <FilterSearch
              id="karyawan-search"
              value={search}
              onChange={setSearch}
              placeholder="Nama atau email"
              label="Cari nama atau email"
            />
            <FilterChips
              ariaLabel="Filter peran"
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "", label: "Semua" },
                { value: "mekanik", label: "Mekanik" },
                { value: "kasir", label: "Kasir" },
                { value: "supervisor", label: "Supervisor" },
              ]}
            />
            <FilterChips
              ariaLabel="Filter status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "", label: "Semua" },
                { value: "aktif", label: "Aktif" },
                { value: "nonaktif", label: "Nonaktif" },
              ]}
            />
            <ClearFiltersButton visible={filtersActive} onClick={clearFilters} />
          </FilterBar>

          {listQuery.isPending && !listQuery.data ? (
            <Loader />
          ) : visible.length === 0 ? (
            <StatePanel
              title={filtersActive ? "Tidak ada karyawan untuk filter ini" : "Belum ada karyawan"}
              description={
                filtersActive
                  ? "Hapus filter untuk melihat daftar lengkap."
                  : "Tambah manual atau impor dari spreadsheet."
              }
              action={
                filtersActive ? (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Hapus filter
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
                    Tambah karyawan
                  </Button>
                )
              }
            />
          ) : (
            <ResponsiveRecords
              cards={
                <MobileList>
                  {visible.map((row) => {
                    const active = isEmployeeActive(row);
                    return (
                      <MobileListRow
                        key={row.id}
                        title={row.name}
                        trailing={asPayKind(row.payKind) === "gaji" ? "Gaji" : `${row.ongkosPercent}%`}
                        meta={
                          <>
                            <Badge variant="outline">{roleLabel(row.role)}</Badge>
                            <StatusBadge
                              icon={active ? Check : CircleOff}
                              label={active ? "Aktif" : "Nonaktif"}
                              tone={active ? "success" : "neutral"}
                            />
                            {row.email ? (
                              <span className="text-muted-foreground">{row.email}</span>
                            ) : null}
                          </>
                        }
                      >
                        <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                          Ubah karyawan
                        </Button>
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
                      <TableHead>Peran</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-end">Uang makan/hari</TableHead>
                      <TableHead className="text-end">Gaji</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => {
                      const active = isEmployeeActive(row);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{roleLabel(row.role)}</Badge>
                          </TableCell>
                          <TableCell>
                            {asPayKind(row.payKind) === "gaji"
                              ? "Gaji"
                              : `Persenan ${row.ongkosPercent}%`}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatRp(row.uangMakanHarianIdr ?? 0)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {asPayKind(row.payKind) === "gaji" ? formatRp(row.bonusIdr ?? 0) : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              icon={active ? Check : CircleOff}
                              label={active ? "Aktif" : "Nonaktif"}
                              tone={active ? "success" : "neutral"}
                            />
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                              Ubah karyawan
                            </Button>
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
      )}

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createForm.reset();
        }}
        title="Tambah karyawan"
        description="Isi data karyawan. Nominal dalam rupiah utuh."
        submitLabel="Tambah karyawan"
        submitting={createMut.isPending}
        onSubmit={() => createForm.handleSubmit()}
      >
        <EmployeeFields form={createForm as unknown as Parameters<typeof EmployeeFields>[0]["form"]} idPrefix="create" />
      </FormDialog>

      <FormDialog
        open={editingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingId(null);
            editForm.reset();
          }
        }}
        title="Ubah karyawan"
        description="Ubah data karyawan. Biarkan kata sandi kosong jika tidak diganti."
        submitLabel="Simpan perubahan"
        submitting={updateMut.isPending}
        onSubmit={() => editForm.handleSubmit()}
      >
        <EmployeeFields form={editForm as unknown as Parameters<typeof EmployeeFields>[0]["form"]} idPrefix="edit" />
      </FormDialog>
    </PageShell>
  );
}
