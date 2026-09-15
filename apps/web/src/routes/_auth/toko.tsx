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
import z from "zod";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

type Role = "supervisor" | "kasir" | "mekanik";

function userRole(user: { role?: string | null } | null | undefined): Role {
  const role = user?.role;
  if (role === "supervisor" || role === "kasir" || role === "mekanik") return role;
  return "mekanik";
}

function formatIdr(n: number) {
  return n.toLocaleString("id-ID");
}

type StoreTxn = {
  id: string;
  seq: number;
  kind: string;
  amountIdr: number;
  note?: string | null;
  createdAt?: string | number | Date | null;
};

const KIND_LABEL: Record<string, string> = {
  kasir: "Tunai",
  non_tunai: "Non Tunai",
  panjar: "Panjar",
};

export const Route = createFileRoute("/_auth/toko")({
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
  component: TokoPage,
});

function TokoPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);

  const listQuery = useQuery(trpc.store.list.queryOptions());
  const summaryQuery = useQuery(trpc.store.summary.queryOptions());
  const rows = (listQuery.data ?? []) as StoreTxn[];
  const summary = summaryQuery.data as
    | {
        transaksiKali?: number;
        tunai?: number;
        nonTunai?: number;
        panjar?: number;
      }
    | undefined;

  const kali = summary?.transaksiKali ?? rows.length;
  const tunai = summary?.tunai ?? 0;
  const nonTunai = summary?.nonTunai ?? 0;
  const panjar = summary?.panjar ?? 0;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.store.list.queryKey() });
    await queryClient.invalidateQueries({ queryKey: trpc.store.summary.queryKey() });
  };

  const createMut = useMutation(
    trpc.store.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Transaksi tersimpan");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useForm({
    defaultValues: {
      kind: "kasir" as "kasir" | "non_tunai" | "panjar",
      amountIdr: "",
      note: "",
    },
    onSubmit: async ({ value }) => {
      await createMut.mutateAsync({
        kind: value.kind,
        amountIdr: Number(value.amountIdr),
        ...(value.note ? { note: value.note } : {}),
      });
      form.reset();
    },
    validators: {
      onSubmit: z.object({
        kind: z.enum(["kasir", "non_tunai", "panjar"]),
        amountIdr: z.string().refine((v) => Number(v) > 0, "Jumlah harus lebih dari 0"),
        note: z.string(),
      }),
    },
  });

  if (role === "mekanik") return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Toko</h1>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Transaksi {kali} Kali</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tunai</CardTitle>
          </CardHeader>
          <CardContent>{formatIdr(tunai)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Non Tunai</CardTitle>
          </CardHeader>
          <CardContent>{formatIdr(nonTunai)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Panjar</CardTitle>
          </CardHeader>
          <CardContent>{formatIdr(panjar)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catat transaksi</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
            className="grid gap-3 md:grid-cols-3"
          >
            <form.Field name="kind">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Jenis</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value === "kasir" || value === "non_tunai" || value === "panjar") {
                        field.handleChange(value);
                      }
                    }}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kasir">Tunai</SelectItem>
                      <SelectItem value="non_tunai">Non Tunai</SelectItem>
                      <SelectItem value="panjar">Panjar</SelectItem>
                    </SelectContent>
                  </Select>
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
            <form.Field name="note">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Catatan</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            <div className="md:col-span-3">
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                })}
              >
                {({ canSubmit, isSubmitting }) => (
                  <Button type="submit" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? "Menyimpan..." : "Simpan"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada transaksi</EmptyTitle>
                <EmptyDescription>Catat transaksi tunai, non tunai, atau panjar.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.seq}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{KIND_LABEL[row.kind] ?? row.kind}</Badge>
                    </TableCell>
                    <TableCell>{formatIdr(row.amountIdr)}</TableCell>
                    <TableCell>{row.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
