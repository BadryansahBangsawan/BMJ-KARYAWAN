import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@BMJ-KARYAWAN/db";
import {
  attendance,
  employee,
  job,
  kasbon,
  kasbonPayment,
  payrollLine,
  payrollPeriod,
} from "@BMJ-KARYAWAN/db/schema/karyawan";

import { protectedProcedure, router, supervisorProcedure } from "../index";
import { splitBengkelOngkos } from "../lib/ongkos";

const TZ = "Asia/Jayapura";

const yearMonthInput = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

function isFutureYearMonth(year: number, month: number) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const [yStr, mStr] = today.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  return year > y || (year === y && month > m);
}

function assertNotFuturePeriod(year: number, month: number) {
  if (isFutureYearMonth(year, month)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tidak bisa hitung gaji untuk bulan yang belum terjadi",
    });
  }
}

function monthRange(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${ym}-01`;
  const endDate = `${ym}-${String(last).padStart(2, "0")}`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const payDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { startDate, endDate, payDate };
}

function mechanicPayIdr(line: {
  jobShareIdr: number;
  konsumsiIdr: number;
  bonusIdr: number;
}) {
  return line.jobShareIdr + line.konsumsiIdr + line.bonusIdr;
}

function clampKasbonDeduction(
  amountIdr: number,
  kasbonBalanceIdr: number,
  payIdr: number,
) {
  return Math.min(Math.max(0, amountIdr), kasbonBalanceIdr, Math.max(0, payIdr));
}

async function paymentTotals(db: Database, kasbonIds: string[]) {
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

async function kasbonSisaByEmployee(db: Database) {
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

async function linesWithNames(db: Database, periodId: string) {
  return db
    .select({
      line: payrollLine,
      employeeName: employee.name,
    })
    .from(payrollLine)
    .innerJoin(employee, eq(payrollLine.employeeId, employee.id))
    .where(eq(payrollLine.periodId, periodId))
    .orderBy(asc(employee.name));
}

async function getPeriod(db: Database, year: number, month: number) {
  const rows = await db
    .select()
    .from(payrollPeriod)
    .where(and(eq(payrollPeriod.year, year), eq(payrollPeriod.month, month)))
    .limit(1);
  return rows[0] ?? null;
}

async function getOrCreateDraftPeriod(
  db: Database,
  year: number,
  month: number,
) {
  const existing = await getPeriod(db, year, month);
  if (existing) return existing;
  const { startDate, endDate, payDate } = monthRange(year, month);
  const inserted = await db
    .insert(payrollPeriod)
    .values({
      id: crypto.randomUUID(),
      year,
      month,
      startDate,
      endDate,
      payDate,
      status: "draft",
    })
    .returning();
  return inserted[0]!;
}

async function rebuildDraftLines(
  db: Database,
  period: typeof payrollPeriod.$inferSelect,
  keepDeductions: boolean,
) {

  const previousRows = keepDeductions
    ? await db
        .select()
        .from(payrollLine)
        .where(eq(payrollLine.periodId, period.id))
    : [];
  const previousDeduction: Record<string, number> = {};
  for (const row of previousRows) {
    previousDeduction[row.employeeId] = row.kasbonDeductionIdr;
  }

  const emps = await db
    .select()
    .from(employee)
    .where(ne(employee.role, "supervisor"))
    .orderBy(asc(employee.name));

  const [attRows, jobRows, sisaByEmployee] = await Promise.all([
    db
      .select()
      .from(attendance)
      .where(
        and(
          gte(attendance.workDate, period.startDate),
          lte(attendance.workDate, period.endDate),
        ),
      ),
    db
      .select()
      .from(job)
      .where(
        and(
          eq(job.status, "diterima"),
          gte(job.workDate, period.startDate),
          lte(job.workDate, period.endDate),
        ),
      ),
    kasbonSisaByEmployee(db),
  ]);

  const daysPresentByEmp: Record<string, number> = {};
  const alpaByEmp: Record<string, number> = {};
  for (const row of attRows) {
    daysPresentByEmp[row.employeeId] =
      (daysPresentByEmp[row.employeeId] ?? 0) + row.value;
    if (row.value === 0) {
      alpaByEmp[row.employeeId] = (alpaByEmp[row.employeeId] ?? 0) + 1;
    }
  }

  const percentByEmp: Record<string, number> = {};
  for (const emp of emps) percentByEmp[emp.id] = emp.ongkosPercent;

  const jobShareByEmp: Record<string, number> = {};
  const bengkelByEmp: Record<string, number> = {};
  for (const row of jobRows) {
    const { bengkelIdr, mechanicIdr } = splitBengkelOngkos(
      row.amountIdr,
      row.bengkelPercent ?? percentByEmp[row.employeeId] ?? 0,
    );
    jobShareByEmp[row.employeeId] = (jobShareByEmp[row.employeeId] ?? 0) + mechanicIdr;
    bengkelByEmp[row.employeeId] = (bengkelByEmp[row.employeeId] ?? 0) + bengkelIdr;
  }

  const values = emps.flatMap((emp) => {
    const daysPresentTenths = daysPresentByEmp[emp.id] ?? 0;
    const alpaDays = alpaByEmp[emp.id] ?? 0;
    const jobShareIdr = jobShareByEmp[emp.id] ?? 0;
    const dailyPayIdr = bengkelByEmp[emp.id] ?? 0;
    const bonusIdr =
      daysPresentTenths >= 2000 && alpaDays < 5 ? emp.bonusIdr : 0;
    const konsumsiIdr = Math.round(((emp.konsumsiMonthlyIdr || 0) * daysPresentTenths) / 100);
    const payIdr = jobShareIdr + konsumsiIdr + bonusIdr;
    const kasbonBalanceIdr = sisaByEmployee[emp.id] ?? 0;
    if (
      !emp.active &&
      daysPresentTenths === 0 &&
      jobShareIdr === 0 &&
      kasbonBalanceIdr === 0
    ) {
      return [];
    }
    const kept = previousDeduction[emp.id];
    const kasbonDeductionIdr =
      keepDeductions && kept !== undefined
        ? clampKasbonDeduction(kept, kasbonBalanceIdr, payIdr)
        : clampKasbonDeduction(payIdr, kasbonBalanceIdr, payIdr);
    return [
      {
        id: crypto.randomUUID(),
        periodId: period.id,
        employeeId: emp.id,
        daysPresent: daysPresentTenths,
        alpaDays,
        ongkosPercent: emp.ongkosPercent,
        dailyPayIdr,
        jobShareIdr,
        konsumsiIdr,
        bonusIdr,
        kasbonBalanceIdr,
        kasbonDeductionIdr,
        takeHomeIdr: payIdr - kasbonDeductionIdr,
        kasbonRemainingIdr: kasbonBalanceIdr - kasbonDeductionIdr,
      },
    ];
  });

  await db.transaction(async (tx) => {
    await tx.delete(payrollLine).where(eq(payrollLine.periodId, period.id));
    if (values.length > 0) {
      await tx.insert(payrollLine).values(values);
    }
  });
}


export const payrollRouter = router({
  get: protectedProcedure.input(yearMonthInput).query(async ({ ctx, input }) => {
    const role = ctx.session.user.role ?? "mekanik";
    const period = await getPeriod(ctx.db, input.year, input.month);
    if (!period) {
      return { period: null, lines: [] };
    }
    let named = await linesWithNames(ctx.db, period.id);
    if (role === "mekanik") {
      const [me] = await ctx.db
        .select({ id: employee.id })
        .from(employee)
        .where(eq(employee.userId, ctx.session.user.id))
        .limit(1);
      named = me ? named.filter((row) => row.line.employeeId === me.id) : [];
    }
    return {
      period,
      lines: named.map((row) => ({
        ...row.line,
        employeeName: row.employeeName,
      })),
    };
  }),

  recompute: supervisorProcedure
    .input(
      yearMonthInput.extend({
        keepDeductions: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertNotFuturePeriod(input.year, input.month);
      const period = await getOrCreateDraftPeriod(
        ctx.db,
        input.year,
        input.month,
      );
      await rebuildDraftLines(ctx.db, period, input.keepDeductions === true);
      const lines = await linesWithNames(ctx.db, period.id);
      return {
        period,
        lines: lines.map((row) => ({
          ...row.line,
          employeeName: row.employeeName,
        })),
      };
    }),

  setDeduction: supervisorProcedure
    .input(
      z.object({
        lineId: z.string().min(1),
        kasbonDeductionIdr: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const lines = await ctx.db
        .select()
        .from(payrollLine)
        .where(eq(payrollLine.id, input.lineId))
        .limit(1);
      const line = lines[0];
      if (!line) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Baris gaji tidak ditemukan",
        });
      }

      const periods = await ctx.db
        .select()
        .from(payrollPeriod)
        .where(eq(payrollPeriod.id, line.periodId))
        .limit(1);
      const period = periods[0];
      if (!period) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Gaji bulan ini tidak ditemukan",
        });
      }
      assertNotFuturePeriod(period.year, period.month);
      const payIdr = mechanicPayIdr(line);
      const maxDeduction = clampKasbonDeduction(
        input.kasbonDeductionIdr,
        line.kasbonBalanceIdr,
        payIdr,
      );
      if (input.kasbonDeductionIdr > maxDeduction) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            input.kasbonDeductionIdr > line.kasbonBalanceIdr
              ? "Potongan kasbon melebihi saldo"
              : "Potongan kasbon melebihi gaji",
        });
      }

      const takeHomeIdr = payIdr - input.kasbonDeductionIdr;
      const kasbonRemainingIdr = line.kasbonBalanceIdr - input.kasbonDeductionIdr;

      const updated = await ctx.db
        .update(payrollLine)
        .set({
          kasbonDeductionIdr: input.kasbonDeductionIdr,
          takeHomeIdr,
          kasbonRemainingIdr,
        })
        .where(eq(payrollLine.id, line.id))
        .returning();

      return updated[0]!;
    }),

});
