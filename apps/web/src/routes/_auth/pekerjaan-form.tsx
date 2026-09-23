import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Ban, Check, CircleCheck, CircleDashed } from "lucide-react";

import type { UserRole } from "@/lib/session-role";
import type { RouterOutputs } from "@/utils/trpc";

type JobRow = RouterOutputs["job"]["list"][number];

export const JOB_STATUS = {
  proses: { label: "Proses", icon: CircleDashed, tone: "neutral" },
  selesai: { label: "Selesai", icon: CircleCheck, tone: "neutral" },
  diterima: { label: "Diterima", icon: Check, tone: "success" },
  batal: { label: "Batal", icon: Ban, tone: "danger" },
} as const;

export function jobKindLabel(job: JobRow) {
  if (job.kind === "persenan") {
    return job.bengkelPercent != null ? `Persenan ${job.bengkelPercent}%` : "Persenan";
  }
  return "Ongkos";
}

export function jobMechanicName(job: JobRow, nameById: Record<string, string>) {
  return job.employeeName?.trim() || nameById[job.employeeId] || "—";
}

export function jobNeedsAction(job: JobRow, role: UserRole) {
  if (role === "mekanik") return false;
  return job.status === "proses" || job.status === "selesai";
}

export function jobStatusMeta(status: string) {
  return (
    JOB_STATUS[status as keyof typeof JOB_STATUS] ?? {
      label: status,
      icon: CircleDashed,
      tone: "neutral" as const,
    }
  );
}

export function isStrukImage(value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return true;
  return /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i.test(trimmed);
}

export async function extractStruk(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<{ tanggal?: string; nomorStruk?: string }> {
  const res = await fetch("/api/extract-struk", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    tanggal?: string;
    nomorStruk?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Gagal membaca struk.");
  }
  return data;
}

export function JobRowActions({
  job,
  role,
  busy,
  onTerima,
  onBatal,
  onDetail,
}: {
  job: JobRow;
  role: UserRole;
  busy: boolean;
  onTerima: () => void;
  onBatal: () => void;
  onDetail: () => void;
}) {
  const canTerima =
    (role === "kasir" || role === "supervisor") &&
    (job.status === "proses" || job.status === "selesai");
  const canBatal = role === "supervisor" && job.status !== "batal";
  const hasDetail = Boolean(job.customerNote || job.struk);

  if (!canTerima && !canBatal && !hasDetail) return null;

  return (
    <>
      {canTerima ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={onTerima}>
          Terima pekerjaan
        </Button>
      ) : null}
      {hasDetail ? (
        <Button size="sm" variant="outline" onClick={onDetail}>
          Lihat detail
        </Button>
      ) : null}
      {canBatal ? (
        <Button size="sm" variant="destructive" disabled={busy} onClick={onBatal}>
          Batalkan pekerjaan
        </Button>
      ) : null}
    </>
  );
}
