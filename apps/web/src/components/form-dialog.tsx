import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@BMJ-KARYAWAN/ui/components/dialog";
import type { FormEvent, ReactNode } from "react";

import { BusyLabel } from "@/components/busy-label";
import { focusFirstInvalid } from "@/components/field-error";

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitLabel,
  submitVariant = "default",
  submitting = false,
  onSubmit,
  extraFooter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  submitLabel: string;
  submitVariant?: "default" | "destructive";
  submitting?: boolean;
  onSubmit: () => void | Promise<void>;
  extraFooter?: ReactNode;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    void onSubmit();
    focusFirstInvalid();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 max-w-full sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid min-w-0 max-w-full gap-4 overflow-x-clip">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid min-w-0 gap-3">{children}</div>
          <DialogFooter>
            {extraFooter}
            <Button
              type="button"
              variant="outline"
              className="w-full min-w-0 sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant={submitVariant}
              className="w-full min-w-0 sm:w-auto"
              disabled={submitting}
              aria-busy={submitting}
            >
              <BusyLabel busy={submitting}>{submitLabel}</BusyLabel>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = "destructive",
  confirming = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "destructive" | "default";
  confirming?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {typeof description === "string" ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <div className="text-pretty text-sm/relaxed text-muted-foreground">{description}</div>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={confirming}
            aria-busy={confirming}
            onClick={onConfirm}
          >
            <BusyLabel busy={confirming}>{confirmLabel}</BusyLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
