import { buttonVariants } from "@BMJ-KARYAWAN/ui/components/button";
import { cn } from "@BMJ-KARYAWAN/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AbsenClockButton } from "@/components/absen-clock-button";
import { ActionQueue } from "@/components/action-queue";
import Loader from "@/components/loader";
import { PaySlip } from "@/components/pay-slip";
import { PageShell } from "@/components/page-shell";
import { PageError } from "@/components/state-panel";
import { absenCaption, absenLabel, absenToneClass, displayedAbsenValue } from "@/lib/absen";
import { formatClock, formatRp, jayapuraYearMonth, monthLabel, todayParts, todayYmd, weekDays } from "@/lib/format";
import { authClient } from "@/lib/auth-client";
import { coalesceAuthSession, sessionRole } from "@/lib/session-role";
import { captureClockProof } from "@/lib/workshop-gps";
import { useTRPC } from "@/utils/trpc";
import type { RouterOutputs } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function kasbonSisa(row: RouterOutputs["kasbon"]["list"][number]): number {
  if (row.status !== "disbursed" && row.status !== "lunas") return 0;
  return row.sisaIdr;
}

function RouteComponent() {
  const { session: routeSession } = Route.useRouteContext();
  const { data: liveSession } = authClient.useSession();
  const session = coalesceAuthSession(liveSession, routeSession);
  const role = sessionRole(session?.user);
  const isStaff = role === "kasir" || role === "supervisor";
  const today = todayParts();
  const { year, month: monthNum } = jayapuraYearMonth();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [clockBusy, setClockBusy] = useState(false);
  const workDate = todayYmd();
  const days = weekDays(workDate, 14);
  const calRef = useRef<HTMLDivElement>(null);

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
  const prosesJobs = useQuery({
    ...trpc.job.list.queryOptions({ status: "proses" }),
    enabled: role === "supervisor",
    refetchInterval: 8_000,
  });
  const selesaiJobs = useQuery({
    ...trpc.job.list.queryOptions({ status: "selesai" }),
    enabled: role === "supervisor",
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
  const payroll = useQuery({
    ...trpc.payroll.get.queryOptions({ year, month: monthNum }),
    enabled: role === "mekanik" || role === "kasir",
  });
  const payrollData: RouterOutputs["payroll"]["get"] | undefined = payroll.data;
  const slipLine = payrollData?.lines?.[0];
  const slipPayDate = payrollData?.period?.payDate;



  const failed =
    me.isError ||
    kasbon.isError ||
    prosesJobs.isError ||
    selesaiJobs.isError ||
    absenMonth.isError ||
    (isStaff && monthPendapatan.isError);

  const employee: RouterOutputs["employee"]["me"] | undefined = me.data;
  const employeeId = employee?.id;
  const kasbonRows: RouterOutputs["kasbon"]["list"] = kasbon.data ?? [];
  const jobRows: RouterOutputs["job"]["list"] = [
    ...(prosesJobs.data ?? []),
    ...(selesaiJobs.data ?? []),
  ];
  const pendapatan =
    (monthPendapatan.data as RouterOutputs["job"]["monthPendapatan"] | undefined)?.pendapatan ?? 0;


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
          ...pendingKasbon.slice(0, 8).map((row, index) => ({
            id: row.id ?? `pending-${index}`,
            title: row.employeeName?.trim() || "—",
            subtitle: row.keperluan,
            trailing: formatRp(row.amountIdr),
            to: "/kasbon" as const,
          })),
          ...liveJobs.slice(0, 8).map((row, index) => ({
            id: row.id ?? `job-${index}`,
            title: row.description ?? "Pekerjaan",
            subtitle: `${row.employeeName?.trim() || "—"} · ${row.status === "selesai" ? "Menunggu diterima" : "Proses"}`,
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
  const checkInClock = formatClock(mineToday.data?.checkInAt);
  const checkOutClock = formatClock(mineToday.data?.checkOutAt);
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

  useEffect(() => {
    const node = calRef.current?.querySelector("[data-cal-today]");
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
    }
  }, [workDate]);

  const errorBlock = failed ? (
    <PageError
      onRetry={() => {
        void me.refetch();
        void kasbon.refetch();
        void prosesJobs.refetch();
        void selesaiJobs.refetch();
        void absenMonth.refetch();
        if (isStaff) void monthPendapatan.refetch();
      }}
    />
  ) : null;

  if (role === "supervisor") {
    return (
      <PageShell>
        <section className="rounded-xl bg-card px-5 py-6 shadow-[var(--shadow-border)] sm:px-8">
          <div className="max-lg:pe-14">
            <p className="font-display text-5xl leading-none tabular-nums">
              {String(today.day).padStart(2, "0")}
            </p>
            <p className="mt-3 text-2xl font-semibold capitalize">{today.weekday}</p>
            <p className="mt-1 text-lg text-muted-foreground">{today.monthYear}</p>
          </div>
          <p className="mt-6 text-sm text-pretty">
            {!absenMonth.isError && todayRoster.length === 0
              ? "Tidak ada karyawan aktif."
              : sundayToday
                ? "Hari Minggu. Absen tidak diisi."
                : `${nHadir} hadir · ${nLate} telat 9> · ${nHalf} setengah · ${nAlpa} alpa`}
          </p>
        </section>

        {errorBlock}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Siapa yang sudah absen</h2>
          {!absenMonth.isError && todayRoster.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada karyawan aktif.</p>
          ) : (
            <ul className="grid gap-2">
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
                      {absenCaption(emp.shown)}
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

        <div className="flex flex-col gap-2">
          {shortcuts.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                buttonVariants({ variant: item.to === "/absen" ? "default" : "outline" }),
                "h-14 min-h-14 w-full",
                item.to !== "/absen" && "bg-card",
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
    <PageShell>
      <section className="flex w-full min-w-0 flex-col rounded-xl bg-card px-5 py-5 shadow-[var(--shadow-border)] sm:px-8 sm:py-6">
        <div className="flex min-h-[7.25rem] w-full min-w-0 items-center">
          <div
            ref={calRef}
            className="-mx-5 w-[calc(100%+2.5rem)] overflow-x-auto overscroll-x-contain snap-x snap-mandatory sm:-mx-8 sm:w-[calc(100%+4rem)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <ol
              className="flex w-max items-center gap-1 px-[max(1.25rem,calc(50%-2rem))]"
              aria-label="Kalender absen"
            >
            {days.map((day) => {
              const shown = displayedAbsenValue(
                ownAbsenByDate[day.ymd],
                day.ymd,
                workDate,
                day.isSunday,
              );
              const dist = Math.min(Math.abs(day.fromToday), 4);
              return (
                <li
                  key={day.ymd}
                  data-cal-today={day.isToday ? "" : undefined}
                  className={cn(
                    "snap-center shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:active:scale-95",
                    dist === 0 && "w-16",
                    dist === 1 && "w-12",
                    dist === 2 && "w-10",
                    dist >= 3 && "w-8",
                  )}
                >
                  <div
                    className={cn(
                      "flex w-full flex-col items-center justify-between rounded-md px-0.5 py-1.5",
                      dist === 0 ? "aspect-[3/4] py-2" : "aspect-[4/5]",
                      absenToneClass(shown),
                      day.isToday ? "ring-2 ring-foreground" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 font-semibold uppercase leading-none",
                        dist === 0 && "text-[0.65rem]",
                        dist === 1 && "text-[0.5rem]",
                        dist >= 2 && "text-[0.4rem]",
                      )}
                    >
                      {day.label}
                    </span>
                    <span
                      className={cn(
                        "font-display leading-none",
                        dist === 0 && "text-3xl",
                        dist === 1 && "text-xl",
                        dist === 2 && "text-sm",
                        dist >= 3 && "text-xs",
                      )}
                    >
                      {day.day}
                    </span>
                    <span className="shrink-0 text-[0.6rem] tabular-nums leading-none">
                      {shown !== undefined && dist <= 1 ? absenLabel(shown) : "\u00a0"}
                    </span>
                  </div>
                </li>
              );
            })}
            </ol>
          </div>
        </div>

        <div className="pt-5">
          {checkInClock ? (
            <p className="mb-4 text-sm tabular-nums text-muted-foreground">
              Masuk {checkInClock}
              {checkOutClock ? ` · Pulang ${checkOutClock}` : " · Belum pulang"}
            </p>
          ) : null}
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

      {slipLine ? (
        <PaySlip
          line={slipLine}
          periodLabel={monthLabel(year, monthNum)}
          payDate={slipPayDate}
          alpaDays={slipLine.alpaDays}
          showName={false}
        />
      ) : payroll.isPending ? (
        <Loader />
      ) : null}

      <p className="px-1">
        <span className="block text-sm text-muted-foreground">{moneyLabel}</span>
        <span className="font-display text-4xl leading-none tracking-tight tabular-nums">{moneyValue}</span>
      </p>

      {errorBlock}
    </PageShell>
  );
}
