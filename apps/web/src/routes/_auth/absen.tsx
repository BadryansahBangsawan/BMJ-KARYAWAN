import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@BMJ-KARYAWAN/ui/components/card";
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

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

type Role = "supervisor" | "kasir" | "mekanik";

function userRole(user: { role?: string | null } | null | undefined): Role {
  const role = user?.role;
  if (role === "supervisor" || role === "kasir" || role === "mekanik") return role;
  return "mekanik";
}

function jayapuraYearMonth() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jayapura" });
  const [year, month] = ymd.split("-").map(Number);
  return { year, month };
}

function dayNumber(date: string) {
  return Number(date.slice(8));
}

function cellLabel(value: number | undefined) {
  if (value === 100) return "1";
  if (value === 50) return "0,5";
  if (value === 0) return "0";
  return "";
}

function nextValue(value: number | undefined): 0 | 50 | 100 | null {
  if (value === 100) return 50;
  if (value === 50) return 0;
  if (value === 0) return null;
  return 100;
}

type EmployeeRow = { id: string; name: string; role?: string };
type AttendanceRow = { id?: string; employeeId: string; workDate: string; value: number };

export const Route = createFileRoute("/_auth/absen")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (userRole(session.user) !== "supervisor") {
      throw redirect({ to: "/dashboard" });
    }
    return { session };
  },
  component: AbsenPage,
});

function AbsenPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);
  const now = useMemo(() => jayapuraYearMonth(), []);
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);

  const monthQuery = useQuery(trpc.attendance.month.queryOptions({ year, month }));

  const monthData = monthQuery.data as
    | {
        employees?: EmployeeRow[];
        marks?: AttendanceRow[];
        days?: string[];
      }
    | undefined;

  const employees = monthData?.employees ?? [];
  const marks = monthData?.marks ?? [];

  const byKey: Record<string, AttendanceRow> = {};
  for (const row of marks) {
    byKey[`${row.employeeId}:${row.workDate}`] = row;
  }

  const days = (monthData?.days ?? []).map((date) => ({
    day: dayNumber(date),
    date,
  }));

  const invalidateMonth = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.attendance.month.queryKey({ year, month }),
    });
  };

  const setMut = useMutation(
    trpc.attendance.set.mutationOptions({
      onSuccess: async () => {
        await invalidateMonth();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const clearMut = useMutation(
    trpc.attendance.clear.mutationOptions({
      onSuccess: async () => {
        await invalidateMonth();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function cycle(employeeId: string, workDate: string) {
    const current = byKey[`${employeeId}:${workDate}`]?.value;
    const next = nextValue(current);
    if (next === null) {
      clearMut.mutate({ employeeId, workDate });
      return;
    }
    setMut.mutate({ employeeId, workDate, value: next });
  }

  if (role !== "supervisor") {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle>Isi absen bulan ini</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
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
          </div>
          <p className="text-pretty text-sm text-muted-foreground">
            Pilih sel: 1 → 0,5 → 0 → kosong. Minggu dilewati. Zona waktu Asia/Jayapura.
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky start-0 min-w-28 bg-card">Nama</TableHead>
                  {days.map((d) => (
                    <TableHead key={d.date} className="min-w-11 text-center">
                      {d.day}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="sticky start-0 min-w-28 bg-card font-medium">
                      {employee.name}
                    </TableCell>
                    {days.map((d) => {
                      const value = byKey[`${employee.id}:${d.date}`]?.value;
                      return (
                        <TableCell key={d.date} className="p-1 text-center">
                          <Button
                            type="button"
                            variant={value == null ? "ghost" : "outline"}
                            className="min-h-11 min-w-11 w-full px-0 text-sm tabular-nums"
                            aria-label={`${employee.name}, ${d.date}, ${cellLabel(value) || "kosong"}`}
                            onClick={() => cycle(employee.id, d.date)}
                          >
                            {cellLabel(value) || "·"}
                          </Button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
