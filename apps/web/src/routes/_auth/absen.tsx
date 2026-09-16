import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@BMJ-KARYAWAN/ui/components/dialog";
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
import { useMemo, useRef, useState } from "react";
import { Check, Loader2, MapPin, Minus, X } from "lucide-react";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { jayapuraYearMonth, monthLabel, todayYmd, formatLongDate } from "@/lib/format";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";
import Loader from "@/components/loader";
import { MobileList, MobileListRow } from "@/components/mobile-list";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PeriodFields } from "@/components/period-fields";
import { PageError, StatePanel } from "@/components/state-panel";

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

function nextValue(value: number | undefined): 0 | 50 | 100 | null {
  if (value === 100) return 50;
  if (value === 50) return 0;
  if (value === 0) return null;
  return 100;
}

function markKey(employeeId: string, workDate: string) {
  return `${employeeId}:${workDate}`;
}

function AttendanceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="inline-flex items-center gap-1">
        <Check className="size-3.5 text-success" aria-hidden="true" />
        <span>1 hadir</span>
      </li>
      <li className="inline-flex items-center gap-1">
        <Minus className="size-3.5" aria-hidden="true" />
        <span>0,5 setengah</span>
      </li>
      <li className="inline-flex items-center gap-1">
        <X className="size-3.5 text-destructive" aria-hidden="true" />
        <span>0 alpa</span>
      </li>
      <li className="inline-flex items-center gap-1">
        <span className="inline-flex size-3.5 items-center justify-center" aria-hidden="true">
          ·
        </span>
        <span>kosong</span>
      </li>
    </ul>
  );
}

function AttendanceMark({ value }: { value: number | undefined }) {
  if (value === 100) {
    return (
      <>
        <Check className="size-3.5 text-success" aria-hidden="true" />
        <span className="tabular-nums">{cellLabel(value)}</span>
      </>
    );
  }
  if (value === 50) {
    return (
      <>
        <Minus className="size-3.5" aria-hidden="true" />
        <span className="tabular-nums">{cellLabel(value)}</span>
      </>
    );
  }
  if (value === 0) {
    return (
      <>
        <X className="size-3.5 text-destructive" aria-hidden="true" />
        <span className="tabular-nums">{cellLabel(value)}</span>
      </>
    );
  }
  return <span className="tabular-nums text-muted-foreground">·</span>;
}

