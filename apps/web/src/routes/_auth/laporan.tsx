import { Card, CardContent, CardHeader, CardTitle } from "@BMJ-KARYAWAN/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@BMJ-KARYAWAN/ui/components/empty";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@BMJ-KARYAWAN/ui/components/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@BMJ-KARYAWAN/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";
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

function monthBounds() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jayapura" });
  const [year, month] = ymd.split("-");
  const last = new Date(Number(year), Number(month), 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
  };
}

type LaporanRow = {
  name?: string;
  employeeName?: string;
  totalAmount?: number;
  diterimaAmount?: number;
  mechanicShare?: number;
  bengkelShare?: number;
  kasbonSisa?: number;
};

function asRows(data: unknown): LaporanRow[] {
  if (Array.isArray(data)) return data as LaporanRow[];
  if (data && typeof data === "object") {
    const o = data as { rows?: LaporanRow[]; items?: LaporanRow[] };
    return o.rows ?? o.items ?? [];
  }
  return [];
}

export const Route = createFileRoute("/_auth/laporan")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    if (userRole(session.user) === "mekanik") {
      throw redirect({ to: "/dashboard" });
    }
    return { session };
  },
  component: LaporanPage,
});

function LaporanTable({ rows }: { rows: LaporanRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Tidak ada laporan di rentang ini</EmptyTitle>
          <EmptyDescription>Ubah tanggal mulai atau tanggal selesai, lalu tampilkan lagi.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ResponsiveRecords
      cards={
        <MobileList>
          {rows.map((row, index) => (
            <MobileListRow
              key={`${row.name ?? row.employeeName ?? "row"}-${index}`}
              title={row.name ?? row.employeeName ?? "—"}
              subtitle={`Diterima ${formatIdr(row.diterimaAmount ?? 0)} · Mekanik ${formatIdr(row.mechanicShare ?? 0)} · Bengkel ${formatIdr(row.bengkelShare ?? 0)}`}
              trailing={<span className="tabular-nums">{formatIdr(row.totalAmount ?? 0)}</span>}
              meta={
                <span className="text-sm text-muted-foreground">
                  Sisa kasbon <span className="tabular-nums">{formatIdr(row.kasbonSisa ?? 0)}</span>
                </span>
              }
            />
          ))}
        </MobileList>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Diterima</TableHead>
              <TableHead>Bagian mekanik</TableHead>
              <TableHead>Bagian bengkel</TableHead>
              <TableHead>Sisa kasbon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.name ?? row.employeeName ?? "row"}-${index}`}>
                <TableCell>{row.name ?? row.employeeName ?? "—"}</TableCell>
                <TableCell>
                  <span className="tabular-nums">{formatIdr(row.totalAmount ?? 0)}</span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{formatIdr(row.diterimaAmount ?? 0)}</span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{formatIdr(row.mechanicShare ?? 0)}</span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{formatIdr(row.bengkelShare ?? 0)}</span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{formatIdr(row.kasbonSisa ?? 0)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}

function LaporanPage() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);
  const bounds = useMemo(() => monthBounds(), []);
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);

  const ongkosQuery = useQuery(trpc.laporan.ongkos.queryOptions({ from, to }));
  const kumulatifQuery = useQuery(trpc.laporan.kumulatif.queryOptions());
  const diagramQuery = useQuery(trpc.laporan.diagram.queryOptions({ from, to }));
  const diagram = diagramQuery.data as
    | { pendapatan?: number; pengeluaran?: number; bengkel?: number }
    | undefined;

  if (role === "mekanik") return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4">
      <Card>
        <CardHeader>
          <CardTitle>Periode</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from">Dari</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Sampai</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <StatTile compact label="Pendapatan" value={<span className="tabular-nums">{formatIdr(diagram?.pendapatan ?? 0)}</span>} />
        <StatTile compact label="Pengeluaran" value={<span className="tabular-nums">{formatIdr(diagram?.pengeluaran ?? 0)}</span>} />
        <StatTile compact label="Bengkel" value={<span className="tabular-nums">{formatIdr(diagram?.bengkel ?? 0)}</span>} />
      </div>


      <Tabs defaultValue="ongkos">
        <TabsList>
          <TabsTrigger value="ongkos">Ongkos periode</TabsTrigger>
          <TabsTrigger value="kumulatif">Kumulatif</TabsTrigger>
        </TabsList>
        <TabsContent value="ongkos">
          <Card>
            <CardHeader>
              <CardTitle>Laporan ongkos</CardTitle>
            </CardHeader>
            <CardContent>
              <LaporanTable rows={asRows(ongkosQuery.data)} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="kumulatif">
          <Card>
            <CardHeader>
              <CardTitle>Laporan kumulatif</CardTitle>
            </CardHeader>
            <CardContent>
              <LaporanTable rows={asRows(kumulatifQuery.data)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
