import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Checkbox } from "@BMJ-KARYAWAN/ui/components/checkbox";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@BMJ-KARYAWAN/ui/components/select";
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
import { useState, type ReactNode } from "react";
import z from "zod";

import { BusyLabel } from "@/components/busy-label";
import { FieldError, fieldDescribedBy } from "@/components/field-error";
import {
  ClearFiltersButton,
  FilterBar,
  FilterChips,
  FilterSearch,
} from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import Loader from "@/components/loader";
import { MobileList, MobileListRow } from "@/components/mobile-list";
import { MoneyField } from "@/components/money-field";
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

type Role = "supervisor" | "kasir" | "mekanik";
type RoleFilter = "" | Role;
type StatusFilter = "" | "aktif" | "nonaktif";

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  ongkosPercent: number;
  konsumsiMonthlyIdr: number;
  bonusIdr: number;
  active: boolean | number;
  userId?: string | null;
  email?: string | null;
};

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

type EmployeeFormValues = {
  name: string;
  role: Role;
  email: string;
  password: string;
  ongkosPercent: string;
  konsumsiMonthlyIdr: string;
  bonusIdr: string;
  active: boolean;
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

const employeeFormFields = z.object({
  name: z.string().min(1, "Masukkan nama karyawan."),
  role: z.enum(["supervisor", "kasir", "mekanik"]),
  email: z.string(),
  password: z.string(),
  ongkosPercent: z.string().superRefine((value, ctx) => {
    const percent = Number(value);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      ctx.addIssue({ code: "custom", message: "Masukkan persen ongkos 0–100." });
    }
  }),
  konsumsiMonthlyIdr: z.string(),
  bonusIdr: z.string(),
  active: z.boolean(),
});

const LOGIN_PAIR_MESSAGE = "Email dan kata sandi keduanya diperlukan untuk membuat login.";

function refineLoginPair(
  value: { email: string; password: string },
  ctx: z.RefinementCtx,
  mode: "create" | "edit",
) {
  const hasEmail = value.email.trim().length > 0;
  const hasPassword = value.password.length > 0;
  if (hasPassword && value.password.length < 8) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: "Kata sandi minimal 8 karakter.",
    });
  }
  if (mode === "create" && hasEmail !== hasPassword) {
    ctx.addIssue({
      code: "custom",
      path: hasEmail ? ["password"] : ["email"],
      message: LOGIN_PAIR_MESSAGE,
    });
  }
  if (mode === "edit" && hasPassword && !hasEmail) {
    ctx.addIssue({
      code: "custom",
      path: ["email"],
      message: LOGIN_PAIR_MESSAGE,
    });
  }
}

const defaultEmployeeValues: EmployeeFormValues = {
  name: "",
  role: "mekanik",
  email: "",
  password: "",
  ongkosPercent: "0",
  konsumsiMonthlyIdr: "",
  bonusIdr: "0",
  active: true,
};

function isEmployeeActive(row: EmployeeRow) {
  return row.active !== false && row.active !== 0;
}

function asRole(role: string): Role {
  return role === "supervisor" || role === "kasir" ? role : "mekanik";
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
  return {
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
  };
}