function AttendanceCell({
  employeeName,
  employeeId,
  date,
  day,
  value,
  busy,
  large = false,
  onCycle,
}: {
  employeeName: string;
  employeeId: string;
  date: string;
  day: number;
  value: number | undefined;
  busy: boolean;
  large?: boolean;
  onCycle: (employeeId: string, workDate: string) => void;
}) {
  const label = cellLabel(value);
  return (
    <Button
      type="button"
      variant={value == null ? "ghost" : "outline"}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${employeeName}, ${date}, ${label || "kosong"}`}
      onClick={() => onCycle(employeeId, date)}
      className={
        large
          ? "h-auto min-h-14 w-full flex-col gap-0.5 px-1 py-2 whitespace-normal"
          : "h-11 min-h-11 min-w-11 w-full px-0 text-sm tabular-nums md:h-11 md:min-h-11 md:min-w-11"
      }
    >
      {busy ? (
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
      ) : large ? (
        <>
          <span className="text-xs tabular-nums text-muted-foreground">{day}</span>
          <span className="inline-flex items-center gap-1 text-sm">
            <AttendanceMark value={value} />
          </span>
        </>
      ) : (
        <AttendanceMark value={value} />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Route — open to all authenticated roles
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/_auth/absen")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: AbsenPage,
});

// ---------------------------------------------------------------------------
// Self-checkin panel (mekanik / kasir)
// ---------------------------------------------------------------------------
type GpsState = "idle" | "locating" | "submitting" | "done" | "error";

function SelfCheckinPanel() {
  const trpc = useTRPC();
  const today = useMemo(() => todayYmd(), []);
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Query current month to show today's mark if it exists
  const { year, month } = useMemo(() => jayapuraYearMonth(today), [today]);
  const monthQuery = useQuery(trpc.attendance.month.queryOptions({ year, month }));

  const monthData = monthQuery.data as
    | { marks?: AttendanceRow[]; employees?: EmployeeRow[] }
    | undefined;

  // Find today's mark for the current user's employee row
  const todayMark = useMemo(() => {
    const marks = monthData?.marks ?? [];
    return marks.find((m) => m.workDate === today);
  }, [monthData, today]);

  const checkinMut = useMutation(
    trpc.attendance.selfCheckin.mutationOptions({
      onSuccess: async () => {
        setGpsState("done");
        toast.success("Absen berhasil dicatat!");
        await monthQuery.refetch();
      },
      onError: (error) => {
        setGpsState("error");
        setErrorMsg(error.message);
        toast.error(error.message);
      },
    }),
  );

  function handleCheckin() {
    if (!navigator.geolocation) {
      setGpsState("error");
      setErrorMsg("GPS tidak tersedia di perangkat ini.");
      toast.error("GPS tidak tersedia di perangkat ini.");
      return;
    }

    setGpsState("locating");
    setErrorMsg("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsState("submitting");
        checkinMut.mutate({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          workDate: today,
        });
      },
      (err) => {
        setGpsState("error");
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Izin GPS ditolak. Aktifkan lokasi di pengaturan browser."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Posisi GPS tidak dapat ditentukan. Coba di luar ruangan."
              : "Permintaan GPS habis waktu. Coba lagi.";
        setErrorMsg(msg);
        toast.error(msg);
      },
      { timeout: 15_000, maximumAge: 0 },
    );
  }

  const alreadyCheckedIn = todayMark?.value === 100;
  const busy = gpsState === "locating" || gpsState === "submitting";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-border)]">
        <p className="mb-1 text-sm text-muted-foreground">Hari ini</p>
        <p className="mb-4 text-base font-semibold">{formatLongDate(today)}</p>

        {alreadyCheckedIn ? (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
            <Check className="size-4 shrink-0" aria-hidden="true" />
            <span>Kamu sudah absen hari ini. Terima kasih!</span>
          </div>
        ) : (
          <>
            <Button
              type="button"
              onClick={handleCheckin}
              disabled={busy}
              className="w-full gap-2"
            >
              {busy ? (
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <MapPin className="size-4" aria-hidden="true" />
              )}
              {gpsState === "locating"
                ? "Menentukan lokasi…"
                : gpsState === "submitting"
                  ? "Menyimpan absen…"
                  : "Absen sekarang"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Kamu harus berada di area bengkel untuk bisa absen.
            </p>
          </>
        )}

        {gpsState === "error" && errorMsg ? (
          <p className="mt-3 text-sm text-destructive">{errorMsg}</p>
        ) : null}
      </div>

      {/* History for this month */}
      {monthQuery.isPending ? (
        <Loader />
      ) : monthQuery.isError ? (
        <PageError onRetry={() => void monthQuery.refetch()} />
      ) : (monthData?.marks ?? []).length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-border)]">
          <div className="px-4 py-3 text-sm font-medium">
            Riwayat {monthLabel(year, month)}
          </div>
          <div className="divide-y divide-border">
            {[...(monthData?.marks ?? [])]
              .sort((a, b) => b.workDate.localeCompare(a.workDate))
              .map((m) => (
                <div key={m.workDate} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="tabular-nums text-sm text-muted-foreground w-24 shrink-0">
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
          description="Tap "Absen sekarang" saat kamu tiba di bengkel."
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

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

  const selectedEmployee = employees.find((row) => row.id === selectedEmployeeId) ?? null;

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

  function cycle(employeeId: string, workDate: string) {
    if (pendingRef.current.has(markKey(employeeId, workDate))) return;
    const current = byKey[markKey(employeeId, workDate)]?.value;
    const next = nextValue(current);
    if (next === null) {
      clearMut.mutate({ employeeId, workDate });
      return;
    }
    setMut.mutate({ employeeId, workDate, value: next });
  }

  function filledCount(employeeId: string) {
    let count = 0;
    for (const d of days) {
      if (byKey[markKey(employeeId, d.date)]) count += 1;
    }
    return count;
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
          <AttendanceLegend />

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
            <>
              <div className="lg:hidden">
                <MobileList>
                  {employees.map((employee) => {
                    const filled = filledCount(employee.id);
                    return (
                      <MobileListRow
                        key={employee.id}
                        title={employee.name}
                        subtitle={`${filled} dari ${days.length} hari terisi`}
                        trailing={`${filled}/${days.length}`}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedEmployeeId(employee.id)}
                        >
                          Isi absen
                        </Button>
                      </MobileListRow>
                    );
                  })}
                </MobileList>
              </div>

              <div className="hidden rounded-xl bg-card shadow-[var(--shadow-border)] lg:block">
                <Table aria-label={`Absen ${monthLabel(year, month)}`}>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="sticky start-0 z-20 min-w-32 bg-card">Nama</TableHead>
                      {days.map((d) => (
                        <TableHead key={d.date} className="min-w-11 text-center tabular-nums">
                          {d.day}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="sticky start-0 z-10 min-w-32 bg-card font-medium">
                          {employee.name}
                        </TableCell>
                        {days.map((d) => {
                          const key = markKey(employee.id, d.date);
                          const value = byKey[key]?.value;
                          return (
                            <TableCell key={d.date} className="p-1 text-center">
                              <AttendanceCell
                                employeeName={employee.name}
                                employeeId={employee.id}
                                date={d.date}
                                day={d.day}
                                value={value}
                                busy={pendingKeys.has(key)}
                                onCycle={cycle}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <Dialog
            open={selectedEmployee !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedEmployeeId(null);
            }}
          >
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{selectedEmployee?.name}</DialogTitle>
                <DialogDescription>
                  Pilih hari kerja {monthLabel(year, month)}. 1 hadir, lalu 0,5 setengah, 0 alpa, lalu
                  kosong.
                </DialogDescription>
              </DialogHeader>
              <AttendanceLegend />
              {selectedEmployee ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {days.map((d) => {
                    const key = markKey(selectedEmployee.id, d.date);
                    return (
                      <AttendanceCell
                        key={d.date}
                        employeeName={selectedEmployee.name}
                        employeeId={selectedEmployee.id}
                        date={d.date}
                        day={d.day}
                        value={byKey[key]?.value}
                        busy={pendingKeys.has(key)}
                        large
                        onCycle={cycle}
                      />
                    );
                  })}
                </div>
              ) : null}
              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
        </>
      )}
    </PageShell>
  );
}
