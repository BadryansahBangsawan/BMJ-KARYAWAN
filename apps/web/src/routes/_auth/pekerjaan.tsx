import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@BMJ-KARYAWAN/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@BMJ-KARYAWAN/ui/components/empty";
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
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import z from "zod";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";
import { ResponsiveRecords } from "@/components/responsive-records";


type Role = "supervisor" | "kasir" | "mekanik";

function userRole(user: { role?: string | null } | null | undefined): Role {
  const role = user?.role;
  if (role === "supervisor" || role === "kasir" || role === "mekanik") return role;
  return "mekanik";
}

function formatIdr(n: number) {
  return n.toLocaleString("id-ID");
}

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jayapura" });
}

function monthBounds(ymd: string) {
  const [year, month] = ymd.split("-");
  const last = new Date(Number(year), Number(month), 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
  };
}

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

const STATUS_LABEL: Record<string, string> = {
  proses: "PROSES",
  selesai: "SELESAI",
  diterima: "DITERIMA",
  batal: "BATAL",
};

function statusVariant(status: string): "outline" | "secondary" | "default" | "destructive" {
  if (status === "selesai") return "secondary";
  if (status === "diterima") return "default";
  if (status === "batal") return "destructive";
  return "outline";
}

export const Route = createFileRoute("/_auth/pekerjaan")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: PekerjaanPage,
});

function PekerjaanPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);
  const bounds = useMemo(() => monthBounds(todayYmd()), []);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [statusFilter, setStatusFilter] = useState<
    "" | "proses" | "selesai" | "diterima" | "batal"
  >("");
  const [employeeIdFilter, setEmployeeIdFilter] = useState<string>("");

  const listInput = {
    from,
    to,
    ...(statusFilter ? { status: statusFilter } : {}),
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
  const hasPersenan = jobs.some((job) => job.kind === "persenan");

  const invalidateJobs = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.job.list.queryKey() });
  };

  const createMut = useMutation(
    trpc.job.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Pekerjaan disimpan");
        await invalidateJobs();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const statusMut = useMutation(
    trpc.job.setStatus.mutationOptions({
      onSuccess: async () => {
        toast.success("Status diperbarui");
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
      const amountIdr = Number(value.amountIdr);
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
        workDate: value.workDate,
        description: value.description,
        amountIdr,
        kind: value.kind,
      };
      if (value.struk) payload.struk = value.struk;
      if (value.customerNote) payload.customerNote = value.customerNote;
      if (value.kind === "persenan") {
        payload.bengkelPercent = Number(value.bengkelPercent);
      }
      if (role === "supervisor" && value.employeeId) {
        payload.employeeId = value.employeeId;
      }
      await createMut.mutateAsync(payload);
      form.reset();
    },
    validators: {
      onSubmit: z.object({
        employeeId: z.string(),
        workDate: z.string().min(1, "Tanggal wajib"),
        description: z.string().min(1, "Pekerjaan wajib"),
        amountIdr: z.string().refine((v) => Number(v) > 0, "Ongkos harus lebih dari 0"),
        struk: z.string(),
        customerNote: z.string(),
        kind: z.enum(["ongkos", "persenan"]),
        bengkelPercent: z.string(),
      }),
    },
  });

  const canCreate = role === "mekanik" || role === "supervisor";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4">

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Catat pekerjaan</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="grid gap-3 md:grid-cols-2"
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
                        <SelectTrigger id={field.name} className="w-full">
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
                    </div>
                  )}
                </form.Field>
              ) : null}

              <form.Field name="workDate">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Tanggal</Label>
                    <Input
                      id={field.name}
                      type="date"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="description">
                {(field) => (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={field.name}>Pekerjaan</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="amountIdr">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Ongkos (IDR)</Label>
                    <Input
                      id={field.name}
                      inputMode="numeric"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="struk">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Struk</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="customerNote">
                {(field) => (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={field.name}>Ket / pelanggan</Label>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="kind">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Jenis</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === "ongkos" || value === "persenan") {
                          field.handleChange(value);
                        }
                      }}
                    >
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ongkos">Ongkos</SelectItem>
                        <SelectItem value="persenan">Persenan</SelectItem>
                      </SelectContent>
                    </Select>
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
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </div>
                      )}
                    </form.Field>
                  ) : (
                    <div />
                  )
                }
              </form.Subscribe>

              <div className="md:col-span-2">
                <form.Subscribe
                  selector={(state) => ({
                    canSubmit: state.canSubmit,
                    isSubmitting: state.isSubmitting,
                  })}
                >
                  {({ canSubmit, isSubmitting }) => (
                    <Button type="submit" disabled={!canSubmit || isSubmitting} className="w-full">
                      {isSubmitting ? "Menyimpan..." : "Simpan"}
                    </Button>
                  )}
                </form.Subscribe>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {hasPersenan ? (
        <div className="border border-border bg-muted/40 px-3 py-2 text-sm">
          Komplain = pembatalan ongkos kerja
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Daftar pekerjaan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="from">Dari</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Sampai</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={statusFilter || null}
                onValueChange={(value) =>
                  setStatusFilter(
                    (value ?? "") as "" | "proses" | "selesai" | "diterima" | "batal",
                  )
                }
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proses">PROSES</SelectItem>
                  <SelectItem value="selesai">SELESAI</SelectItem>
                  <SelectItem value="diterima">DITERIMA</SelectItem>
                  <SelectItem value="batal">BATAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role !== "mekanik" ? (
              <div className="space-y-2">
                <Label htmlFor="employee">Karyawan</Label>
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
          </div>

          {jobs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada pekerjaan</EmptyTitle>
                <EmptyDescription>Catat pekerjaan baru atau ubah filter tanggal.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ResponsiveRecords
              cards={
                <>
                  {jobs.map((job) => (
                    <Card key={job.id}>
                      <CardHeader>
                        <CardTitle>
                          {job.employeeName ?? job.name ?? nameById[job.employeeId] ?? "—"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                          <dt>Tanggal</dt>
                          <dd>{job.workDate}</dd>
                          <dt>Pekerjaan</dt>
                          <dd>
                            <div>{job.description}</div>
                            {job.customerNote ? (
                              <div className="text-muted-foreground">{job.customerNote}</div>
                            ) : null}
                          </dd>
                          <dt>Jenis</dt>
                          <dd>
                            {job.kind === "persenan"
                              ? `Persenan${job.bengkelPercent != null ? ` ${job.bengkelPercent}%` : ""}`
                              : "Ongkos"}
                          </dd>
                          <dt>Ongkos</dt>
                          <dd>
                            <span className="tabular-nums">{formatIdr(job.amountIdr)}</span>
                          </dd>
                          <dt>Struk</dt>
                          <dd>{job.struk ?? "—"}</dd>
                          <dt>Status</dt>
                          <dd>
                            <Badge variant={statusVariant(job.status)}>
                              {STATUS_LABEL[job.status] ?? job.status.toUpperCase()}
                            </Badge>
                          </dd>
                        </dl>
                      </CardContent>
                      <CardFooter className="flex flex-wrap gap-3">
                        {role === "mekanik" && job.status === "proses" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => statusMut.mutate({ id: job.id, status: "selesai" })}
                          >
                            Selesai
                          </Button>
                        ) : null}
                        {(role === "kasir" || role === "supervisor") &&
                        (job.status === "proses" || job.status === "selesai") ? (
                          <Button
                            size="sm"
                            onClick={() => statusMut.mutate({ id: job.id, status: "diterima" })}
                          >
                            Diterima
                          </Button>
                        ) : null}
                        {role === "supervisor" && job.status !== "batal" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => statusMut.mutate({ id: job.id, status: "batal" })}
                          >
                            Batal
                          </Button>
                        ) : null}
                      </CardFooter>
                    </Card>
                  ))}
                </>
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Pekerjaan</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Ongkos</TableHead>
                      <TableHead>Struk</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>{job.workDate}</TableCell>
                        <TableCell>
                          {job.employeeName ?? job.name ?? nameById[job.employeeId] ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div>{job.description}</div>
                          {job.customerNote ? (
                            <div className="text-muted-foreground">{job.customerNote}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {job.kind === "persenan"
                            ? `Persenan${job.bengkelPercent != null ? ` ${job.bengkelPercent}%` : ""}`
                            : "Ongkos"}
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(job.amountIdr)}</span>
                        </TableCell>
                        <TableCell>{job.struk ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(job.status)}>
                            {STATUS_LABEL[job.status] ?? job.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-1">
                          {role === "mekanik" && job.status === "proses" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => statusMut.mutate({ id: job.id, status: "selesai" })}
                            >
                              Selesai
                            </Button>
                          ) : null}
                          {(role === "kasir" || role === "supervisor") &&
                          (job.status === "proses" || job.status === "selesai") ? (
                            <Button
                              size="sm"
                              onClick={() => statusMut.mutate({ id: job.id, status: "diterima" })}
                            >
                              Diterima
                            </Button>
                          ) : null}
                          {role === "supervisor" && job.status !== "batal" ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => statusMut.mutate({ id: job.id, status: "batal" })}
                            >
                              Batal
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