function EmployeeFields({
  form,
  idPrefix,
}: {
  form: {
    Field: (props: {
      name: keyof EmployeeFormValues;
      children: (field: {
        name: string;
        state: {
          value: unknown;
          meta: { errors: Array<{ message?: string } | undefined> };
        };
        handleBlur: () => void;
        handleChange: (value: string | boolean) => void;
      }) => ReactNode;
    }) => ReactNode | Promise<ReactNode>;
  };
  idPrefix: string;
}) {
  return (
    <>
      <form.Field name="name">
        {(field) => {
          const errorId = `${idPrefix}-name-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Nama</Label>
              <Input
                id={`${idPrefix}-${field.name}`}
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors)}
              />
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-${field.name}`}>Peran</Label>
            <Select
              value={String(field.state.value)}
              onValueChange={(value) => {
                if (value === "supervisor" || value === "kasir" || value === "mekanik") {
                  field.handleChange(value);
                }
              }}
            >
              <SelectTrigger id={`${idPrefix}-${field.name}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mekanik">Mekanik</SelectItem>
                <SelectItem value="kasir">Kasir</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => {
          const errorId = `${idPrefix}-email-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Email (opsional)</Label>
              <Input
                id={`${idPrefix}-${field.name}`}
                type="email"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="off"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors) ?? `${idPrefix}-login-hint`}
              />
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <form.Field name="password">
        {(field) => {
          const errorId = `${idPrefix}-password-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Kata sandi (opsional)</Label>
              <Input
                id={`${idPrefix}-${field.name}`}
                type="password"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="new-password"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={
                  fieldDescribedBy(errorId, field.state.meta.errors) ?? `${idPrefix}-login-hint`
                }
              />
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <p id={`${idPrefix}-login-hint`} className="text-pretty text-sm text-muted-foreground">
        {LOGIN_PAIR_MESSAGE}
      </p>
      <form.Field name="ongkosPercent">
        {(field) => {
          const errorId = `${idPrefix}-${field.name}-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Persen ongkos</Label>
              <Input
                id={`${idPrefix}-${field.name}`}
                inputMode="numeric"
                className="tabular-nums"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="0"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors)}
              />
              <p className="text-pretty text-sm text-muted-foreground">
                Bagian gaji dari ongkos kerja yang diterima (0–100).
              </p>
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <form.Field name="konsumsiMonthlyIdr">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-${field.name}`}>Konsumsi bulanan</Label>
            <MoneyField
              id={`${idPrefix}-${field.name}`}
              value={String(field.state.value)}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Kosong = tidak ada"
            />
            <p className="text-pretty text-sm text-muted-foreground">
              Uang makan sebulan jika ada hari hadir. Opsional.
            </p>
          </div>
        )}
      </form.Field>
      <form.Field name="bonusIdr">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-${field.name}`}>Bonus</Label>
            <MoneyField
              id={`${idPrefix}-${field.name}`}
              value={String(field.state.value)}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="0"
            />
          </div>
        )}
      </form.Field>
      <form.Field name="active">
        {(field) => (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-${field.name}`}
              checked={field.state.value === true}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={`${idPrefix}-${field.name}`}>Karyawan aktif</Label>
          </div>
        )}
      </form.Field>
    </>
  );
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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [importResult, setImportResult] = useState<(ImportSheetResult & Record<string, unknown>) | null>(
    null,
  );

  const listQuery = useQuery(trpc.employee.list.queryOptions());
  const rows = (listQuery.data ?? []) as EmployeeRow[];

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
        ongkosPercent: Number(value.ongkosPercent),
        konsumsiMonthlyIdr: Number(value.konsumsiMonthlyIdr || 0),
        bonusIdr: Number(value.bonusIdr),
        active: value.active,
        ...optionalLoginFields(value.email, value.password),
      });
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
        ongkosPercent: Number(value.ongkosPercent),
        konsumsiMonthlyIdr: Number(value.konsumsiMonthlyIdr || 0),
        bonusIdr: Number(value.bonusIdr),
        active: value.active,
        ...optionalLoginFields(value.email, value.password),
      });
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
    editForm.setFieldValue("ongkosPercent", String(row.ongkosPercent));
    editForm.setFieldValue("konsumsiMonthlyIdr", String(row.konsumsiMonthlyIdr));
    editForm.setFieldValue("bonusIdr", String(row.bonusIdr));
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
                        trailing={`${row.ongkosPercent}%`}
                        meta={
                          <>
                            <Badge variant="outline">{roleLabel(row.role)}</Badge>
                            <StatusBadge
                              icon={active ? Check : CircleOff}
                              label={active ? "Aktif" : "Nonaktif"}
                              tone={active ? "success" : "neutral"}
                            />
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
                      <TableHead className="text-end">Persen ongkos</TableHead>
                      <TableHead className="text-end">Konsumsi/bulan</TableHead>
                      <TableHead className="text-end">Bonus</TableHead>
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
                          <TableCell className="text-end tabular-nums">
                            {row.ongkosPercent}%
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatRp(row.konsumsiMonthlyIdr)}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">
                            {formatRp(row.bonusIdr)}
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
        <EmployeeFields form={createForm} idPrefix="create" />
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
        <EmployeeFields form={editForm} idPrefix="edit" />
      </FormDialog>
    </PageShell>
  );
}
