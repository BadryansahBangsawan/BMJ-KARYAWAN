import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@BMJ-KARYAWAN/ui/components/empty";
import type { ReactNode } from "react";

export function StatePanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function PageError({
  title = "Tidak bisa memuat data",
  description = "Periksa koneksi, lalu coba lagi.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <StatePanel
      title={title}
      description={description}
      action={
        <Button type="button" variant="outline" onClick={onRetry}>
          Coba lagi
        </Button>
      }
    />
  );
}
