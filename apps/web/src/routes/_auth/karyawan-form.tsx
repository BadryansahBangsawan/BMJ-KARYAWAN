import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Checkbox } from "@BMJ-KARYAWAN/ui/components/checkbox";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@BMJ-KARYAWAN/ui/components/select";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import z from "zod";

import { FieldError, fieldDescribedBy } from "@/components/field-error";
import { FilterChips } from "@/components/filter-bar";
import { MoneyField } from "@/components/money-field";
import { SectionHeader } from "@/components/section-header";

type Role = "supervisor" | "kasir" | "mekanik";

export type EmployeeFormValues = {
  name: string;
  role: Role;
  email: string;
  password: string;
  payKind: "gaji" | "persenan";
  ongkosPercent: string;
  uangMakanHarianIdr: string;
  bonusIdr: string;
  active: boolean;
};

export const employeeFormFields = z.object({
  name: z.string().min(1, "Masukkan nama karyawan."),
  role: z.enum(["supervisor", "kasir", "mekanik"]),
  email: z.string(),
  password: z.string(),
  payKind: z.enum(["gaji", "persenan"]),
  ongkosPercent: z.string().superRefine((value, ctx) => {
    const percent = Number(value);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      ctx.addIssue({ code: "custom", message: "Masukkan persen bengkel 0–100." });
    }
  }),
  uangMakanHarianIdr: z.string(),
  bonusIdr: z.string(),
  active: z.boolean(),
});

const LOGIN_PAIR_MESSAGE = "Email dan kata sandi keduanya diperlukan untuk membuat login.";

export function refineLoginPair(
  value: { email: string; password: string },
  ctx: z.RefinementCtx,
  mode: "create" | "edit",
) {
  const hasEmail = value.email.trim().length > 0;
  const hasPassword = value.password.length > 0;
  if (hasPassword && value.password.length < 8) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: "Kata sandi minimal 8 karakter.",
    });
  }
  if (mode === "create" && hasEmail !== hasPassword) {
    ctx.addIssue({
      code: "custom",
      path: hasEmail ? ["password"] : ["email"],
      message: LOGIN_PAIR_MESSAGE,
    });
  }
  if (mode === "edit" && hasPassword && !hasEmail) {
    ctx.addIssue({
      code: "custom",
      path: ["email"],
      message: LOGIN_PAIR_MESSAGE,
    });
  }
}

