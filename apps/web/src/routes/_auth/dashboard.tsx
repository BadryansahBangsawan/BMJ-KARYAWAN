import { buttonVariants } from "@BMJ-KARYAWAN/ui/components/button";
import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AbsenClockButton } from "@/components/absen-clock-button";
import { ActionQueue } from "@/components/action-queue";
import Loader from "@/components/loader";
import { PageShell } from "@/components/page-shell";
import { PageError } from "@/components/state-panel";
import { absenCaption, absenLabel, absenToneClass, displayedAbsenValue } from "@/lib/absen";
import { formatRp, jayapuraYearMonth, monthBounds, todayParts, todayYmd, weekDays } from "@/lib/format";
import { authClient } from "@/lib/auth-client";
import { coalesceAuthSession, sessionRole } from "@/lib/session-role";
import { captureClockProof } from "@/lib/workshop-gps";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

const employeeMeSchema = z.object({ id: z.string() }).nullable();

const kasbonRowSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string(),
  employeeName: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  keperluan: z.string().optional(),
  amountIdr: z.number(),
  status: z.string(),
  sisaIdr: z.number().optional(),
  sisa: z.number().optional(),
  paidIdr: z.number().optional(),
  payments: z.array(z.object({ amountIdr: z.number() })).optional(),
});

const jobRowSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string(),
  employeeName: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  description: z.string().optional(),
  status: z.string(),
});

const pendapatanSchema = z.object({
  pendapatan: z.number(),
});

function listPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "items" in data && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

