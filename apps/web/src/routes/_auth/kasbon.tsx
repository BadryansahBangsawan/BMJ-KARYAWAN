import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@BMJ-KARYAWAN/ui/components/card";
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
import { useState } from "react";
import z from "zod";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";
import { BusyLabel } from "@/components/busy-label";
import { MobileList, MobileListRow, StatTile } from "@/components/mobile-list";
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

type KasbonRow = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  name?: string | null;
  keperluan: string;
  amountIdr: number;
  status: string;
  paidIdr?: number | null;
  sisaIdr?: number | null;
  rejectedReason?: string | null;
};

type EmployeeRow = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  disbursed: "DISBURSED",
  lunas: "LUNAS",
};

export const Route = createFileRoute("/_auth/kasbon")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: KasbonPage,
});

function KasbonPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);
  const isKasirish = role === "kasir" || role === "supervisor";
  const [statusFilter, setStatusFilter] = useState<
    "" | "pending" | "approved" | "rejected" | "disbursed" | "lunas"
  >("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const listQuery = useQuery(
    trpc.kasbon.list.queryOptions(statusFilter ? { status: statusFilter } : {}),
  );
  const summaryQuery = useQuery({
    ...trpc.kasbon.summary.queryOptions(),
    enabled: isKasirish,
  });
  const employeesQuery = useQuery({
    ...trpc.employee.list.queryOptions(),
    enabled: role === "supervisor",
  });

  const rows = (listQuery.data ?? []) as KasbonRow[];
  const employees = (employeesQuery.data ?? []) as EmployeeRow[];
  const summary = summaryQuery.data as
    | {
        ttlAmount?: number;
        ttlPaid?: number;
        ttlSisa?: number;
      }
    | undefined;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.kasbon.list.queryKey() });
    await queryClient.invalidateQueries({ queryKey: trpc.kasbon.summary.queryKey() });
  };

  const createMut = useMutation(
    trpc.kasbon.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Kasbon diajukan");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const approveMut = useMutation(
    trpc.kasbon.approve.mutationOptions({
      onSuccess: async () => {
        toast.success("Kasbon disetujui");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const rejectMut = useMutation(
    trpc.kasbon.reject.mutationOptions({
      onSuccess: async () => {
        toast.success("Kasbon ditolak");
        setRejectId(null);
        setRejectReason("");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const disburseMut = useMutation(
    trpc.kasbon.disburse.mutationOptions({
      onSuccess: async () => {
        toast.success("Kasbon dicairkan");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const payMut = useMutation(
    trpc.kasbon.addPayment.mutationOptions({
      onSuccess: async () => {
        toast.success("Pembayaran tercatat");
        setPayId(null);
        setPayAmount("");
        await invalidate();
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
      if (role === "supervisor" && value.employeeId) {
        payload.employeeId = value.employeeId;
      }
      await createMut.mutateAsync(payload);
      form.reset();
    },
    validators: {
      onSubmit: z.object({
        employeeId: z.string(),
        keperluan: z.string().min(1, "Keperluan wajib"),
        amountIdr: z.string().refine((v) => Number(v) > 0, "Jumlah harus lebih dari 0"),
      }),
    },
  });

  const pending = rows.filter((row) => row.status === "pending");
  const approved = rows.filter((row) => row.status === "approved");
  const visible = rows.filter((row) =>
    ["pending", "approved", "disbursed", "lunas"].includes(row.status),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4">
      {isKasirish && summary ? (
        <div className="grid grid-cols-3 gap-2">
          <StatTile compact label="TTL" value={<span className="tabular-nums">{formatIdr(summary.ttlAmount ?? 0)}</span>} />
          <StatTile compact label="Dibayar" value={<span className="tabular-nums">{formatIdr(summary.ttlPaid ?? 0)}</span>} />
          <StatTile compact label="Sisa" value={<span className="tabular-nums">{formatIdr(summary.ttlSisa ?? 0)}</span>} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ajukan kasbon</CardTitle>
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
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={field.name}>Karyawan</Label>
                    <Select
                      value={field.state.value || null}
                      onValueChange={(value) => field.handleChange(value ?? "")}
                    >
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue placeholder="Diri sendiri / pilih karyawan" />
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
            <form.Field name="keperluan">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Keperluan</Label>
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
                  <Label htmlFor={field.name}>Jumlah (IDR)</Label>
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
            <div className="md:col-span-2">
              <form.Subscribe
                selector={(state) => ({ isSubmitting: state.isSubmitting })}
              >
                {({ isSubmitting }) => (
                  <Button type="submit" disabled={isSubmitting} className="w-full" aria-busy={isSubmitting}>
                    <BusyLabel busy={isSubmitting}>Ajukan</BusyLabel>
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </CardContent>
      </Card>

      {role === "supervisor" ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Antrian persetujuan</h2>
          {pending.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Tidak ada kasbon pending</EmptyTitle>
                <EmptyDescription>Pengajuan baru akan muncul di sini.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MobileList>
              {pending.map((row) => (
                <MobileListRow
                  key={row.id}
                  title={row.employeeName ?? row.name ?? row.employeeId}
                  subtitle={row.keperluan}
                  trailing={<span className="tabular-nums">{formatIdr(row.amountIdr)}</span>}
                >
                  <Button size="sm" onClick={() => approveMut.mutate({ kasbonId: row.id })}>
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
                    Tolak
                  </Button>
                  {rejectId === row.id ? (
                    <div className="flex w-full flex-wrap gap-3">
                      <Input
                        placeholder="Alasan"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!rejectReason.trim()}
                        onClick={() =>
                          rejectMut.mutate({ kasbonId: row.id, reason: rejectReason.trim() })
                        }
                      >
                        Kirim tolak
                      </Button>
                    </div>
                  ) : null}
                </MobileListRow>
              ))}
            </MobileList>
          )}
        </section>
      ) : null}

      {isKasirish ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Antrian pencairan</h2>
          {approved.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Tidak ada kasbon siap dicairkan</EmptyTitle>
                <EmptyDescription>Setelah disetujui supervisor, kasbon muncul di sini.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MobileList>
              {approved.map((row) => (
                <MobileListRow
                  key={row.id}
                  title={row.employeeName ?? row.name ?? row.employeeId}
                  subtitle={row.keperluan}
                  trailing={<span className="tabular-nums">{formatIdr(row.amountIdr)}</span>}
                >
                  <Button size="sm" onClick={() => disburseMut.mutate({ kasbonId: row.id })}>
                    Cairkan
                  </Button>
                </MobileListRow>
              ))}
            </MobileList>
          )}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Daftar kasbon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isKasirish ? (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="kasbon-status">Status</Label>
              <Select
                value={statusFilter || null}
                onValueChange={(value) =>
                  setStatusFilter(
                    (value ?? "") as
                      | ""
                      | "pending"
                      | "approved"
                      | "rejected"
                      | "disbursed"
                      | "lunas",
                  )
                }
              >
                <SelectTrigger id="kasbon-status" className="w-full">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">PENDING</SelectItem>
                  <SelectItem value="approved">APPROVED</SelectItem>
                  <SelectItem value="rejected">REJECTED</SelectItem>
                  <SelectItem value="disbursed">DISBURSED</SelectItem>
                  <SelectItem value="lunas">LUNAS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada kasbon</EmptyTitle>
                <EmptyDescription>Ajukan kasbon baru dari formulir di atas.</EmptyDescription>
              </EmptyHeader>
            </Empty>
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
                        title={row.employeeName ?? row.name ?? "—"}
                        subtitle={
                          row.rejectedReason ? (
                            <>
                              {row.keperluan}
                              <span className="block text-destructive">{row.rejectedReason}</span>
                            </>
                          ) : (
                            row.keperluan
                          )
                        }
                        trailing={<span className="tabular-nums">{formatIdr(row.amountIdr)}</span>}
                        meta={
                          <>
                            <Badge variant={row.status === "lunas" ? "default" : "outline"}>
                              {STATUS_LABEL[row.status] ?? row.status.toUpperCase()}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Dibayar <span className="tabular-nums">{formatIdr(paid)}</span>
                              {" · "}
                              Sisa <span className="tabular-nums">{formatIdr(sisa)}</span>
                            </span>
                          </>
                        }
                      >
                        {isKasirish && row.status === "disbursed" ? (
                          payId === row.id ? (
                            <>
                              <Input
                                inputMode="numeric"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                placeholder="IDR"
                              />
                              <Button
                                size="sm"
                                disabled={!(Number(payAmount) > 0)}
                                onClick={() =>
                                  payMut.mutate({
                                    kasbonId: row.id,
                                    amountIdr: Number(payAmount),
                                  })
                                }
                              >
                                Bayar
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setPayId(row.id)}>
                              Bayar
                            </Button>
                          )
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
                      <TableHead>Jumlah</TableHead>
                      <TableHead>Telah dibayar</TableHead>
                      <TableHead>Sisa</TableHead>
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
                          <TableCell>{row.employeeName ?? row.name ?? "—"}</TableCell>
                          <TableCell>
                            {row.keperluan}
                            {row.rejectedReason ? (
                              <div className="text-destructive text-xs">{row.rejectedReason}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className="tabular-nums">{formatIdr(row.amountIdr)}</span>
                          </TableCell>
                          <TableCell>
                            <span className="tabular-nums">{formatIdr(paid)}</span>
                          </TableCell>
                          <TableCell>
                            <span className="tabular-nums">{formatIdr(sisa)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.status === "lunas" ? "default" : "outline"}>
                              {STATUS_LABEL[row.status] ?? row.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isKasirish && row.status === "disbursed" ? (
                              payId === row.id ? (
                                <div className="flex gap-2">
                                  <Input
                                    inputMode="numeric"
                                    value={payAmount}
                                    onChange={(e) => setPayAmount(e.target.value)}
                                    placeholder="IDR"
                                  />
                                  <Button
                                    size="sm"
                                    disabled={!(Number(payAmount) > 0)}
                                    onClick={() =>
                                      payMut.mutate({
                                        kasbonId: row.id,
                                        amountIdr: Number(payAmount),
                                      })
                                    }
                                  >
                                    Bayar
                                  </Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => setPayId(row.id)}>
                                  Bayar
                                </Button>
                              )
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
        </CardContent>
      </Card>
    </div>
  );
}
