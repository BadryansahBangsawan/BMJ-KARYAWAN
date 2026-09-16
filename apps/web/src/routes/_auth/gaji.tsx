import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@BMJ-KARYAWAN/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@BMJ-KARYAWAN/ui/components/empty";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { Lock, Pencil } from "lucide-react";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";
import { MobileList, MobileListRow } from "@/components/mobile-list";
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

function formatHari(tenths: number) {
  return (tenths / 100).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function jayapuraYearMonth() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jayapura" });
  const [year, month] = ymd.split("-").map(Number);
  return { year, month };
}

type PayrollLine = {
  id: string;
  employeeId: string;
  employeeName?: string | null;
  name?: string | null;
  daysPresent: number;
  dailyRateIdr: number;
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

export const Route = createFileRoute("/_auth/gaji")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: GajiPage,
});

function GajiPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);
  const now = useMemo(() => jayapuraYearMonth(), []);
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [draftPotongan, setDraftPotongan] = useState<Record<string, string>>({});

  const payrollQuery = useQuery(trpc.payroll.get.queryOptions({ year, month }));
  const meQuery = useQuery(trpc.employee.me.queryOptions());
  const data = payrollQuery.data as PayrollGet | undefined;
  const period = data?.period;
  const allLines = data?.lines ?? [];
  const meId = (meQuery.data as { id?: string } | null | undefined)?.id;
  const lines = role === "mekanik" && meId ? allLines.filter((line) => line.employeeId === meId) : allLines;
  const isDraft = period?.status !== "finalized";

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.payroll.get.queryKey({ year, month }) });
  };

  const recomputeMut = useMutation(
    trpc.payroll.recompute.mutationOptions({
      onSuccess: async () => {
        toast.success("Gaji dihitung ulang");
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
  const finalizeMut = useMutation(
    trpc.payroll.finalize.mutationOptions({
      onSuccess: async () => {
        toast.success("Periode gaji dikunci");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle>Periode</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="year">Tahun</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="month">Bulan</Label>
            <Input
              id="month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          {period ? (
            <Badge
              variant={period.status === "finalized" ? "secondary" : "outline"}
              className="gap-1"
            >
              {period.status === "finalized" ? (
                <Lock className="size-3" aria-hidden="true" />
              ) : (
                <Pencil className="size-3" aria-hidden="true" />
              )}
              {period.status === "finalized" ? "Final" : "Draf"}
            </Badge>
          ) : null}
          {period?.payDate ? (
            <span className="text-muted-foreground text-sm">Bayar {period.payDate}</span>
          ) : null}
          {role === "supervisor" && isDraft ? (
            <>
              <Button
                variant="outline"
                onClick={() => recomputeMut.mutate({ year, month, keepDeductions: false })}
              >
                Hitung ulang
              </Button>
              <Button
                variant="outline"
                onClick={() => recomputeMut.mutate({ year, month, keepDeductions: true })}
              >
                Hitung ulang (pertahankan potongan)
              </Button>
              <Button onClick={() => finalizeMut.mutate({ year, month })}>Kunci gaji</Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slip gaji</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada baris gaji</EmptyTitle>
                <EmptyDescription>Pilih periode atau hitung ulang sebagai supervisor.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ResponsiveRecords
              cards={
                <MobileList>
                  {lines.map((line) => (
                    <MobileListRow
                      key={line.id}
                      title={line.employeeName ?? line.name ?? line.employeeId}
                      subtitle={`${formatHari(line.daysPresent)} hari`}
                      trailing={
                        <span className="tabular-nums">{formatIdr(line.takeHomeIdr)}</span>
                      }
                    >
                      <dl className="grid w-full grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">Tarif</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.dailyRateIdr)}</dd>
                        <dt className="text-muted-foreground">Gaji harian</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.dailyPayIdr)}</dd>
                        <dt className="text-muted-foreground">Kasbon</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.kasbonBalanceIdr)}</dd>
                        <dt className="text-muted-foreground">Potongan</dt>
                        <dd className="text-end">
                          {role === "supervisor" && isDraft ? (
                            <div className="flex justify-end gap-1">
                              <Input
                                inputMode="numeric"
                                value={draftPotongan[line.id] ?? String(line.kasbonDeductionIdr)}
                                onChange={(e) =>
                                  setDraftPotongan((prev) => ({
                                    ...prev,
                                    [line.id]: e.target.value,
                                  }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  deductionMut.mutate({
                                    lineId: line.id,
                                    kasbonDeductionIdr: Number(
                                      draftPotongan[line.id] ?? line.kasbonDeductionIdr,
                                    ),
                                  })
                                }
                              >
                                Simpan
                              </Button>
                            </div>
                          ) : (
                            <span className="tabular-nums">{formatIdr(line.kasbonDeductionIdr)}</span>
                          )}
                        </dd>
                        <dt className="text-muted-foreground">Konsumsi</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.konsumsiIdr)}</dd>
                        <dt className="text-muted-foreground">Bonus</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.bonusIdr)}</dd>
                        <dt className="text-muted-foreground">Ongkos</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.jobShareIdr)}</dd>
                        <dt className="text-muted-foreground">Sisa kasbon</dt>
                        <dd className="text-end tabular-nums">{formatIdr(line.kasbonRemainingIdr)}</dd>
                      </dl>
                    </MobileListRow>
                  ))}
                </MobileList>
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Hari</TableHead>
                      <TableHead>Tarif</TableHead>
                      <TableHead>Gaji harian</TableHead>
                      <TableHead>Kasbon</TableHead>
                      <TableHead>Potongan</TableHead>
                      <TableHead>Konsumsi</TableHead>
                      <TableHead>Bonus</TableHead>
                      <TableHead>Ongkos</TableHead>
                      <TableHead>Diterima</TableHead>
                      <TableHead>Sisa kasbon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.employeeName ?? line.name ?? line.employeeId}</TableCell>
                        <TableCell>{formatHari(line.daysPresent)}</TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.dailyRateIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.dailyPayIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.kasbonBalanceIdr)}</span>
                        </TableCell>
                        <TableCell>
                          {role === "supervisor" && isDraft ? (
                            <div className="flex min-w-40 gap-1">
                              <Input
                                inputMode="numeric"
                                value={draftPotongan[line.id] ?? String(line.kasbonDeductionIdr)}
                                onChange={(e) =>
                                  setDraftPotongan((prev) => ({ ...prev, [line.id]: e.target.value }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  deductionMut.mutate({
                                    lineId: line.id,
                                    kasbonDeductionIdr: Number(
                                      draftPotongan[line.id] ?? line.kasbonDeductionIdr,
                                    ),
                                  })
                                }
                              >
                                Simpan
                              </Button>
                            </div>
                          ) : (
                            <span className="tabular-nums">{formatIdr(line.kasbonDeductionIdr)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.konsumsiIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.bonusIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.jobShareIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.takeHomeIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(line.kasbonRemainingIdr)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}
          <p className="text-muted-foreground text-sm">
            Bonus diberikan jika hadir minimal 20 hari dan alpa &lt; 5 hari.
          </p>
          <p className="text-muted-foreground text-sm">
            Konsumsi diberikan jika ada kehadiran di bulan tersebut.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
