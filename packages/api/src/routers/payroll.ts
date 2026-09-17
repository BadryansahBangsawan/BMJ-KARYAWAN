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

function mechanicShare(row: {
  status: string;
  kind: string;
  amountIdr: number;
  bengkelPercent: number | null;
}) {
  if (row.status !== "diterima") return 0;
  if (row.kind === "ongkos") return row.amountIdr;
  if (row.kind === "persenan") {
    const pct = row.bengkelPercent ?? 0;
    return row.amountIdr - Math.round((row.amountIdr * pct) / 100);
  }
  return 0;
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
    sisaByEmployee[row.employeeId] =
      (sisaByEmployee[row.employeeId] ?? 0) + sisa;
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
  if (period.status !== "draft") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Periode gaji sudah dikunci",
    });
  }

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

  const jobShareByEmp: Record<string, number> = {};
  for (const row of jobRows) {
    jobShareByEmp[row.employeeId] =
      (jobShareByEmp[row.employeeId] ?? 0) + mechanicShare(row);
  }

  await db.delete(payrollLine).where(eq(payrollLine.periodId, period.id));

  const values = emps.map((emp) => {
    const daysPresentTenths = daysPresentByEmp[emp.id] ?? 0;
    const alpaDays = alpaByEmp[emp.id] ?? 0;
    const dailyPayIdr = Math.round(
      (daysPresentTenths * emp.dailyRateIdr) / 100,
    );
    const jobShareIdr = jobShareByEmp[emp.id] ?? 0;
    const bonusIdr =
      daysPresentTenths >= 2000 && alpaDays < 5 ? emp.bonusIdr : 0;
    const konsumsiIdr = Math.round(
      (daysPresentTenths * (emp.konsumsiMonthlyIdr || 0)) / 100,
    );
    const kasbonBalanceIdr = sisaByEmployee[emp.id] ?? 0;
    const defaultDeduction = Math.min(
      kasbonBalanceIdr,
      dailyPayIdr + jobShareIdr + konsumsiIdr + bonusIdr,
    );
    const kept = previousDeduction[emp.id];
    const kasbonDeductionIdr =
      keepDeductions && kept !== undefined
        ? Math.min(Math.max(0, kept), kasbonBalanceIdr)
        : defaultDeduction;
    const takeHomeIdr =
      dailyPayIdr + jobShareIdr + konsumsiIdr + bonusIdr - kasbonDeductionIdr;
    const kasbonRemainingIdr = kasbonBalanceIdr - kasbonDeductionIdr;

    return {
      id: crypto.randomUUID(),
      periodId: period.id,
      employeeId: emp.id,
      daysPresent: daysPresentTenths,
      alpaDays,
      dailyRateIdr: emp.dailyRateIdr,
      dailyPayIdr,
      jobShareIdr,
      konsumsiIdr,
      bonusIdr,
      kasbonBalanceIdr,
      kasbonDeductionIdr,
      takeHomeIdr,
      kasbonRemainingIdr,
    };
  });

  if (values.length > 0) {
    await db.insert(payrollLine).values(values);
  }
}

async function allocateFifo(
  db: Database,
  opts: {
    employeeId: string;
    amountIdr: number;
    payrollLineId: string;
    userId: string;
  },
) {
  let remaining = opts.amountIdr;
  if (remaining <= 0) return;

  const open = await db
    .select()
    .from(kasbon)
    .where(
      and(
        eq(kasbon.employeeId, opts.employeeId),
        eq(kasbon.status, "disbursed"),
      ),
    )
    .orderBy(asc(kasbon.disbursedAt), asc(kasbon.createdAt));

  if (open.length === 0) return;

  const totals = await paymentTotals(
    db,
    open.map((row) => row.id),
  );

  for (const row of open) {
    if (remaining <= 0) break;
    const sisa = row.amountIdr - (totals[row.id] ?? 0);
    if (sisa <= 0) continue;
    const take = Math.min(sisa, remaining);
    await db.insert(kasbonPayment).values({
      id: crypto.randomUUID(),
      kasbonId: row.id,
      amountIdr: take,
      source: "payroll",
      createdByUserId: opts.userId,
      payrollLineId: opts.payrollLineId,
    });
    if (sisa - take <= 0) {
      await db
        .update(kasbon)
        .set({ status: "lunas" })
        .where(eq(kasbon.id, row.id));
    }
    remaining -= take;
  }
}

export const payrollRouter = router({
  get: protectedProcedure.input(yearMonthInput).query(async ({ ctx, input }) => {
    const role = ctx.session.user.role ?? "mekanik";
    const future = isFutureYearMonth(input.year, input.month);
    const period =
      role === "mekanik" || future
        ? await getPeriod(ctx.db, input.year, input.month)
        : await getOrCreateDraftPeriod(ctx.db, input.year, input.month);
    if (!period) {
      return { period: null, lines: [] };
    }
    if (!future && period.status === "draft" && role !== "mekanik") {
      await rebuildDraftLines(ctx.db, period, true);
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
          message: "Periode gaji tidak ditemukan",
        });
      }
      if (period.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Periode gaji sudah dikunci",
        });
      }
      assertNotFuturePeriod(period.year, period.month);
      if (input.kasbonDeductionIdr > line.kasbonBalanceIdr) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Potongan kasbon melebihi saldo",
        });
      }

      const takeHomeIdr =
        line.dailyPayIdr +
        line.jobShareIdr +
        line.konsumsiIdr +
        line.bonusIdr -
        input.kasbonDeductionIdr;
      const kasbonRemainingIdr =
        line.kasbonBalanceIdr - input.kasbonDeductionIdr;

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

  finalize: supervisorProcedure
    .input(yearMonthInput)
    .mutation(async ({ ctx, input }) => {
      assertNotFuturePeriod(input.year, input.month);
      const period = await getPeriod(ctx.db, input.year, input.month);
      if (!period) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Periode gaji tidak ditemukan",
        });
      }
      if (period.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Periode gaji sudah dikunci",
        });
      }

      const lines = await ctx.db
        .select()
        .from(payrollLine)
        .where(eq(payrollLine.periodId, period.id));

      for (const line of lines) {
        if (line.kasbonDeductionIdr > 0) {
          await allocateFifo(ctx.db, {
            employeeId: line.employeeId,
            amountIdr: line.kasbonDeductionIdr,
            payrollLineId: line.id,
            userId: ctx.session.user.id,
          });
        }
      }

      const updated = await ctx.db
        .update(payrollPeriod)
        .set({
          status: "finalized",
          finalizedByUserId: ctx.session.user.id,
          finalizedAt: new Date(),
        })
        .where(eq(payrollPeriod.id, period.id))
        .returning();

      const named = await linesWithNames(ctx.db, period.id);
      return {
        period: updated[0]!,
        lines: named.map((row) => ({
          ...row.line,
          employeeName: row.employeeName,
        })),
      };
    }),
});
