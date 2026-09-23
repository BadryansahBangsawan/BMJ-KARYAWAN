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
import {
  alpaDays,
  allocatePayrollDeduction,
  clampKasbonDeduction,
  kasbonStatusAfterSisa,
  monthRange,
  presentHundredths,
  todayYmd,
  workDatesMonSat,
  type DebtSlice,
} from "../lib/domain";
import { splitBengkelOngkos } from "../lib/ongkos";
import { kasbonSisaByEmployee, paymentTotals } from "../lib/workshop-db";
type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const yearMonthInput = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

function isFutureYearMonth(year: number, month: number) {
  const today = todayYmd();
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

async function linesWithNames(db: Database, periodId: string) {
  return db
    .select({
      id: payrollLine.id,
      periodId: payrollLine.periodId,
      employeeId: payrollLine.employeeId,
      employeeName: employee.name,
      name: employee.name,
      daysPresent: payrollLine.daysPresent,
      alpaDays: payrollLine.alpaDays,
      ongkosPercent: payrollLine.ongkosPercent,
      dailyPayIdr: payrollLine.dailyPayIdr,
      jobShareIdr: payrollLine.jobShareIdr,
      konsumsiIdr: payrollLine.konsumsiIdr,
      bonusIdr: payrollLine.bonusIdr,
      kasbonBalanceIdr: payrollLine.kasbonBalanceIdr,
      kasbonDeductionIdr: payrollLine.kasbonDeductionIdr,
      takeHomeIdr: payrollLine.takeHomeIdr,
      kasbonRemainingIdr: payrollLine.kasbonRemainingIdr,
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

async function getOrCreatePeriod(
  db: Database,
  year: number,
  month: number,
) {
  const existing = await getPeriod(db, year, month);
  if (existing) return existing;
  const { startDate, endDate, payDate } = monthRange(year, month);
  try {
    const inserted = await db
      .insert(payrollPeriod)
      .values({
        id: crypto.randomUUID(),
        year,
        month,
        startDate,
        endDate,
        payDate,
      })
      .returning();
    return inserted[0]!;
  } catch {
    const raced = await getPeriod(db, year, month);
    if (raced) return raced;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Gagal membuat bulan gaji",
    });
  }
}

async function restrictLinesToSession<T extends { employeeId: string }>(
  db: Database,
  userId: string,
  role: string | null | undefined,
  lines: T[],
): Promise<T[]> {
  if ((role ?? "mekanik") === "supervisor") return lines;
  const [me] = await db
    .select({ id: employee.id })
    .from(employee)
    .where(eq(employee.userId, userId))
    .limit(1);
  return me ? lines.filter((row) => row.employeeId === me.id) : [];
}

async function monthInputs(db: Database, startDate: string, endDate: string) {
  const emps = await db
    .select()
    .from(employee)
    .where(ne(employee.role, "supervisor"))
    .orderBy(asc(employee.name));

  const [attRows, jobRows] = await Promise.all([
    db
      .select()
      .from(attendance)
      .where(
        and(
          gte(attendance.workDate, startDate),
          lte(attendance.workDate, endDate),
        ),
      ),
    db
      .select()
      .from(job)
      .where(
        and(
          eq(job.status, "diterima"),
          gte(job.workDate, startDate),
          lte(job.workDate, endDate),
        ),
      ),
  ]);

  return { emps, attRows, jobRows };
}

function attendanceAggregates(
  attRows: { employeeId: string; workDate: string; value: number }[],
) {
  const marksByEmp: Record<string, Record<string, number>> = {};
  const daysPresentByEmp: Record<string, number> = {};
  const onTimeDaysByEmp: Record<string, number> = {};
  for (const row of attRows) {
    (marksByEmp[row.employeeId] ??= {})[row.workDate] = row.value;
    daysPresentByEmp[row.employeeId] =
      (daysPresentByEmp[row.employeeId] ?? 0) + presentHundredths(row.value);
    if (row.value === 100) {
      onTimeDaysByEmp[row.employeeId] =
        (onTimeDaysByEmp[row.employeeId] ?? 0) + 1;
    }
  }
  return { marksByEmp, daysPresentByEmp, onTimeDaysByEmp };
}

function jobShareByEmployee(
  emps: { id: string; payKind: string; ongkosPercent: number }[],
  jobRows: {
    employeeId: string;
    amountIdr: number;
    bengkelPercent: number | null;
  }[],
) {
  const percentByEmp: Record<string, number> = {};
  const payKindByEmp: Record<string, string> = {};
  for (const emp of emps) {
    percentByEmp[emp.id] = emp.ongkosPercent;
    payKindByEmp[emp.id] = emp.payKind;
  }
  const jobShareByEmp: Record<string, number> = {};
  for (const row of jobRows) {
    if (payKindByEmp[row.employeeId] === "gaji") continue;
    const { mechanicIdr } = splitBengkelOngkos(
      row.amountIdr,
      row.bengkelPercent ?? percentByEmp[row.employeeId] ?? 0,
    );
    jobShareByEmp[row.employeeId] =
      (jobShareByEmp[row.employeeId] ?? 0) + mechanicIdr;
  }
  return jobShareByEmp;
}

async function debtSlicesForEmployee(
  db: DbOrTx,
  employeeId: string,
): Promise<DebtSlice[]> {
  const rows = await db
    .select()
    .from(kasbon)
    .where(
      and(
        eq(kasbon.employeeId, employeeId),
        inArray(kasbon.status, ["disbursed", "lunas"]),
      ),
    );
  const totals = await paymentTotals(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    amountIdr: row.amountIdr,
    paidIdr: totals[row.id] ?? 0,
    disbursedAt:
      row.disbursedAt == null
        ? null
        : row.disbursedAt instanceof Date
          ? row.disbursedAt.getTime()
          : row.disbursedAt,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.getTime()
        : Number(row.createdAt),
  }));
}