function parseList<T>(data: unknown, schema: z.ZodType<T>): T[] {
  const parsed: T[] = [];
  for (const row of listPayload(data)) {
    const result = schema.safeParse(row);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function kasbonSisa(row: z.infer<typeof kasbonRowSchema>): number {
  if (row.status !== "disbursed" && row.status !== "lunas") return 0;
  if (typeof row.sisaIdr === "number") return row.sisaIdr;
  if (typeof row.sisa === "number") return row.sisa;
  const paid =
    typeof row.paidIdr === "number"
      ? row.paidIdr
      : (row.payments ?? []).reduce((sum, payment) => sum + payment.amountIdr, 0);
  return row.amountIdr - paid;
}

function RouteComponent() {
  const { session: routeSession } = Route.useRouteContext();
  const { data: liveSession } = authClient.useSession();
  const session = coalesceAuthSession(liveSession, routeSession);
  const role = sessionRole(session?.user);
  const isStaff = role === "kasir" || role === "supervisor";
  const today = todayParts();
  const days = weekDays();
  const month = monthBounds();
  const { year, month: monthNum } = jayapuraYearMonth();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [clockBusy, setClockBusy] = useState(false);
  const workDate = todayYmd();

  const mineToday = useQuery({
    ...trpc.attendance.mineToday.queryOptions(),
    refetchInterval: 8_000,
  });
  const checkInMut = useMutation(trpc.attendance.selfCheckin.mutationOptions());
  const checkOutMut = useMutation(trpc.attendance.selfCheckout.mutationOptions());
  const me = useQuery(trpc.employee.me.queryOptions());
  const kasbon = useQuery({
    ...trpc.kasbon.list.queryOptions(),
    refetchInterval: 8_000,
  });
  const jobs = useQuery({
    ...trpc.job.list.queryOptions(month),
    refetchInterval: 8_000,
  });
  const monthPendapatan = useQuery({
    ...trpc.job.monthPendapatan.queryOptions({ year, month: monthNum }),
    enabled: isStaff,
  });
  const absenMonth = useQuery({
    ...trpc.attendance.month.queryOptions({ year, month: monthNum }),
    refetchInterval: 8_000,
  });



  const failed = me.isError || kasbon.isError || jobs.isError || (isStaff && monthPendapatan.isError);

  const employee = employeeMeSchema.safeParse(me.data);
  const employeeId = employee.success ? employee.data?.id : undefined;
  const kasbonRows = parseList(kasbon.data, kasbonRowSchema);
  const jobRows = parseList(jobs.data, jobRowSchema);
  const pendapatanParsed = pendapatanSchema.safeParse(monthPendapatan.data);
  const pendapatan = pendapatanParsed.success ? pendapatanParsed.data.pendapatan : 0;


  const ownKasbon = employeeId
    ? kasbonRows.filter((row) => row.employeeId === employeeId)
    : role === "mekanik"
      ? kasbonRows
      : [];
  const ownSisa = ownKasbon.reduce((sum, row) => sum + kasbonSisa(row), 0);


  const pendingKasbon = kasbonRows.filter((row) => row.status === "pending");
  const liveJobs = jobRows.filter((row) => row.status === "proses" || row.status === "selesai");

  const queueItems =
    role === "supervisor"
      ? [
          ...pendingKasbon.slice(0, 4).map((row, index) => ({
            id: row.id ?? `pending-${index}`,
            title: row.employeeName ?? row.name ?? "Kasbon menunggu",
            subtitle: row.keperluan,
            trailing: formatRp(row.amountIdr),
            to: "/kasbon" as const,
          })),
          ...liveJobs.slice(0, 4).map((row, index) => ({
            id: row.id ?? `job-${index}`,
            title: row.description ?? "Pekerjaan",
            subtitle: `${row.employeeName ?? row.name ?? "Mekanik"} · ${row.status === "selesai" ? "Menunggu diterima" : "Proses"}`,
            to: "/pekerjaan" as const,
          })),
        ]
      : [];

  const shortcuts =
    role === "supervisor"
      ? [
          { to: "/absen" as const, label: "Buka absen" },
          { to: "/kasbon" as const, label: "Tinjau kasbon" },
          { to: "/pekerjaan" as const, label: "Tinjau pekerjaan" },
          { to: "/gaji" as const, label: "Buka gaji" },
        ]
      : [];


  const moneyLabel = role === "mekanik" ? "Sisa kasbon" : "Pendapatan bulan ini";
  const moneyValue = role === "mekanik" ? formatRp(ownSisa) : formatRp(pendapatan);
  const checkedIn = Boolean(mineToday.data?.checkInAt);
  const checkedOut = Boolean(mineToday.data?.checkOutAt);
  const absenEmployees = (
    absenMonth.data as { employees?: Array<{ id: string; name: string }> } | undefined
  )?.employees ?? [];
  const absenMarks = (
    absenMonth.data as { marks?: Array<{ employeeId: string; workDate: string; value: number }> } | undefined
  )?.marks ?? [];
  const ownAbsenByDate: Record<string, number> = {};
  for (const mark of absenMarks) {
    if (employeeId && mark.employeeId === employeeId) ownAbsenByDate[mark.workDate] = mark.value;
  }
  const sundayToday = days.some((day) => day.isToday && day.isSunday);
  const todayRoster = absenEmployees
    .map((emp) => {
      const mark = absenMarks.find((row) => row.employeeId === emp.id && row.workDate === workDate);
      const shown = displayedAbsenValue(mark?.value, workDate, workDate, sundayToday);
      return { id: emp.id, name: emp.name, shown };
    })
    .sort((a, b) => {
      const rank = (value: number | undefined) => {
        if (value === 0) return 0;
        if (value === 90) return 1;
        if (value === 50) return 2;
        if (value === 100) return 3;
        return 4;
      };
      return rank(a.shown) - rank(b.shown) || a.name.localeCompare(b.name, "id");
    });
  const nHadir = todayRoster.filter((row) => row.shown === 100).length;
  const nLate = todayRoster.filter((row) => row.shown === 90).length;
  const nHalf = todayRoster.filter((row) => row.shown === 50).length;
  const nAlpa = todayRoster.filter((row) => row.shown === 0).length;


  async function clockFromFile(file: File) {
    setClockBusy(true);
    try {
      const proof = await captureClockProof(file);
      if (!checkedIn) {
        await checkInMut.mutateAsync({ ...proof, workDate });
        toast.success("Absen masuk tercatat");
      } else {
        await checkOutMut.mutateAsync({ ...proof, workDate });
        toast.success("Absen pulang tercatat");
      }
      void queryClient.invalidateQueries({ queryKey: trpc.attendance.mineToday.queryKey() });
      void queryClient.invalidateQueries({
        queryKey: trpc.attendance.month.queryKey({ year, month: monthNum }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Absen gagal");
    } finally {
      setClockBusy(false);
    }
  }

  const errorBlock = failed ? (
    <PageError
      onRetry={() => {
        void me.refetch();
        void kasbon.refetch();
        void jobs.refetch();
        void absenMonth.refetch();
        if (isStaff) void monthPendapatan.refetch();
      }}
    />
  ) : null;

  if (role === "supervisor") {
    return (
      <PageShell className="gap-6">
        <section className="rounded-xl bg-card px-5 py-5 shadow-[var(--shadow-border)] sm:px-6">
          <p className="text-sm text-muted-foreground">Pantau karyawan · {today.monthYear}</p>
          <p className="mt-1 text-2xl font-semibold capitalize leading-tight tracking-tight">{today.weekday}</p>
          <p className="mt-1 font-display text-5xl leading-none tabular-nums">{String(today.day).padStart(2, "0")}</p>
          <p className="mt-4 text-sm text-pretty">
            {todayRoster.length === 0
              ? "Tidak ada karyawan aktif."
              : sundayToday
                ? "Hari Minggu. Absen tidak diisi."
                : `${nHadir} hadir · ${nLate} telat 9> · ${nHalf} setengah · ${nAlpa} belum absen`}
          </p>
        </section>

        {errorBlock}

        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Siapa yang sudah absen</h2>
            <Link
              to="/absen"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 bg-card")}
            >
              Grid absen
            </Link>
          </div>
          {todayRoster.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada karyawan aktif.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {todayRoster.map((emp) => (
                <li key={emp.id}>
                  <Link
                    to="/absen"
                    className={cn(
                      "flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 py-2 shadow-[var(--shadow-border)] motion-safe:active:scale-[0.98]",
                      absenToneClass(emp.shown),
                    )}
                  >
                    <span className="truncate font-medium">{emp.name}</span>
                    <span className="shrink-0 text-end text-sm tabular-nums">
                      {emp.shown === undefined ? "·" : `${absenLabel(emp.shown)} · ${absenCaption(emp.shown)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="px-1">
          <span className="block text-sm text-muted-foreground">Pendapatan bulan ini</span>
          <span className="font-display text-4xl leading-none tracking-tight tabular-nums">{moneyValue}</span>
        </p>

        <ActionQueue
          title="Perlu ditindak"
          items={queueItems}
          emptyTitle="Tidak ada antrean"
          emptyDescription="Kasbon dan pekerjaan menunggu sudah bersih."
        />

        <div className="grid gap-2 sm:grid-cols-2">
          {shortcuts.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                buttonVariants({ variant: item.to === "/absen" ? "default" : "outline" }),
                item.to === "/absen" ? "h-14 min-h-14" : "h-14 min-h-14 bg-card",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="gap-6">
      <section className="rounded-xl bg-card px-5 py-6 shadow-[var(--shadow-border)] sm:px-8 sm:py-8">
        <p className="today-settle font-display text-[clamp(4.5rem,22vw,6rem)] leading-none text-foreground">
          {String(today.day).padStart(2, "0")}
        </p>
        <p className="mt-3 text-2xl font-semibold capitalize leading-tight tracking-tight">{today.weekday}</p>
        <p className="mt-1 text-lg text-muted-foreground">{today.monthYear}</p>

        <ol className="mt-6 grid grid-cols-7 gap-1.5" aria-label="Minggu ini">
          {days.map((day) => {
            const shown = displayedAbsenValue(
              ownAbsenByDate[day.ymd],
              day.ymd,
              workDate,
              day.isSunday,
            );
            return (
              <li key={day.ymd}>
                <div
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md",
                    absenToneClass(shown),
                    day.isToday ? "ring-2 ring-foreground" : "",
                  )}
                >
                  <span className="text-[0.65rem] font-semibold uppercase">{day.label}</span>
                  <span className="font-display text-xl leading-none">{day.day}</span>
                  {shown !== undefined ? (
                    <span className="text-[0.65rem] tabular-nums leading-none">{absenLabel(shown)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6">
          <AbsenClockButton
            checkedIn={checkedIn}
            checkedOut={checkedOut}
            busy={clockBusy}
            onFile={(file) => void clockFromFile(file)}
          />
          {mineToday.data?.value != null ? (
            <p className="mt-2 text-sm text-muted-foreground">{absenCaption(mineToday.data.value)}</p>
          ) : null}
        </div>
      </section>

      {errorBlock}

      {!me.data && !kasbon.data && (me.isPending || kasbon.isPending) ? (
        <Loader />
      ) : (
        <>
          <p className="px-1">
            <span className="block text-sm text-muted-foreground">{moneyLabel}</span>
            <span className="font-display text-4xl leading-none tracking-tight tabular-nums">{moneyValue}</span>
          </p>
        </>
      )}
    </PageShell>
  );
}
