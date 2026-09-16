import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

import { StatTile } from "@/components/mobile-list";
import { sessionRole } from "@/lib/session-role";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});


const employeeMeSchema = z.object({ id: z.string() }).nullable();

const kasbonRowSchema = z.object({
  employeeId: z.string(),
  amountIdr: z.number(),
  status: z.string(),
  sisaIdr: z.number().optional(),
  sisa: z.number().optional(),
  paidIdr: z.number().optional(),
  payments: z.array(z.object({ amountIdr: z.number() })).optional(),
});

const jobRowSchema = z.object({
  employeeId: z.string(),
  status: z.string(),
});

const diagramSchema = z.object({
  pendapatan: z.number(),
  pengeluaran: z.number(),
  bengkel: z.number(),
});


function formatIdr(n: number) {
  return n.toLocaleString("id-ID");
}

function listPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object" && "items" in data && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

function parseList<T>(data: unknown, schema: z.ZodType<T>): T[] {
  const parsed: T[] = [];
  for (const row of listPayload(data)) {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}

function kasbonSisa(row: z.infer<typeof kasbonRowSchema>): number {
  if (row.status !== "disbursed" && row.status !== "lunas") {
    return 0;
  }
  if (typeof row.sisaIdr === "number") {
    return row.sisaIdr;
  }
  if (typeof row.sisa === "number") {
    return row.sisa;
  }
  const paid =
    typeof row.paidIdr === "number"
      ? row.paidIdr
      : (row.payments ?? []).reduce((sum, payment) => sum + payment.amountIdr, 0);
  return row.amountIdr - paid;
}

function currentJayapuraMonthRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jayapura",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const lastDay = new Date(year, month, 0).getDate();
  const monthText = String(month).padStart(2, "0");
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const role = sessionRole(session?.user);
  const isStaff = role === "kasir" || role === "supervisor";
  const month = currentJayapuraMonthRange();
  const trpc = useTRPC();

  const me = useQuery(trpc.employee.me.queryOptions());
  const kasbon = useQuery(trpc.kasbon.list.queryOptions());
  const jobs = useQuery(
    trpc.job.list.queryOptions({
      from: "2000-01-01",
      to: "2099-12-31",
    }),
  );
  const diagram = useQuery({
    ...trpc.laporan.diagram.queryOptions({
      from: month.from,
      to: month.to,
    }),
    enabled: isStaff,
  });

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
  const inProgressCount = ownJobs.filter(
    (row) => row.status === "proses" || row.status === "selesai",
  ).length;

  const pendingKasbonCount = kasbonRows.filter((row) => row.status === "pending").length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-4">
      <p className="text-pretty text-muted-foreground">Halo, {session?.user.name}</p>

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Sisa kasbon"
          value={<span className="tabular-nums">Rp {formatIdr(ownSisa)}</span>}
        />
        <StatTile label="Pekerjaan berjalan" value={inProgressCount} />
      </div>

      {isStaff ? (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Kasbon menunggu" value={pendingKasbonCount} />
          <StatTile
            label="Pendapatan"
            value={<span className="tabular-nums">Rp {formatIdr(diagramData.pendapatan)}</span>}
          />
          <StatTile
            label="Pengeluaran"
            value={<span className="tabular-nums">Rp {formatIdr(diagramData.pengeluaran)}</span>}
          />
          <StatTile
            label="Bengkel"
            value={<span className="tabular-nums">Rp {formatIdr(diagramData.bengkel)}</span>}
          />
        </div>
      ) : null}
    </div>
  );
}
