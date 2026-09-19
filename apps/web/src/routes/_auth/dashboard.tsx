import { Button } from "@BMJ-KARYAWAN/ui/components/button";
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
import { absenLabel, absenToneClass, displayedAbsenValue } from "@/lib/absen";
import { formatRp, jayapuraYearMonth, monthBounds, todayParts, todayYmd, weekDays } from "@/lib/format";
import { authClient } from "@/lib/auth-client";
import { sessionRole } from "@/lib/session-role";
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

const diagramSchema = z.object({
  pendapatan: z.number(),
  pengeluaran: z.number(),
  bengkel: z.number(),
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
  const session = liveSession ?? routeSession;
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
    ...trpc.job.list.queryOptions({
      from: "2000-01-01",
      to: "2099-12-31",
    }),
    refetchInterval: 8_000,
  });
  const diagram = useQuery({
    ...trpc.laporan.diagram.queryOptions({
      from: month.from,
      to: month.to,
    }),
    enabled: isStaff,
  });
  const absenMonth = useQuery({
    ...trpc.attendance.month.queryOptions({ year, month: monthNum }),
    refetchInterval: 8_000,
  });



  const failed = me.isError || kasbon.isError || jobs.isError || (isStaff && diagram.isError);

  const employee = employeeMeSchema.safeParse(me.data);
  const employeeId = employee.success ? employee.data?.id : undefined;
  const kasbonRows = parseList(kasbon.data, kasbonRowSchema);
  const jobRows = parseList(jobs.data, jobRowSchema);
  const diagramParsed = diagramSchema.safeParse(diagram.data);
  const diagramData = diagramParsed.success
    ? diagramParsed.data
    : { pendapatan: 0, pengeluaran: 0, bengkel: 0 };


  const ownKasbon = employeeId
    ? kasbonRows.filter((row) => row.employeeId === employeeId)
    : role === "mekanik"
      ? kasbonRows
      : [];
  const ownSisa = ownKasbon.reduce((sum, row) => sum + kasbonSisa(row), 0);

  const ownJobs = employeeId
    ? jobRows.filter((row) => row.employeeId === employeeId)
    : role === "mekanik"
      ? jobRows
      : [];
  const waitingConfirm = ownJobs.filter((row) => row.status === "selesai");

  const pendingKasbon = kasbonRows.filter((row) => row.status === "pending");
  const approvedKasbon = kasbonRows.filter((row) => row.status === "approved");
  const liveJobs = jobRows.filter((row) => row.status === "proses" || row.status === "selesai");
  const selesaiJobs = jobRows.filter((row) => row.status === "selesai");

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
      : role === "kasir"
        ? [
            ...approvedKasbon.slice(0, 4).map((row, index) => ({
              id: row.id ?? `approved-${index}`,
              title: row.employeeName ?? row.name ?? "Siap dicairkan",
              subtitle: row.keperluan,
              trailing: formatRp(row.amountIdr),
              to: "/kasbon" as const,
            })),
            ...selesaiJobs.slice(0, 2).map((row, index) => ({
              id: row.id ?? `job-${index}`,
              title: row.description ?? "Pekerjaan selesai",
              subtitle: row.employeeName ?? row.name ?? "Menunggu diterima",
              to: "/pekerjaan" as const,
            })),
          ]
        : waitingConfirm.slice(0, 6).map((row, index) => ({
            id: row.id ?? `wait-${index}`,
            title: row.description ?? "Menunggu konfirmasi",
            subtitle: "Status selesai, menunggu kasir atau supervisor",
            to: "/pekerjaan" as const,
          }));

  const shortcuts =
    role === "supervisor"
      ? [
          { to: "/kasbon" as const, label: "Tinjau kasbon" },
          { to: "/gaji" as const, label: "Buka gaji" },
        ]
      : role === "kasir"
        ? [
            { to: "/kasbon" as const, label: "Cairkan kasbon" },
            { to: "/toko" as const, label: "Catat transaksi" },
            { to: "/pekerjaan" as const, label: "Tinjau pekerjaan" },
          ]
        : [
            { to: "/pekerjaan" as const, label: "Catat pekerjaan" },
            { to: "/kasbon" as const, label: "Ajukan kasbon" },
            { to: "/gaji" as const, label: "Lihat gaji" },
          ];


  const moneyLabel = role === "mekanik" ? "Sisa kasbon" : "Pendapatan bulan ini";
  const moneyValue = role === "mekanik" ? formatRp(ownSisa) : formatRp(diagramData.pendapatan);
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
      await queryClient.invalidateQueries({ queryKey: trpc.attendance.mineToday.queryKey() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Absen gagal");
    } finally {
      setClockBusy(false);
    }
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
        </div>
      </section>

      {role === "supervisor" ? (
        <section className="rounded-xl bg-card px-4 py-4 shadow-[var(--shadow-border)]">
          <h2 className="text-lg font-semibold tracking-tight">Absen hari ini</h2>
          {absenEmployees.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Tidak ada karyawan aktif.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {absenEmployees.map((emp) => {
                const mark = absenMarks.find(
                  (row) => row.employeeId === emp.id && row.workDate === workDate,
                );
                const shown = displayedAbsenValue(mark?.value, workDate, workDate);
                return (
                  <li
                    key={emp.id}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2",
                      absenToneClass(shown),
                    )}
                  >
                    <span className="truncate font-medium">{emp.name}</span>
                    <span className="shrink-0 tabular-nums">{absenLabel(shown)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {failed ? (
        <PageError
          onRetry={() => {
            void me.refetch();
            void kasbon.refetch();
            void jobs.refetch();
            if (isStaff) void diagram.refetch();
          }}
        />
      ) : !me.data && !kasbon.data && !jobs.data && (me.isPending || kasbon.isPending || jobs.isPending) ? (
        <Loader />
      ) : (
        <>
          <p className="px-1">
            <span className="block text-sm text-muted-foreground">{moneyLabel}</span>
            <span className="font-display text-4xl leading-none tracking-tight tabular-nums">{moneyValue}</span>
          </p>

          <ActionQueue
            title="Centang hari ini"
            items={queueItems}
            emptyTitle="Tidak ada yang perlu dicentang"
            emptyDescription="Semua pekerjaan untuk peran ini sudah selesai."
          />

          {shortcuts.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {shortcuts.map((item) => (
                <Button
                  key={item.label}
                  variant="outline"
                  className="h-14 min-h-14 bg-card"
                  render={<Link to={item.to} />}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
