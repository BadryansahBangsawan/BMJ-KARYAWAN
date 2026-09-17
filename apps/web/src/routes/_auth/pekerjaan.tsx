import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@BMJ-KARYAWAN/ui/components/dialog";
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
import { Textarea } from "@BMJ-KARYAWAN/ui/components/textarea";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Check, CircleCheck, CircleDashed, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import z from "zod";
import { toast } from "sonner";

import { FieldError, fieldDescribedBy } from "@/components/field-error";
import { ClearFiltersButton, FilterBar, FilterChips } from "@/components/filter-bar";
import { ConfirmDialog, FormDialog } from "@/components/form-dialog";
import Loader from "@/components/loader";
import { MobileList, MobileListRow } from "@/components/mobile-list";
import { MoneyField } from "@/components/money-field";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DateRangeFields } from "@/components/period-fields";
import { ResponsiveRecords } from "@/components/responsive-records";
import { SectionHeader } from "@/components/section-header";
import { PageError, StatePanel } from "@/components/state-panel";
import { StatusBadge } from "@/components/status-badge";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";
import { formatLongDate, formatRp, monthBounds, todayYmd } from "@/lib/format";
import { jpegDataUrlFromFile } from "@/lib/workshop-gps";
import { sessionRole, type UserRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";

type JobRow = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  name?: string | null;
  workDate: string;
  description: string;
  amountIdr: number;
  struk?: string | null;
  customerNote?: string | null;
  status: string;
  kind: string;
  bengkelPercent?: number | null;
};

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
};

type StatusFilter = "" | "proses" | "selesai" | "diterima" | "batal";

export const JOB_STATUS = {
  proses: { label: "Proses", icon: CircleDashed, tone: "neutral" },
  selesai: { label: "Selesai", icon: CircleCheck, tone: "neutral" },
  diterima: { label: "Diterima", icon: Check, tone: "success" },
  batal: { label: "Batal", icon: Ban, tone: "danger" },
} as const;

export const Route = createFileRoute("/_auth/pekerjaan")({
  component: PekerjaanPage,
});

function jobKindLabel(job: JobRow) {
  if (job.kind === "persenan") {
    return job.bengkelPercent != null ? `Persenan ${job.bengkelPercent}%` : "Persenan";
  }
  return "Ongkos";
}

function jobMechanicName(job: JobRow, nameById: Record<string, string>) {
  return job.employeeName ?? job.name ?? nameById[job.employeeId] ?? "—";
}

function jobNeedsAction(job: JobRow, role: UserRole) {
  if (role === "mekanik") return job.status === "proses";
  return job.status === "proses" || job.status === "selesai";
}

function jobStatusMeta(status: string) {
  return (
    JOB_STATUS[status as keyof typeof JOB_STATUS] ?? {
      label: status,
      icon: CircleDashed,
      tone: "neutral" as const,
    }
  );
}

function isStrukImage(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return true;
  return /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i.test(trimmed);
}

async function extractStruk(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<{ tanggal?: string; nomorStruk?: string }> {
  const res = await fetch("/api/extract-struk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
    signal,
  });
  if (!res.ok) return {};
  return (await res.json()) as { tanggal?: string; nomorStruk?: string };
}

function JobRowActions({
  job,
  role,
  busy,
  onSelesai,
  onTerima,
  onBatal,
  onDetail,
}: {
  job: JobRow;
  role: UserRole;
  busy: boolean;
  onSelesai: () => void;
  onTerima: () => void;
  onBatal: () => void;
  onDetail: () => void;
}) {
  const canSelesai = role === "mekanik" && job.status === "proses";
  const canTerima =
    (role === "kasir" || role === "supervisor") &&
    (job.status === "proses" || job.status === "selesai");
  const canBatal = role === "supervisor" && job.status !== "batal";
  const hasDetail = Boolean(job.customerNote || job.struk);

  if (!canSelesai && !canTerima && !canBatal && !hasDetail) return null;

  return (
    <>
      {canSelesai ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={onSelesai}>
          Tandai selesai
        </Button>
      ) : null}
      {canTerima ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={onTerima}>
          Terima pekerjaan
        </Button>
      ) : null}
      {hasDetail ? (
        <Button size="sm" variant="outline" onClick={onDetail}>
          Lihat detail
        </Button>
      ) : null}
      {canBatal ? (
        <Button size="sm" variant="destructive" disabled={busy} onClick={onBatal}>
          Batalkan pekerjaan
        </Button>
      ) : null}
    </>
  );
}

function PekerjaanPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const canCreate = role === "mekanik" || role === "supervisor";
  const bounds = useMemo(() => monthBounds(), []);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [strukturInfo, setStrukturInfo] = useState("");
  const [nomorStruk, setNomorStruk] = useState("");
  const extractAbortRef = useRef<AbortController | null>(null);

  const listInput = {
    ...(role === "supervisor"
      ? { from, to }
      : { from: "2000-01-01", to: "2099-12-31" }),
    ...(employeeIdFilter ? { employeeId: employeeIdFilter } : {}),
  };

  const jobsQuery = useQuery(trpc.job.list.queryOptions(listInput));
  const employeesQuery = useQuery({
    ...trpc.employee.list.queryOptions(),
    enabled: role === "kasir" || role === "supervisor",
  });

  const jobs = (jobsQuery.data ?? []) as JobRow[];
  const allEmployees = (employeesQuery.data ?? []) as EmployeeRow[];
  const employees = allEmployees.filter((row) => row.role === "mekanik");
  const nameById: Record<string, string> = {};
  for (const row of allEmployees) {
    nameById[row.id] = row.name;
  }

  const statusCounts = {
    "": jobs.length,
    proses: 0,
    selesai: 0,
    diterima: 0,
    batal: 0,
  };
  for (const job of jobs) {
    if (job.status === "proses" || job.status === "selesai" || job.status === "diterima" || job.status === "batal") {
      statusCounts[job.status] += 1;
    }
  }

  const visible = (statusFilter ? jobs.filter((job) => job.status === statusFilter) : jobs).slice().sort((a, b) => {
    const aNeed = jobNeedsAction(a, role) ? 0 : 1;
    const bNeed = jobNeedsAction(b, role) ? 0 : 1;
    return aNeed - bNeed;
  });

  const hasPersenan = jobs.some((job) => job.kind === "persenan");
  const filtersActive =
    statusFilter !== "" ||
    employeeIdFilter !== "" ||
    (role === "supervisor" && (from !== bounds.from || to !== bounds.to));
  const cancelRow = jobs.find((job) => job.id === cancelId);
  const detailRow = jobs.find((job) => job.id === detailId);

  const invalidateJobs = async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const path = query.queryKey[0];
        return Array.isArray(path) && path[0] === "job";
      },
    });
    await jobsQuery.refetch();
  };

  const createMut = useMutation(
    trpc.job.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Pekerjaan disimpan");
        setCreateOpen(false);
        await invalidateJobs();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const statusMut = useMutation(
    trpc.job.setStatus.mutationOptions({
      onSuccess: async (_row, input) => {
        toast.success(
          input.status === "selesai"
            ? "Pekerjaan ditandai selesai"
            : input.status === "diterima"
              ? "Pekerjaan diterima"
              : "Pekerjaan dibatalkan",
        );
        setCancelId(null);
        await invalidateJobs();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useForm({
    defaultValues: {
      employeeId: "",
      workDate: todayYmd(),
      description: "",
      amountIdr: "",
      struk: "",
      customerNote: "",
      kind: "ongkos" as "ongkos" | "persenan",
      bengkelPercent: "",
    },
    onSubmit: async ({ value }) => {
      const payload: {
        workDate: string;
        description: string;
        amountIdr: number;
        struk?: string;
        customerNote?: string;
        kind: "ongkos" | "persenan";
        bengkelPercent?: number;
        employeeId?: string;
      } = {
        workDate: role === "mekanik" ? todayYmd() : value.workDate,
        description: value.description,
        amountIdr: Number(value.amountIdr),
        kind: role === "mekanik" ? "ongkos" : value.kind,
      };
      if (nomorStruk) payload.struk = nomorStruk;
      else if (value.struk && !value.struk.startsWith("data:")) payload.struk = value.struk;
      if (value.customerNote) payload.customerNote = value.customerNote;
      if (role !== "mekanik" && value.kind === "persenan") {
        payload.bengkelPercent = Number(value.bengkelPercent);
      }
      if (role === "supervisor" && value.employeeId) {
        payload.employeeId = value.employeeId;
      }
      await createMut.mutateAsync(payload);
      setNomorStruk("");
      setStrukturInfo("");
      form.reset();
    },
    validators: {
      onSubmit: z
        .object({
          employeeId: z.string(),
          workDate: z.string().min(1, "Masukkan tanggal pekerjaan."),
          description: z.string().min(1, "Masukkan uraian pekerjaan."),
          amountIdr: z.string().refine((v) => Number(v) > 0, "Masukkan ongkos lebih dari 0."),
          struk: z.string(),
          customerNote: z.string(),
          kind: z.enum(["ongkos", "persenan"]),
          bengkelPercent: z.string(),
        })
        .superRefine((value, ctx) => {
          if (role === "supervisor" && !value.employeeId) {
            ctx.addIssue({
              code: "custom",
              path: ["employeeId"],
              message: "Pilih mekanik.",
            });
          }
          if (value.kind === "persenan") {
            const percent = Number(value.bengkelPercent);
            if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
              ctx.addIssue({
                code: "custom",
                path: ["bengkelPercent"],
                message: "Masukkan persen bengkel 0–100.",
              });
            }
          }
        }),
    },
  });

  function clearFilters() {
    setFrom(bounds.from);
    setTo(bounds.to);
    setStatusFilter("");
    setEmployeeIdFilter("");
  }

  function rowBusy(jobId: string) {
    return statusMut.isPending && statusMut.variables?.id === jobId;
  }

  async function handleStrukFile(file: File, onPreview: (url: string) => void) {
    try {
      const preview = await jpegDataUrlFromFile(file);
      onPreview(preview);
      setStrukturInfo("");
      setNomorStruk("");
      extractAbortRef.current?.abort();
      const ctrl = new AbortController();
      extractAbortRef.current = ctrl;
      setExtracting(true);
      const vision = await jpegDataUrlFromFile(file, 1024, 400_000);
      const result = await extractStruk(vision, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (result.tanggal && role !== "mekanik") form.setFieldValue("workDate", result.tanggal);
      if (result.nomorStruk) {
        setNomorStruk(result.nomorStruk);
        setStrukturInfo(`No. struk: ${result.nomorStruk}`);
      } else if (!result.tanggal) {
        toast.error("Struk tidak terbaca. Isi tanggal dan uraian manual.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Gagal membaca struk.");
    } finally {
      setExtracting(false);
    }
  }


  return (
    <PageShell>
      <PageHeader
        title="Pekerjaan"
        description={PAGE_DESCRIPTION["/pekerjaan"]}
        actions={
          canCreate ? (
            <Button type="button" className="w-full min-w-0 sm:w-auto" onClick={() => setCreateOpen(true)}>
              Catat pekerjaan
            </Button>
          ) : null
        }
      />

      {hasPersenan ? (
        <p className="rounded-xl bg-muted/40 px-4 py-3 text-pretty text-sm">
          Komplain = pembatalan ongkos kerja
        </p>
      ) : null}

      {jobsQuery.isError ? (
        <PageError onRetry={() => void jobsQuery.refetch()} />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Daftar pekerjaan" count={visible.length} />
          <FilterBar>
            {role === "supervisor" ? (
              <DateRangeFields from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            ) : null}
            <FilterChips
              ariaLabel="Filter status pekerjaan"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "", label: "Semua", count: statusCounts[""] },
                { value: "proses", label: "Proses", count: statusCounts.proses },
                { value: "selesai", label: "Selesai", count: statusCounts.selesai },
                { value: "diterima", label: "Diterima", count: statusCounts.diterima },
                { value: "batal", label: "Batal", count: statusCounts.batal },
              ]}
            />
            {role !== "mekanik" ? (
              <div className="min-w-0 space-y-2 sm:max-w-xs">
                <Label htmlFor="employee">Mekanik</Label>
                <Select
                  value={employeeIdFilter || null}
                  onValueChange={(value) => setEmployeeIdFilter(value ?? "")}
                >
                  <SelectTrigger id="employee" className="w-full">
                    <SelectValue placeholder="Semua" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <ClearFiltersButton visible={filtersActive} onClick={clearFilters} />
          </FilterBar>

          {jobsQuery.isPending ? (
            <Loader />
          ) : visible.length === 0 ? (
            <StatePanel
              title={filtersActive ? "Tidak ada pekerjaan untuk filter ini" : "Belum ada pekerjaan"}
              description={
                filtersActive
                  ? "Hapus filter untuk melihat pekerjaan lain."
                  : canCreate
                    ? "Catat pekerjaan baru dari tombol di atas."
                    : "Belum ada pekerjaan pada periode ini."
              }
              action={
                filtersActive ? (
                  <Button type="button" variant="outline" onClick={clearFilters}>
                    Hapus filter
                  </Button>
                ) : canCreate ? (
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
                    Catat pekerjaan
                  </Button>
                ) : null
              }
            />
          ) : (
            <ResponsiveRecords
              cards={
                <MobileList>
                  {visible.map((job) => (
                    <MobileListRow
                      key={job.id}
                      title={job.description}
                      subtitle={
                        <>
                          {jobKindLabel(job)}
                          {" · "}
                          {jobMechanicName(job, nameById)}
                          {" · "}
                          <span className="tabular-nums">{job.workDate}</span>
                        </>
                      }
                      trailing={formatRp(job.amountIdr)}
                      meta={<StatusBadge {...jobStatusMeta(job.status)} />}
                    >
                      <JobRowActions
                        job={job}
                        role={role}
                        busy={rowBusy(job.id)}
                        onSelesai={() => statusMut.mutate({ id: job.id, status: "selesai" })}
                        onTerima={() => statusMut.mutate({ id: job.id, status: "diterima" })}
                        onBatal={() => setCancelId(job.id)}
                        onDetail={() => setDetailId(job.id)}
                      />
                    </MobileListRow>
                  ))}
                </MobileList>
              }
              table={
                <Table>
                  <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Mekanik</TableHead>
                      <TableHead>Uraian</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-end">Ongkos</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="tabular-nums">{job.workDate}</TableCell>
                        <TableCell>{jobMechanicName(job, nameById)}</TableCell>
                        <TableCell className="max-w-xs whitespace-normal">{job.description}</TableCell>
                        <TableCell>{jobKindLabel(job)}</TableCell>
                        <TableCell className="text-end tabular-nums">{formatRp(job.amountIdr)}</TableCell>
                        <TableCell>
                          <StatusBadge {...jobStatusMeta(job.status)} />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-wrap gap-2">
                            <JobRowActions
                              job={job}
                              role={role}
                              busy={rowBusy(job.id)}
                              onSelesai={() => statusMut.mutate({ id: job.id, status: "selesai" })}
                              onTerima={() => statusMut.mutate({ id: job.id, status: "diterima" })}
                              onBatal={() => setCancelId(job.id)}
                              onDetail={() => setDetailId(job.id)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}
        </section>
      )}

      {canCreate ? (
        <FormDialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (open) {
              form.setFieldValue("workDate", todayYmd());
              if (role === "mekanik") form.setFieldValue("kind", "ongkos");
            } else {
              setStrukturInfo("");
              setExtracting(false);
              extractAbortRef.current?.abort();
            }
          }}
          title="Catat pekerjaan"
          description={
            role === "mekanik"
              ? "Uraian dan ongkos. Tanggal mengikuti hari ini."
              : "Masukkan uraian, ongkos, dan jenis. Nominal dalam rupiah utuh."
          }
          submitLabel="Catat pekerjaan"
          submitting={createMut.isPending}
          onSubmit={() => form.handleSubmit()}
        >
          {role === "supervisor" ? (
            <form.Field name="employeeId">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Mekanik</Label>
                  <Select
                    value={field.state.value || null}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <SelectTrigger
                      id={field.name}
                      className="w-full"
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={fieldDescribedBy("employeeId-error", field.state.meta.errors)}
                    >
                      <SelectValue placeholder="Pilih mekanik" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id="employeeId-error" errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          ) : null}

          {/* Struk (foto) — hanya untuk mekanik, muncul paling atas */}
          {role === "mekanik" ? (
            <form.Field name="struk">
              {(field) => (
                <div className="space-y-2">
                  <Label>Struk</Label>
                  {field.state.value && isStrukImage(field.state.value) ? (
                    <div className="flex items-start gap-3">
                      <img
                        src={field.state.value}
                        alt="Preview struk"
                        className="max-h-20 w-auto max-w-[6rem] rounded-[8px] object-contain outline outline-1 outline-border"
                      />
                      <div className="flex flex-col gap-1">
                        {strukturInfo ? (
                          <p className="text-xs text-muted-foreground">{strukturInfo}</p>
                        ) : null}
                        <label className="cursor-pointer text-sm font-medium text-primary underline-offset-2 hover:underline">
                          Ganti
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              void handleStrukFile(file, (url) => field.handleChange(url));
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50">
                      {extracting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span>📷</span>
                      )}
                      Foto struk
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          void handleStrukFile(file, (url) => field.handleChange(url));
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </form.Field>
          ) : null}

          {role === "mekanik" ? (
            <p className="min-w-0 text-pretty text-sm text-muted-foreground">
              Tanggal {formatLongDate(todayYmd())}
            </p>
          ) : (
            <form.Field name="workDate">
              {(field) => (
                <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
                  <Label htmlFor={field.name}>Tanggal</Label>
                  <Input
                    id={field.name}
                    type="date"
                    className="w-full min-w-0 max-w-full"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    aria-describedby={fieldDescribedBy("workDate-error", field.state.meta.errors)}
                  />
                  <FieldError id="workDate-error" errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          )}

          <form.Field name="description">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Uraian</Label>
                <Textarea
                  id={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Mis. ganti oli mesin"
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={fieldDescribedBy("description-error", field.state.meta.errors)}
                />
                <FieldError id="description-error" errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>

          <form.Field name="amountIdr">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Ongkos</Label>
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

          <form.Field name="customerNote">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Ket / pelanggan</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Catatan singkat"
                />
              </div>
            )}
          </form.Field>

          {/* Struk teks — hanya untuk supervisor, di bawah Ket */}
          {role === "supervisor" ? (
            <form.Field name="struk">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Struk</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Nomor atau tautan struk"
                  />
                </div>
              )}
            </form.Field>
          ) : null}

          {role === "supervisor" ? (
            <>
              <form.Field name="kind">
                {(field) => (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Jenis</span>
                    <FilterChips
                      ariaLabel="Jenis ongkos"
                      value={field.state.value}
                      onChange={(value) => field.handleChange(value)}
                      options={[
                        { value: "ongkos", label: "Ongkos" },
                        { value: "persenan", label: "Persenan" },
                      ]}
                    />
                  </div>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.kind}>
                {(kind) =>
                  kind === "persenan" ? (
                    <form.Field name="bengkelPercent">
                      {(field) => (
                        <div className="space-y-2">
                          <Label htmlFor={field.name}>Persen bengkel (0–100)</Label>
                          <Input
                            id={field.name}
                            inputMode="numeric"
                            className="tabular-nums"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="30"
                            aria-invalid={field.state.meta.errors.length > 0}
                            aria-describedby={fieldDescribedBy("bengkelPercent-error", field.state.meta.errors)}
                          />
                          <FieldError id="bengkelPercent-error" errors={field.state.meta.errors} />
                        </div>
                      )}
                    </form.Field>
                  ) : null
                }
              </form.Subscribe>
            </>
          ) : null}
        </FormDialog>
      ) : null}

      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(open) => {
          if (!open) setCancelId(null);
        }}
        title="Batalkan pekerjaan"
        description={
          cancelRow
            ? `Pekerjaan ${cancelRow.description} sebesar ${formatRp(cancelRow.amountIdr)} akan dibatalkan dan tidak dihitung.`
            : "Pekerjaan akan dibatalkan dan tidak dihitung."
        }
        confirmLabel="Batalkan pekerjaan"
        confirming={statusMut.isPending && statusMut.variables?.status === "batal"}
        onConfirm={() => {
          if (!cancelId) return;
          statusMut.mutate({ id: cancelId, status: "batal" });
        }}
      />

      <Dialog
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail pekerjaan</DialogTitle>
            <DialogDescription>
              {detailRow
                ? `${detailRow.description} · ${formatRp(detailRow.amountIdr)}`
                : "Catatan dan struk pekerjaan."}
            </DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <div className="grid gap-4">
              {detailRow.customerNote ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Catatan</p>
                  <p className="text-pretty text-sm text-muted-foreground">{detailRow.customerNote}</p>
                </div>
              ) : null}
              {detailRow.struk ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Struk</p>
                  {isStrukImage(detailRow.struk) ? (
                    <a href={detailRow.struk} target="_blank" rel="noreferrer">
                      <img
                        src={detailRow.struk}
                        alt="Struk pekerjaan"
                        className="max-h-80 w-auto max-w-full rounded-[10px] outline outline-1 outline-border"
                      />
                    </a>
                  ) : (
                    <p className="break-all text-sm text-muted-foreground">{detailRow.struk}</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetailId(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
