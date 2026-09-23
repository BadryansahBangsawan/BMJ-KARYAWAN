import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@BMJ-KARYAWAN/ui/components/table";
import { Ban, Check, CircleCheck, CircleDashed } from "lucide-react";

import { MobileList, MobileListRow } from "@/components/mobile-list";
import { ResponsiveRecords } from "@/components/responsive-records";
import { StatusBadge } from "@/components/status-badge";
import { formatRp } from "@/lib/format";
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

export function JobRecords({
  jobs,
  role,
  nameById,
  rowBusy,
  onTerima,
  onBatal,
  onDetail,
}: {
  jobs: JobRow[];
  role: UserRole;
  nameById: Record<string, string>;
  rowBusy: (id: string) => boolean;
  onTerima: (id: string) => void;
  onBatal: (id: string) => void;
  onDetail: (id: string) => void;
}) {
  return (
    <ResponsiveRecords
      cards={
        <MobileList>
          {jobs.map((job) => (
            <MobileListRow
              key={job.id}
              title={job.description}
              subtitle={
                <>
                  {jobKindLabel(job)}
                  {" · "}
                  {jobMechanicName(job, nameById)}
                  {" · "}
                  <span className="tabular-nums">{job.workDate}</span>
                  {job.struk && !isStrukImage(job.struk) ? ` · No. ${job.struk}` : null}
                </>
              }
              trailing={formatRp(job.amountIdr)}
              meta={<StatusBadge {...jobStatusMeta(job.status)} />}
            >
              <JobRowActions
                job={job}
                role={role}
                busy={rowBusy(job.id)}
                onTerima={() => onTerima(job.id)}
                onBatal={() => onBatal(job.id)}
                onDetail={() => onDetail(job.id)}
              />
            </MobileListRow>
          ))}
        </MobileList>
      }
      table={
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Mekanik</TableHead>
              <TableHead>Uraian</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead className="text-end">Ongkos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="tabular-nums">{job.workDate}</TableCell>
                <TableCell>{jobMechanicName(job, nameById)}</TableCell>
                <TableCell className="max-w-xs whitespace-normal">{job.description}</TableCell>
                <TableCell>{jobKindLabel(job)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatRp(job.amountIdr)}</TableCell>
                <TableCell>
                  <StatusBadge {...jobStatusMeta(job.status)} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap gap-2">
                    <JobRowActions
                      job={job}
                      role={role}
                      busy={rowBusy(job.id)}
                      onTerima={() => onTerima(job.id)}
                      onBatal={() => onBatal(job.id)}
                      onDetail={() => onDetail(job.id)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
