import { Badge } from "@BMJ-KARYAWAN/ui/components/badge";
import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@BMJ-KARYAWAN/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@BMJ-KARYAWAN/ui/components/empty";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { Separator } from "@BMJ-KARYAWAN/ui/components/separator";
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
import { useState } from "react";
import z from "zod";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";
import { BusyLabel } from "@/components/busy-label";
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

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  dailyRateIdr: number;
  konsumsiMonthlyIdr: number;
  bonusIdr: number;
  active: boolean | number;
  userId?: string | null;
  email?: string | null;
};

export const Route = createFileRoute("/_auth/karyawan")({
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
  component: KaryawanPage,
});

function KaryawanPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const role = userRole(session?.user);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const listQuery = useQuery(trpc.employee.list.queryOptions());
  const rows = (listQuery.data ?? []) as EmployeeRow[];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.employee.list.queryKey() });
  };

  const createMut = useMutation(
    trpc.employee.create.mutationOptions({
      onSuccess: async () => {
        toast.success("Karyawan ditambah");
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const updateMut = useMutation(
    trpc.employee.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Karyawan diperbarui");
        setEditingId(null);
        await invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const importMut = useMutation(
    trpc.admin.importSheet.mutationOptions({
      onSuccess: (result) => {
        const data = (result ?? {}) as Record<string, unknown>;
        setImportResult(data);
        toast.success("Impor selesai");
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const createForm = useForm({
    defaultValues: {
      name: "",
      role: "mekanik" as Role,
      email: "",
      password: "",
      dailyRateIdr: "0",
      konsumsiMonthlyIdr: "0",
      bonusIdr: "0",
      active: true,
    },
    onSubmit: async ({ value }) => {
      await createMut.mutateAsync({
        name: value.name,
        role: value.role,
        dailyRateIdr: Number(value.dailyRateIdr),
        konsumsiMonthlyIdr: Number(value.konsumsiMonthlyIdr),
        bonusIdr: Number(value.bonusIdr),
        active: value.active,
        ...(value.email ? { email: value.email } : {}),
        ...(value.password ? { password: value.password } : {}),
      });
      createForm.reset();
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "Nama wajib"),
        role: z.enum(["supervisor", "kasir", "mekanik"]),
        email: z.string(),
        password: z.string(),
        dailyRateIdr: z.string(),
        konsumsiMonthlyIdr: z.string(),
        bonusIdr: z.string(),
        active: z.boolean(),
      }),
    },
  });

  const editForm = useForm({
    defaultValues: {
      id: "",
      name: "",
      role: "mekanik" as Role,
      email: "",
      password: "",
      dailyRateIdr: "0",
      konsumsiMonthlyIdr: "0",
      bonusIdr: "0",
      active: true,
    },
    onSubmit: async ({ value }) => {
      await updateMut.mutateAsync({
        id: value.id,
        name: value.name,
        role: value.role,
        dailyRateIdr: Number(value.dailyRateIdr),
        konsumsiMonthlyIdr: Number(value.konsumsiMonthlyIdr),
        bonusIdr: Number(value.bonusIdr),
        active: value.active,
        ...(value.email ? { email: value.email } : {}),
        ...(value.password ? { password: value.password } : {}),
      });
    },
  });

  function startEdit(row: EmployeeRow) {
    setEditingId(row.id);
    editForm.setFieldValue("id", row.id);
    editForm.setFieldValue("name", row.name);
    editForm.setFieldValue(
      "role",
      row.role === "supervisor" || row.role === "kasir" ? row.role : "mekanik",
    );
    editForm.setFieldValue("email", row.email ?? "");
    editForm.setFieldValue("password", "");
    editForm.setFieldValue("dailyRateIdr", String(row.dailyRateIdr));
    editForm.setFieldValue("konsumsiMonthlyIdr", String(row.konsumsiMonthlyIdr));
    editForm.setFieldValue("bonusIdr", String(row.bonusIdr));
    editForm.setFieldValue("active", row.active !== false && row.active !== 0);
  }

  const ttlSisa = importResult?.ttlSisa ?? importResult?.kasbonTtlSisa;
  const counts = importResult?.counts ?? importResult;

  if (role !== "supervisor") return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={importMut.isPending}
          onClick={() => importMut.mutate()}
        >
          {importMut.isPending ? "Mengimpor..." : "Impor dari spreadsheet"}
        </Button>
      </div>

      {importResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Hasil impor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ttlSisa != null ? (
              <p>
                Sisa kasbon (ttlSisa):{" "}
                <span className="font-medium tabular-nums">
                  {typeof ttlSisa === "number" ? formatIdr(ttlSisa) : String(ttlSisa)}
                </span>
              </p>
            ) : null}
            <pre className="overflow-x-auto bg-muted p-3 text-xs">
              {JSON.stringify(counts, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tambah karyawan</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void createForm.handleSubmit();
            }}
            className="grid gap-3 md:grid-cols-2"
          >
            <createForm.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Nama</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="role">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Peran</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value === "supervisor" || value === "kasir" || value === "mekanik") {
                        field.handleChange(value);
                      }
                    }}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mekanik">Mekanik</SelectItem>
                      <SelectItem value="kasir">Kasir</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Email (opsional)</Label>
                  <Input
                    id={field.name}
                    type="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Kata sandi (opsional)</Label>
                  <Input
                    id={field.name}
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="dailyRateIdr">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Tarif harian</Label>
                  <Input
                    id={field.name}
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="konsumsiMonthlyIdr">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Konsumsi bulanan</Label>
                  <Input
                    id={field.name}
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="bonusIdr">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Bonus</Label>
                  <Input
                    id={field.name}
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </createForm.Field>
            <createForm.Field name="active">
              {(field) => (
                <div className="flex items-center gap-2 self-end">
                  <input
                    id={field.name}
                    type="checkbox"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                  />
                  <Label htmlFor={field.name}>Aktif</Label>
                </div>
              )}
            </createForm.Field>
            <div className="md:col-span-2">
              <createForm.Subscribe
                selector={(state) => ({ isSubmitting: state.isSubmitting })}
              >
                {({ isSubmitting }) => (
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full"
                    aria-busy={isSubmitting}
                    variant={editingId === null ? undefined : "outline"}
                  >
                    <BusyLabel busy={isSubmitting}>Tambah karyawan</BusyLabel>
                  </Button>
                )}
              </createForm.Subscribe>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Daftar karyawan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Belum ada karyawan</EmptyTitle>
                <EmptyDescription>Tambah manual atau impor dari spreadsheet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ResponsiveRecords
              cards={
                <MobileList>
                  {rows.map((row) => (
                    <MobileListRow
                      key={row.id}
                      title={row.name}
                      subtitle={row.active === false || row.active === 0 ? "Nonaktif" : "Aktif"}
                      trailing={<span className="tabular-nums">{formatIdr(row.dailyRateIdr)}</span>}
                      meta={
                        <>
                          <Badge variant="outline">{row.role}</Badge>
                          <span className="text-sm text-muted-foreground">
                            Konsumsi <span className="tabular-nums">{formatIdr(row.konsumsiMonthlyIdr)}</span>
                            {" · "}
                            Bonus <span className="tabular-nums">{formatIdr(row.bonusIdr)}</span>
                          </span>
                        </>
                      }
                    >
                      <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                        Ubah
                      </Button>
                    </MobileListRow>
                  ))}
                </MobileList>
              }
              table={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Peran</TableHead>
                      <TableHead>Tarif</TableHead>
                      <TableHead>Konsumsi</TableHead>
                      <TableHead>Bonus</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(row.dailyRateIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(row.konsumsiMonthlyIdr)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="tabular-nums">{formatIdr(row.bonusIdr)}</span>
                        </TableCell>
                        <TableCell>
                          {row.active === false || row.active === 0 ? "Nonaktif" : "Aktif"}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                            Ubah
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}

          {editingId ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void editForm.handleSubmit();
              }}
              className="grid gap-3 border border-border p-3 md:grid-cols-2"
            >
              <editForm.Field name="name">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Nama</Label>
                    <Input
                      id={`edit-${field.name}`}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="role">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Peran</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === "supervisor" || value === "kasir" || value === "mekanik") {
                          field.handleChange(value);
                        }
                      }}
                    >
                      <SelectTrigger id={`edit-${field.name}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mekanik">Mekanik</SelectItem>
                        <SelectItem value="kasir">Kasir</SelectItem>
                        <SelectItem value="supervisor">Supervisor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Email</Label>
                    <Input
                      id={`edit-${field.name}`}
                      type="email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="password">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Kata sandi baru</Label>
                    <Input
                      id={`edit-${field.name}`}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="dailyRateIdr">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Tarif harian</Label>
                    <Input
                      id={`edit-${field.name}`}
                      inputMode="numeric"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="konsumsiMonthlyIdr">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Konsumsi bulanan</Label>
                    <Input
                      id={`edit-${field.name}`}
                      inputMode="numeric"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="bonusIdr">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={`edit-${field.name}`}>Bonus</Label>
                    <Input
                      id={`edit-${field.name}`}
                      inputMode="numeric"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </editForm.Field>
              <editForm.Field name="active">
                {(field) => (
                  <div className="flex items-center gap-2 self-end">
                    <input
                      id={`edit-${field.name}`}
                      type="checkbox"
                      checked={field.state.value}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                    <Label htmlFor={`edit-${field.name}`}>Aktif</Label>
                  </div>
                )}
              </editForm.Field>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Button type="submit" className="w-full">
                  Simpan perubahan
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setEditingId(null)}>
                  Batal
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