async function refreshKasbonStatuses(db: DbOrTx, kasbonIds: string[]) {
  const unique = [...new Set(kasbonIds)];
  if (unique.length === 0) return;
  const rows = await db
    .select()
    .from(kasbon)
    .where(inArray(kasbon.id, unique));
  const totals = await paymentTotals(db, unique);
  for (const row of rows) {
    const sisa = row.amountIdr - (totals[row.id] ?? 0);
    await db
      .update(kasbon)
      .set({ status: kasbonStatusAfterSisa(sisa) })
      .where(eq(kasbon.id, row.id));
  }
}

async function payrollPaidByLineIds(db: Database, lineIds: string[]) {
  const totals: Record<string, number> = {};
  if (lineIds.length === 0) return totals;
  const rows = await db
    .select()
    .from(kasbonPayment)
    .where(
      and(
        eq(kasbonPayment.source, "payroll"),
        inArray(kasbonPayment.payrollLineId, lineIds),
      ),
    );
  for (const row of rows) {
    if (!row.payrollLineId) continue;
    totals[row.payrollLineId] = (totals[row.payrollLineId] ?? 0) + row.amountIdr;
  }
  return totals;
}

async function rebuildLines(
  db: Database,
  period: typeof payrollPeriod.$inferSelect,
  keepDeductions: boolean,
  createdByUserId: string,
) {
  const { emps, attRows, jobRows } = await monthInputs(
    db,
    period.startDate,
    period.endDate,
  );
  const { marksByEmp, daysPresentByEmp, onTimeDaysByEmp } =
    attendanceAggregates(attRows);
  const jobShareByEmp = jobShareByEmployee(emps, jobRows);
  const workDates = workDatesMonSat(period.year, period.month);
  const asOf = todayYmd();

  await db.transaction(async (tx) => {
    const previousRows = await tx
      .select({
        id: payrollLine.id,
        employeeId: payrollLine.employeeId,
        kasbonDeductionIdr: payrollLine.kasbonDeductionIdr,
      })
      .from(payrollLine)
      .where(eq(payrollLine.periodId, period.id));
    const previousDeduction: Record<string, number> = {};
    const previousIds = previousRows.map((row) => row.id);
    for (const row of previousRows) {
      previousDeduction[row.employeeId] = row.kasbonDeductionIdr;
    }

    const oldPays =
      previousIds.length === 0
        ? []
        : await tx
            .select()
            .from(kasbonPayment)
            .where(
              and(
                eq(kasbonPayment.source, "payroll"),
                inArray(kasbonPayment.payrollLineId, previousIds),
              ),
            );
    if (previousIds.length > 0) {
      await tx
        .delete(kasbonPayment)
        .where(
          and(
            eq(kasbonPayment.source, "payroll"),
            inArray(kasbonPayment.payrollLineId, previousIds),
          ),
        );
    }
    const restoredKasbonIds = oldPays.map((row) => row.kasbonId);
    await refreshKasbonStatuses(tx, restoredKasbonIds);

    const sisaByEmployee = await kasbonSisaByEmployee(tx);

    const values = emps.flatMap((emp) => {
      const daysPresent = daysPresentByEmp[emp.id] ?? 0;
      const marks = marksByEmp[emp.id] ?? {};
      const alpaDayCount = alpaDays(workDates, marks, asOf);
      const onTimeDays = onTimeDaysByEmp[emp.id] ?? 0;
      const isGaji = emp.payKind === "gaji";
      const jobShareIdr = isGaji ? 0 : (jobShareByEmp[emp.id] ?? 0);
      const dailyPayIdr = isGaji && emp.active ? emp.bonusIdr || 0 : 0;
      const bonusIdr = 0;
      const konsumsiIdr = (emp.uangMakanHarianIdr || 0) * onTimeDays;
      const payIdr = dailyPayIdr + jobShareIdr + konsumsiIdr;
      const kasbonBalanceIdr = sisaByEmployee[emp.id] ?? 0;
      if (
        !emp.active &&
        daysPresent === 0 &&
        jobShareIdr === 0 &&
        dailyPayIdr === 0 &&
        kasbonBalanceIdr === 0
      ) {
        return [];
      }
      const kept = previousDeduction[emp.id];
      const kasbonDeductionIdr =
        keepDeductions && kept !== undefined
          ? clampKasbonDeduction(kept, kasbonBalanceIdr, payIdr)
          : 0;
      return [
        {
          id: crypto.randomUUID(),
          periodId: period.id,
          employeeId: emp.id,
          daysPresent,
          alpaDays: alpaDayCount,
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

    await tx.delete(payrollLine).where(eq(payrollLine.periodId, period.id));
    if (values.length > 0) {
      await tx.insert(payrollLine).values(values);
    }

    const touchedKasbonIds: string[] = [];
    for (const line of values) {
      if (line.kasbonDeductionIdr <= 0) continue;
      const slices = await debtSlicesForEmployee(tx, line.employeeId);
      const allocated = allocatePayrollDeduction(
        slices,
        line.kasbonDeductionIdr,
      );
      for (const payment of allocated) {
        await tx.insert(kasbonPayment).values({
          id: crypto.randomUUID(),
          kasbonId: payment.kasbonId,
          amountIdr: payment.amountIdr,
          source: "payroll",
          payrollLineId: line.id,
          createdByUserId,
        });
        touchedKasbonIds.push(payment.kasbonId);
      }
    }
    await refreshKasbonStatuses(tx, touchedKasbonIds);
  });
}

export const payrollRouter = router({
  get: protectedProcedure.input(yearMonthInput).query(async ({ ctx, input }) => {
    if (isFutureYearMonth(input.year, input.month)) {
      return { period: null, lines: [] };
    }

    const today = todayYmd();
    const [yStr, mStr] = today.split("-");
    const isCurrentMonth =
      input.year === Number(yStr) && input.month === Number(mStr);

    if (!isCurrentMonth) {
      const period = await getPeriod(ctx.db, input.year, input.month);
      if (!period) {
        return { period: null, lines: [] };
      }
      const named = await linesWithNames(ctx.db, period.id);
      return {
        period,
        lines: await restrictLinesToSession(
          ctx.db,
          ctx.session.user.id,
          ctx.session.user.role,
          named,
        ),
      };
    }

    const range = monthRange(input.year, input.month);
    const persistedPeriod = await getPeriod(ctx.db, input.year, input.month);
    const { emps, attRows, jobRows } = await monthInputs(
      ctx.db,
      range.startDate,
      range.endDate,
    );
    const sisaByEmployee = await kasbonSisaByEmployee(ctx.db);
    const persistedLines = persistedPeriod
      ? await ctx.db
          .select()
          .from(payrollLine)
          .where(eq(payrollLine.periodId, persistedPeriod.id))
      : [];
    const persistedByEmp: Record<string, (typeof persistedLines)[number]> = {};
    for (const row of persistedLines) {
      persistedByEmp[row.employeeId] = row;
    }
    const paidByLine = await payrollPaidByLineIds(
      ctx.db,
      persistedLines.map((row) => row.id),
    );

    const { marksByEmp, daysPresentByEmp, onTimeDaysByEmp } =
      attendanceAggregates(attRows);
    const jobShareByEmp = jobShareByEmployee(emps, jobRows);
    const workDates = workDatesMonSat(input.year, input.month);

    const lines = emps.flatMap((emp) => {
      const daysPresent = daysPresentByEmp[emp.id] ?? 0;
      const marks = marksByEmp[emp.id] ?? {};
      const alpaDayCount = alpaDays(workDates, marks, today);
      const onTimeDays = onTimeDaysByEmp[emp.id] ?? 0;
      const isGaji = emp.payKind === "gaji";
      const jobShareIdr = isGaji ? 0 : (jobShareByEmp[emp.id] ?? 0);
      const dailyPayIdr = isGaji && emp.active ? emp.bonusIdr || 0 : 0;
      const bonusIdr = 0;
      const konsumsiIdr = (emp.uangMakanHarianIdr || 0) * onTimeDays;
      const payIdr = dailyPayIdr + jobShareIdr + konsumsiIdr;
      const persisted = persistedByEmp[emp.id];
      const liveSisa = sisaByEmployee[emp.id] ?? 0;
      const grossSisa = persisted
        ? liveSisa + (paidByLine[persisted.id] ?? 0)
        : liveSisa;
      if (
        !emp.active &&
        daysPresent === 0 &&
        jobShareIdr === 0 &&
        dailyPayIdr === 0 &&
        grossSisa === 0
      ) {
        return [];
      }
      const kasbonDeductionIdr = persisted
        ? clampKasbonDeduction(persisted.kasbonDeductionIdr, grossSisa, payIdr)
        : 0;
      return [
        {
          id: persisted?.id ?? null,
          periodId: persistedPeriod?.id ?? null,
          employeeId: emp.id,
          employeeName: emp.name,
          name: emp.name,
          daysPresent,
          alpaDays: alpaDayCount,
          ongkosPercent: emp.ongkosPercent,
          dailyPayIdr,
          jobShareIdr,
          konsumsiIdr,
          bonusIdr,
          kasbonBalanceIdr: grossSisa,
          kasbonDeductionIdr,
          takeHomeIdr: payIdr - kasbonDeductionIdr,
          kasbonRemainingIdr: persisted
            ? grossSisa - kasbonDeductionIdr
            : liveSisa,
        },
      ];
    });

    return {
      period: persistedPeriod ?? {
        id: null,
        year: input.year,
        month: input.month,
        startDate: range.startDate,
        endDate: range.endDate,
        payDate: range.payDate,
      },
      lines: await restrictLinesToSession(
        ctx.db,
        ctx.session.user.id,
        ctx.session.user.role,
        lines,
      ),
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
      const period = await getOrCreatePeriod(
        ctx.db,
        input.year,
        input.month,
      );
      await rebuildLines(
        ctx.db,
        period,
        input.keepDeductions === true,
        ctx.session.user.id,
      );
      const lines = await linesWithNames(ctx.db, period.id);
      return {
        period,
        lines,
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

      return await ctx.db.transaction(async (tx) => {
        const oldPays = await tx
          .select()
          .from(kasbonPayment)
          .where(
            and(
              eq(kasbonPayment.source, "payroll"),
              eq(kasbonPayment.payrollLineId, line.id),
            ),
          );
        await tx
          .delete(kasbonPayment)
          .where(
            and(
              eq(kasbonPayment.source, "payroll"),
              eq(kasbonPayment.payrollLineId, line.id),
            ),
          );

        const slices = await debtSlicesForEmployee(tx, line.employeeId);
        const grossSisa = slices.reduce((sum, slice) => {
          const sisa = slice.amountIdr - slice.paidIdr;
          return sisa > 0 ? sum + sisa : sum;
        }, 0);
        const payIdr =
          line.dailyPayIdr + line.jobShareIdr + line.konsumsiIdr;
        if (input.kasbonDeductionIdr > grossSisa) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Potongan kasbon melebihi saldo",
          });
        }
        if (input.kasbonDeductionIdr > payIdr) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Potongan kasbon melebihi gaji",
          });
        }

        const allocated = allocatePayrollDeduction(
          slices,
          input.kasbonDeductionIdr,
        );
        for (const payment of allocated) {
          await tx.insert(kasbonPayment).values({
            id: crypto.randomUUID(),
            kasbonId: payment.kasbonId,
            amountIdr: payment.amountIdr,
            source: "payroll",
            payrollLineId: line.id,
            createdByUserId: ctx.session.user.id,
          });
        }

        const takeHomeIdr = payIdr - input.kasbonDeductionIdr;
        const kasbonRemainingIdr = grossSisa - input.kasbonDeductionIdr;
        const updated = await tx
          .update(payrollLine)
          .set({
            kasbonBalanceIdr: grossSisa,
            kasbonDeductionIdr: input.kasbonDeductionIdr,
            takeHomeIdr,
            kasbonRemainingIdr,
          })
          .where(eq(payrollLine.id, line.id))
          .returning();

        await refreshKasbonStatuses(tx, [
          ...oldPays.map((row) => row.kasbonId),
          ...allocated.map((row) => row.kasbonId),
        ]);

        return updated[0]!;
      });
    }),
});
