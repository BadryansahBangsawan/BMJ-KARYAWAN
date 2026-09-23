import { eq, inArray } from "drizzle-orm";

import type { Database } from "@BMJ-KARYAWAN/db";
import { employee, kasbon, kasbonPayment } from "@BMJ-KARYAWAN/db/schema/karyawan";
type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function employeeByUserId(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(employee)
    .where(eq(employee.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function paymentTotals(
  db: DbOrTx,
  kasbonIds: string[],
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  if (kasbonIds.length === 0) return totals;
  const rows = await db
    .select()
    .from(kasbonPayment)
    .where(inArray(kasbonPayment.kasbonId, kasbonIds));
  for (const row of rows) {
    totals[row.kasbonId] = (totals[row.kasbonId] ?? 0) + row.amountIdr;
  }
  return totals;
}

export async function kasbonSisaByEmployee(
  db: DbOrTx,
): Promise<Record<string, number>> {
  const debt = await db
    .select()
    .from(kasbon)
    .where(inArray(kasbon.status, ["disbursed", "lunas"]));
  const totals = await paymentTotals(
    db,
    debt.map((row) => row.id),
  );
  const sisaByEmployee: Record<string, number> = {};
  for (const row of debt) {
    const sisa = row.amountIdr - (totals[row.id] ?? 0);
    if (sisa <= 0) continue;
    sisaByEmployee[row.employeeId] = (sisaByEmployee[row.employeeId] ?? 0) + sisa;
  }
  return sisaByEmployee;
}
