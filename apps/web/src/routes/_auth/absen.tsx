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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AbsenClockButton } from "@/components/absen-clock-button";
import Loader from "@/components/loader";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PeriodFields } from "@/components/period-fields";
import { PageError, StatePanel } from "@/components/state-panel";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";
import { formatLongDate, jayapuraYearMonth, monthLabel, todayYmd } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { captureClockProof } from "@/lib/workshop-gps";
import { useTRPC } from "@/utils/trpc";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
type EmployeeRow = { id: string; name: string; role?: string };
type AttendanceRow = { id?: string; employeeId: string; workDate: string; value: number };
type DayCol = { day: number; date: string };

// ---------------------------------------------------------------------------
// Supervisor grid helpers (unchanged)
// ---------------------------------------------------------------------------
function dayNumber(date: string) {
  return Number(date.slice(8));
}

function cellLabel(value: number | undefined) {
  if (value === 100) return "1";
  if (value === 50) return "0,5";
  if (value === 0) return "0";
  return "";
}

function markKey(employeeId: string, workDate: string) {
  return `${employeeId}:${workDate}`;
}

function AttendanceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li>
        <span className="tabular-nums">1</span> hadir
      </li>
      <li>
        <span className="tabular-nums">0,5</span> setengah
      </li>
      <li>
        <span className="tabular-nums">0</span> alpa
      </li>
      <li>· kosong</li>
    </ul>
  );
}

function AttendanceMark({ value }: { value: number | undefined }) {
  if (value === 100) return <span className="tabular-nums">1</span>;
  if (value === 50) return <span className="tabular-nums">0,5</span>;
  if (value === 0) return <span className="tabular-nums">0</span>;
  return <span className="tabular-nums text-muted-foreground">·</span>;
}