export const defaultEmployeeValues: EmployeeFormValues = {
  name: "",
  role: "mekanik",
  email: "",
  password: "",
  payKind: "persenan",
  ongkosPercent: "0",
  uangMakanHarianIdr: "",
  bonusIdr: "0",
  active: true,
};
export function EmployeeFields({
  form,
  idPrefix,
}: {
  form: {
    Field: (props: {
      name: keyof EmployeeFormValues;
      children: (field: {
        name: string;
        state: {
          value: unknown;
          meta: { errors: Array<{ message?: string } | undefined> };
        };
        handleBlur: () => void;
        handleChange: (value: string | boolean) => void;
      }) => ReactNode;
    }) => ReactNode | Promise<ReactNode>;
    Subscribe: (props: {
      selector: (state: { values: EmployeeFormValues }) => "gaji" | "persenan";
      children: (kind: "gaji" | "persenan") => ReactNode;
    }) => ReactNode;
  };
  idPrefix: string;
}) {
  const [showPassword, setShowPassword] = useState(true);
  return (
    <>
      <form.Field name="name">
        {(field) => {
          const errorId = `${idPrefix}-name-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Nama</Label>
              <Input
                id={`${idPrefix}-${field.name}`}
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors)}
              />
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-${field.name}`}>Peran</Label>
            <Select
              value={String(field.state.value)}
              onValueChange={(value) => {
                if (value === "supervisor" || value === "kasir" || value === "mekanik") {
                  field.handleChange(value);
                }
              }}
            >
              <SelectTrigger id={`${idPrefix}-${field.name}`} className="w-full">
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
      </form.Field>
      <form.Field name="payKind">
        {(field) => (
          <div className="space-y-2">
            <span className="text-sm font-medium">Jenis bayar</span>
            <FilterChips
              ariaLabel="Jenis bayar"
              value={String(field.state.value)}
              onChange={(value) => {
                if (value === "gaji" || value === "persenan") field.handleChange(value);
              }}
              options={[
                { value: "gaji", label: "Gaji" },
                { value: "persenan", label: "Persenan" },
              ]}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => {
          const errorId = `${idPrefix}-email-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Email (opsional)</Label>
              <Input
                id={`${idPrefix}-${field.name}`}
                type="email"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                autoComplete="off"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors) ?? `${idPrefix}-login-hint`}
              />
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <form.Field name="password">
        {(field) => {
          const errorId = `${idPrefix}-password-error`;
          return (
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-${field.name}`}>Kata sandi (opsional)</Label>
              <div className="flex gap-2">
                <Input
                  id={`${idPrefix}-${field.name}`}
                  type={showPassword ? "text" : "password"}
                  value={String(field.state.value)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={
                    fieldDescribedBy(errorId, field.state.meta.errors) ?? `${idPrefix}-login-hint`
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 px-3"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  onClick={() => setShowPassword((open) => !open)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <FieldError id={errorId} errors={field.state.meta.errors} />
            </div>
          );
        }}
      </form.Field>
      <p id={`${idPrefix}-login-hint`} className="text-pretty text-sm text-muted-foreground">
        Email dan kata sandi keduanya untuk login karyawan. Kata sandi tampil supaya bisa disalin.
      </p>
      <form.Subscribe selector={(state) => state.values.payKind}>
        {(kind) =>
          kind === "gaji" ? (
            <form.Field name="bonusIdr">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-${field.name}`}>Gaji / bulan</Label>
                  <MoneyField
                    id={`${idPrefix}-${field.name}`}
                    value={String(field.state.value)}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="0"
                  />
                </div>
              )}
            </form.Field>
          ) : (
            <form.Field name="ongkosPercent">
              {(field) => {
                const errorId = `${idPrefix}-${field.name}-error`;
                return (
                  <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-${field.name}`}>Persen bengkel</Label>
                    <Input
                      id={`${idPrefix}-${field.name}`}
                      inputMode="numeric"
                      className="tabular-nums"
                      value={String(field.state.value)}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="0"
                      aria-invalid={field.state.meta.errors.length > 0}
                      aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors)}
                    />
                    <p className="text-pretty text-sm text-muted-foreground">
                      Dipotong dulu dari ongkos kerja. Sisa ke karyawan.
                    </p>
                    <FieldError id={errorId} errors={field.state.meta.errors} />
                  </div>
                );
              }}
            </form.Field>
          )
        }
      </form.Subscribe>
      <form.Field name="uangMakanHarianIdr">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-${field.name}`}>Uang makan / hari</Label>
            <MoneyField
              id={`${idPrefix}-${field.name}`}
              value={String(field.state.value)}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Kosong = tidak ada"
            />
            <p className="text-pretty text-sm text-muted-foreground">
              Masuk slip jika absen 06:00–08:59. Terlambat = tidak dapat.
            </p>
          </div>
        )}
      </form.Field>
      <form.Field name="active">
        {(field) => (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-${field.name}`}
              checked={field.state.value === true}
              onCheckedChange={(checked) => field.handleChange(checked === true)}
            />
            <Label htmlFor={`${idPrefix}-${field.name}`}>Karyawan aktif</Label>
          </div>
        )}
      </form.Field>
    </>
  );
}

export type LoginReceipt = { name: string; email: string; password: string };

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} disalin`);
  } catch {
    toast.error("Tidak bisa menyalin");
  }
}

export function LoginReceiptCard({
  login,
  onDismiss,
}: {
  login: LoginReceipt;
  onDismiss: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card px-4 py-4 shadow-[var(--shadow-border)]">
      <SectionHeader
        title="Login karyawan"
        action={
          <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
            Tutup
          </Button>
        }
      />
      <p className="text-pretty text-sm text-muted-foreground">
        Kata sandi tidak bisa dibuka lagi setelah ditutup. Salin sekarang.
      </p>
      <dl className="grid gap-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Nama</dt>
          <dd className="font-medium">{login.name}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{login.email}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Kata sandi</dt>
          <dd className="font-medium break-all">{login.password}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void copyText("Email", login.email)}>
          Salin email
        </Button>
        <Button type="button" size="sm" onClick={() => void copyText("Kata sandi", login.password)}>
          Salin kata sandi
        </Button>
      </div>
    </section>
  );
}
