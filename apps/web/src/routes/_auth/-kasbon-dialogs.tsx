import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { Textarea } from "@BMJ-KARYAWAN/ui/components/textarea";
import type { ReactNode } from "react";

import { focusFirstInvalid } from "@/components/field-error";
import { FormDialog } from "@/components/form-dialog";
import { MoneyField } from "@/components/money-field";
import { formatRp } from "@/lib/format";

export function CreateKasbonDialog({
  open,
  submitting,
  children,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ajukan kasbon"
      description="Masukkan keperluan dan jumlah. Nominal dalam rupiah utuh."
      submitLabel="Ajukan kasbon"
      submitting={submitting}
      onSubmit={onSubmit}
    >
      {children}
    </FormDialog>
  );
}

export function RejectKasbonDialog({
  open,
  name,
  amountIdr,
  reason,
  submitting,
  onReasonChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  name: string;
  amountIdr: number;
  reason: string;
  submitting: boolean;
  onReasonChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tolak kasbon"
      description={
        open
          ? `Kasbon ${name} sebesar ${formatRp(amountIdr)} akan ditolak.`
          : "Kasbon akan ditolak."
      }
      submitLabel="Tolak kasbon"
      submitVariant="destructive"
      submitting={submitting}
      onSubmit={() => {
        if (!reason.trim()) {
          focusFirstInvalid();
          return;
        }
        onSubmit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="reject-reason">Alasan</Label>
        <Textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Mis. stok belum lunas"
          aria-invalid={!reason.trim()}
          aria-describedby={!reason.trim() ? "reject-reason-error" : undefined}
        />
        {!reason.trim() ? (
          <p id="reject-reason-error" className="text-sm text-destructive">
            Masukkan alasan penolakan.
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}

export function PayKasbonDialog({
  open,
  sisaIdr,
  amount,
  submitting,
  onAmountChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  sisaIdr: number;
  amount: string;
  submitting: boolean;
  onAmountChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Catat pembayaran"
      description={`Sisa yang masih harus dibayar ${formatRp(sisaIdr)}.`}
      submitLabel="Catat pembayaran"
      submitting={submitting}
      onSubmit={() => {
        if (!(Number(amount) > 0)) {
          focusFirstInvalid();
          return;
        }
        onSubmit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="pay-amount">Jumlah</Label>
        <MoneyField
          id="pay-amount"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="50000"
          aria-invalid={!(Number(amount) > 0)}
          aria-describedby={!(Number(amount) > 0) ? "pay-amount-error" : undefined}
        />
        {!(Number(amount) > 0) ? (
          <p id="pay-amount-error" className="text-sm text-destructive">
            Masukkan jumlah lebih dari 0.
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}
