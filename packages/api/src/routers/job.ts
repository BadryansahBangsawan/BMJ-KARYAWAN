import type { Database } from "@BMJ-KARYAWAN/db";
import { employee, job, payrollLine, payrollPeriod } from "@BMJ-KARYAWAN/db/schema/karyawan";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";


import { protectedProcedure, router, supervisorProcedure } from "../index";

const TZ = "Asia/Jayapura";
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const jobStatusSchema = z.enum(["proses", "selesai", "diterima", "batal"]);
const jobKindSchema = z.enum(["ongkos", "persenan"]);

type Role = "supervisor" | "kasir" | "mekanik";

function roleOf(user: { role?: string | null }): Role {
  if (user.role === "supervisor" || user.role === "kasir" || user.role === "mekanik") {
    return user.role;
  }
  return "mekanik";
}

function currentMonthRange(now = new Date()) {
  const date = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const [yearStr, monthStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${yearStr}-${monthStr}-01`,
    to: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

function todayYmd(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}


async function employeeByUserId(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(employee)
    .where(eq(employee.userId, userId))
    .limit(1);
  return row ?? null;
}

async function assertJobUnlocked(
  db: Database,
  employeeId: string,
  workDate: string,
) {
  const [row] = await db
    .select({ id: payrollPeriod.id })
    .from(payrollPeriod)
    .innerJoin(payrollLine, eq(payrollLine.periodId, payrollPeriod.id))
    .where(
      and(
        eq(payrollPeriod.status, "finalized"),
        eq(payrollLine.employeeId, employeeId),
        lte(payrollPeriod.startDate, workDate),
        gte(payrollPeriod.endDate, workDate),
      ),
    )
    .limit(1);
  if (row) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Periode gaji sudah dikunci",
    });
  }
}

export const jobRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          employeeId: z.string().min(1).optional(),
          from: ymd.optional(),
          to: ymd.optional(),
          status: jobStatusSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const role = roleOf(ctx.session.user);
      const range = currentMonthRange();
      const from = input?.from ?? range.from;
      const to = input?.to ?? range.to;

      let employeeId = input?.employeeId;
      if (role === "mekanik") {
        const own = await employeeByUserId(ctx.db, ctx.session.user.id);
        if (!own) {
          return [];
        }
        employeeId = own.id;
      }

      return ctx.db
        .select({
          id: job.id,
          employeeId: job.employeeId,
          employeeName: employee.name,
          workDate: job.workDate,
          description: job.description,
          amountIdr: job.amountIdr,
          struk: sql<string | null>`case when ${job.struk} like 'data:%' then null else ${job.struk} end`.as(
            "struk",
          ),
          customerNote: job.customerNote,
          status: job.status,
          kind: job.kind,
          bengkelPercent: job.bengkelPercent,
          sheetNo: job.sheetNo,
          createdByUserId: job.createdByUserId,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })
        .from(job)
        .innerJoin(employee, eq(job.employeeId, employee.id))
        .where(
          and(
            gte(job.workDate, from),
            lte(job.workDate, to),
            employeeId ? eq(job.employeeId, employeeId) : undefined,
            input?.status ? eq(job.status, input.status) : undefined,
          ),
        )
        .orderBy(desc(job.workDate), desc(job.createdAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        employeeId: z.string().min(1).optional(),
        workDate: ymd,
        description: z.string().trim().min(1),
        amountIdr: z.number().int().positive(),
        struk: z
          .string()
          .trim()
          .max(120)
          .optional()
          .transform((value) =>
            !value || value.startsWith("data:") ? undefined : value,
          ),
        customerNote: z.string().optional(),
        kind: jobKindSchema,
        bengkelPercent: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = roleOf(ctx.session.user);
      if (role === "kasir") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const kind = role === "mekanik" ? "ongkos" : input.kind;
      const workDate = role === "mekanik" ? todayYmd() : input.workDate;
      if (workDate > todayYmd()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tidak bisa catat pekerjaan di tanggal yang belum terjadi",
        });
      }

      if (kind === "persenan" && input.bengkelPercent === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "bengkelPercent required (0–100)",
        });
      }

      let targetId: string;
      if (role === "mekanik") {
        const own = await employeeByUserId(ctx.db, ctx.session.user.id);
        if (!own) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Employee not found",
          });
        }
        if (input.employeeId && input.employeeId !== own.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        targetId = own.id;
      } else {
        if (!input.employeeId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "employeeId required",
          });
        }
        const [target] = await ctx.db
          .select()
          .from(employee)
          .where(eq(employee.id, input.employeeId))
          .limit(1);
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Employee not found",
          });
        }
        if (target.role !== "mekanik") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Jobs can only be created for mekanik",
          });
        }
        targetId = input.employeeId;
      }

      await assertJobUnlocked(ctx.db, targetId, workDate);

      const [row] = await ctx.db
        .insert(job)
        .values({
          id: crypto.randomUUID(),
          employeeId: targetId,
          workDate,
          description: input.description,
          amountIdr: input.amountIdr,
          struk: input.struk ?? null,
          customerNote: input.customerNote ?? null,
          status: role === "mekanik" ? "diterima" : "proses",
          kind,
          bengkelPercent: kind === "persenan" ? (input.bengkelPercent ?? null) : null,
          createdByUserId: ctx.session.user.id,
        })
        .returning();
      return row;
    }),

  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(["selesai", "diterima", "batal"]),
        struk: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = roleOf(ctx.session.user);
      if (role === "mekanik") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [row] = await ctx.db
        .select()
        .from(job)
        .where(eq(job.id, input.id))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      if (row.status === input.status) {
        return row;
      }

      if (input.status === "diterima") {
        if (role !== "kasir" && role !== "supervisor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (row.status !== "proses" && row.status !== "selesai") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid status transition",
          });
        }
        await assertJobUnlocked(ctx.db, row.employeeId, row.workDate);
      } else if (input.status === "batal") {
        if (role !== "supervisor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (row.status === "diterima") {
          await assertJobUnlocked(ctx.db, row.employeeId, row.workDate);
        }
      } else {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [updated] = await ctx.db
        .update(job)
        .set({
          status: input.status,
          ...(input.struk !== undefined ? { struk: input.struk } : {}),
          updatedAt: new Date(),
        })
        .where(eq(job.id, row.id))
        .returning();
      return updated;
    }),

  update: supervisorProcedure
    .input(
      z.object({
        id: z.string().min(1),
        workDate: ymd.optional(),
        description: z.string().trim().min(1).optional(),
        amountIdr: z.number().int().positive().optional(),
        struk: z
          .string()
          .trim()
          .max(120)
          .nullable()
          .optional()
          .transform((value) =>
            value == null || value.startsWith("data:") ? null : value,
          ),
        customerNote: z.string().nullable().optional(),
        bengkelPercent: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(job)
        .where(eq(job.id, input.id))
        .limit(1);
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      await assertJobUnlocked(ctx.db, row.employeeId, row.workDate);
      if (input.workDate && input.workDate !== row.workDate) {
        if (input.workDate > todayYmd()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tidak bisa catat pekerjaan di tanggal yang belum terjadi",
          });
        }
        await assertJobUnlocked(ctx.db, row.employeeId, input.workDate);
      }

      if (row.kind === "persenan" && input.bengkelPercent === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "bengkelPercent required (0–100)",
        });
      }

      const [updated] = await ctx.db
        .update(job)
        .set({
          workDate: input.workDate ?? row.workDate,
          description: input.description ?? row.description,
          amountIdr: input.amountIdr ?? row.amountIdr,
          struk: input.struk !== undefined ? input.struk : row.struk,
          customerNote:
            input.customerNote !== undefined
              ? input.customerNote
              : row.customerNote,
          bengkelPercent:
            input.bengkelPercent !== undefined
              ? input.bengkelPercent
              : row.bengkelPercent,
          updatedAt: new Date(),
        })
        .where(eq(job.id, row.id))
        .returning();
      return updated;
    }),
});