function AttendanceCell({
  employeeName,
  employeeId,
  date,
  value,
  busy,
  onChange,
}: {
  employeeName: string;
  employeeId: string;
  date: string;
  value: number | undefined;
  busy: boolean;
  onChange: (employeeId: string, workDate: string, next: 0 | 50 | 100 | null) => void;
}) {
  const selectValue = value === 100 ? "100" : value === 50 ? "50" : value === 0 ? "0" : "none";
  return (
    <Select
      value={selectValue}
      disabled={busy}
      onValueChange={(next) => {
        if (next === "100") onChange(employeeId, date, 100);
        else if (next === "50") onChange(employeeId, date, 50);
        else if (next === "0") onChange(employeeId, date, 0);
        else onChange(employeeId, date, null);
      }}
    >
      <SelectTrigger
        className="h-11 min-h-11 w-14 min-w-14 justify-center px-1 text-sm tabular-nums [&_svg]:hidden"
        aria-label={`${employeeName}, ${date}, ${cellLabel(value) || "kosong"}`}
        aria-busy={busy}
      >
        {busy ? <Loader2 className="size-4 motion-safe:animate-spin" /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">·</SelectItem>
        <SelectItem value="100">1</SelectItem>
        <SelectItem value="50">0,5</SelectItem>
        <SelectItem value="0">0</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Route — open to all authenticated roles
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/_auth/absen")({
  component: AbsenPage,
});

// ---------------------------------------------------------------------------
// Self-checkin panel (mekanik / kasir)
// ---------------------------------------------------------------------------
function SelfCheckinPanel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayYmd(), []);
  const [clockBusy, setClockBusy] = useState(false);
  const { year, month } = useMemo(() => jayapuraYearMonth(today), [today]);
  const monthQuery = useQuery(trpc.attendance.month.queryOptions({ year, month }));
  const mineToday = useQuery(trpc.attendance.mineToday.queryOptions());
  const checkInMut = useMutation(trpc.attendance.selfCheckin.mutationOptions());
  const checkOutMut = useMutation(trpc.attendance.selfCheckout.mutationOptions());

  const monthData = monthQuery.data as
    | { marks?: AttendanceRow[]; employees?: EmployeeRow[] }
    | undefined;

  const checkedIn = Boolean(mineToday.data?.checkInAt);
  const checkedOut = Boolean(mineToday.data?.checkOutAt);

  async function clockFromFile(file: File) {
    setClockBusy(true);
    try {
      const proof = await captureClockProof(file);
      if (!checkedIn) {
        await checkInMut.mutateAsync({ ...proof, workDate: today });
        toast.success("Absen masuk tercatat");
      } else {
        await checkOutMut.mutateAsync({ ...proof, workDate: today });
        toast.success("Absen pulang tercatat");
      }
      await queryClient.invalidateQueries({ queryKey: trpc.attendance.mineToday.queryKey() });
      await monthQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Absen gagal");
    } finally {
      setClockBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-border)]">
        <p className="mb-1 text-sm text-muted-foreground">Hari ini</p>
        <p className="mb-4 text-base font-semibold">{formatLongDate(today)}</p>
        <AbsenClockButton
          checkedIn={checkedIn}
          checkedOut={checkedOut}
          busy={clockBusy}
          onFile={(file) => void clockFromFile(file)}
        />
      </div>

      {monthQuery.isPending ? (
        <Loader />
      ) : monthQuery.isError ? (
        <PageError onRetry={() => void monthQuery.refetch()} />
      ) : (monthData?.marks ?? []).length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-border)]">
          <div className="px-4 py-3 text-sm font-medium">Riwayat {monthLabel(year, month)}</div>
          <div className="divide-y divide-border">
            {[...(monthData?.marks ?? [])]
              .sort((a, b) => b.workDate.localeCompare(a.workDate))
              .map((m) => (
                <div key={m.workDate} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatLongDate(m.workDate).replace(/,.*/, "")} {m.workDate.slice(8)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm">
                    <AttendanceMark value={m.value} />
                    <span className="text-muted-foreground">
                      {m.value === 100 ? "Hadir" : m.value === 50 ? "Setengah" : "Alpa"}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <StatePanel
          title="Belum ada absen bulan ini"
          description='Tap "Absen masuk" saat kamu tiba di bengkel.'
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
function AbsenPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = sessionRole(session?.user);
  const isSupervisor = role === "supervisor";
  const now = useMemo(() => jayapuraYearMonth(), []);
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = useRef(new Set<string>());


  const monthQuery = useQuery({
    ...trpc.attendance.month.queryOptions({ year, month }),
    enabled: isSupervisor,
  });

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
    byKey[markKey(row.employeeId, row.workDate)] = row;
  }

  const days: DayCol[] = (monthData?.days ?? []).map((date) => ({
    day: dayNumber(date),
    date,
  }));

  const invalidateMonth = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.attendance.month.queryKey({ year, month }),
    });
  };

  const setCellPending = (employeeId: string, workDate: string, pending: boolean) => {
    const key = markKey(employeeId, workDate);
    if (pending) pendingRef.current.add(key);
    else pendingRef.current.delete(key);
    setPendingKeys(new Set(pendingRef.current));
  };

  const setMut = useMutation(
    trpc.attendance.set.mutationOptions({
      onMutate: (vars) => {
        setCellPending(vars.employeeId, vars.workDate, true);
      },
      onSuccess: async () => {
        await invalidateMonth();
      },
      onError: (error) => toast.error(error.message),
      onSettled: (_data, _error, vars) => {
        setCellPending(vars.employeeId, vars.workDate, false);
      },
    }),
  );
  const clearMut = useMutation(
    trpc.attendance.clear.mutationOptions({
      onMutate: (vars) => {
        setCellPending(vars.employeeId, vars.workDate, true);
      },
      onSuccess: async () => {
        await invalidateMonth();
      },
      onError: (error) => toast.error(error.message),
      onSettled: (_data, _error, vars) => {
        setCellPending(vars.employeeId, vars.workDate, false);
      },
    }),
  );

  function setMark(employeeId: string, workDate: string, next: 0 | 50 | 100 | null) {
    if (pendingRef.current.has(markKey(employeeId, workDate))) return;
    const current = byKey[markKey(employeeId, workDate)]?.value;
    if (next === null) {
      if (current === undefined) return;
      clearMut.mutate({ employeeId, workDate });
      return;
    }
    if (current === next) return;
    setMut.mutate({ employeeId, workDate, value: next });
  }


  return (
    <PageShell>
      <PageHeader title="Absen" description={PAGE_DESCRIPTION["/absen"]}>
        {isSupervisor ? (
          <div className="mt-3">
            <PeriodFields year={year} month={month} onYearChange={setYear} onMonthChange={setMonth} />
          </div>
        ) : null}
      </PageHeader>

      {/* Non-supervisor: self-checkin view */}
      {!isSupervisor ? (
        <SelfCheckinPanel />
      ) : (
        /* Supervisor: manual attendance grid */
        <>
          <div className="sr-only" aria-live="polite">
            {pendingKeys.size > 0 ? "Menyimpan absen" : ""}
          </div>

          {monthQuery.isError ? (
            <PageError onRetry={() => void monthQuery.refetch()} />
          ) : monthQuery.isPending ? (
            <Loader />
          ) : employees.length === 0 ? (
            <StatePanel
              title="Tidak ada karyawan aktif"
              description="Absen hanya menampilkan karyawan aktif selain supervisor."
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <AttendanceLegend />
              <p className="text-sm text-muted-foreground">
                Pilih 1 hadir, 0,5 setengah, atau 0 alpa. · = kosong. Geser tabel untuk hari lain.
              </p>
              <div className="overflow-x-auto rounded-xl bg-card shadow-[var(--shadow-border)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky start-0 z-20 min-w-28 bg-card">Nama</TableHead>
                      {days.map((d) => (
                        <TableHead key={d.date} className="min-w-16 text-center tabular-nums">
                          {d.day}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="sticky start-0 z-10 min-w-28 bg-card font-medium">
                          {employee.name}
                        </TableCell>
                        {days.map((d) => {
                          const key = markKey(employee.id, d.date);
                          return (
                            <TableCell key={d.date} className="p-1">
                              <AttendanceCell
                                employeeName={employee.name}
                                employeeId={employee.id}
                                date={d.date}
                                value={byKey[key]?.value}
                                busy={pendingKeys.has(key)}
                                onChange={setMark}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
