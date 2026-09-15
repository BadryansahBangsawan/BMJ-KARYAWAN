import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@BMJ-KARYAWAN/db";
import { employee, kasbon, kasbonPayment } from "@BMJ-KARYAWAN/db/schema/karyawan";

import {
  kasirProcedure,
  protectedProcedure,
  router,
  supervisorProcedure,
} from "../index";

const kasbonStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "disbursed",
  "lunas",
]);

type Role = "supervisor" | "kasir" | "mekanik";

function sessionRole(role: string | null | undefined): Role {
  if (role === "supervisor" || role === "kasir" || role === "mekanik") {
    return role;
  }
  return "mekanik";
}

async function employeeByUserId(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(employee)
    .where(eq(employee.userId, userId))
    .limit(1);
  return row ?? null;
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

export const kasbonRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: kasbonStatus.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const role = sessionRole(ctx.session.user.role);
      const filters = [];

      if (role === "mekanik") {
        const me = await employeeByUserId(ctx.db, ctx.session.user.id);
        if (!me) return [];
        filters.push(eq(kasbon.employeeId, me.id));
      }

      if (input?.status) {
        filters.push(eq(kasbon.status, input.status));
      }

      const rows = await ctx.db
        .select({
          kasbon,
          employeeName: employee.name,
        })
        .from(kasbon)
        .innerJoin(employee, eq(kasbon.employeeId, employee.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(kasbon.createdAt));

      const totals = await paymentTotals(
        ctx.db,
        rows.map((row) => row.kasbon.id),
      );
      return rows.map((row) => {
        const paidIdr = totals[row.kasbon.id] ?? 0;
        return {
          ...row.kasbon,
          employeeName: row.employeeName,
          paidIdr,
          sisaIdr: row.kasbon.amountIdr - paidIdr,
        };
      });
    }),

  summary: kasirProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        kasbon,
        employeeName: employee.name,
      })
      .from(kasbon)
      .innerJoin(employee, eq(kasbon.employeeId, employee.id))
      .where(inArray(kasbon.status, ["disbursed", "lunas"]));

    const totals = await paymentTotals(
      ctx.db,
      rows.map((row) => row.kasbon.id),
    );

    let ttlAmount = 0;
    let ttlPaid = 0;
    const byEmployee: Record<
      string,
      { employeeId: string; name: string; sisa: number }
    > = {};

    for (const row of rows) {
      const paidIdr = totals[row.kasbon.id] ?? 0;
      const sisa = row.kasbon.amountIdr - paidIdr;
      ttlAmount += row.kasbon.amountIdr;
      ttlPaid += paidIdr;
      const current = byEmployee[row.kasbon.employeeId];
      if (current) {
        current.sisa += sisa;
      } else {
        byEmployee[row.kasbon.employeeId] = {
          employeeId: row.kasbon.employeeId,
          name: row.employeeName,
          sisa,
        };
      }
    }

    return {
      ttlAmount,
      ttlPaid,
      ttlSisa: ttlAmount - ttlPaid,
      employees: Object.values(byEmployee).sort((a, b) =>
        a.name.localeCompare(b.name, "id"),
      ),
    };
  }),

  create: protectedProcedure
    .input(
      z.object({
        keperluan: z.string().trim().min(1),
        amountIdr: z.number().int().positive(),
        employeeId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = sessionRole(ctx.session.user.role);
      const me = await employeeByUserId(ctx.db, ctx.session.user.id);

      let employeeId = me?.id;
      if (role === "supervisor" && input.employeeId) {
        employeeId = input.employeeId;
      } else if (input.employeeId && input.employeeId !== me?.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Tidak bisa mengajukan kasbon untuk orang lain",
        });
      }

      if (!employeeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Karyawan tidak ditemukan",
        });
      }

      const target = await ctx.db
        .select({ id: employee.id })
        .from(employee)
        .where(eq(employee.id, employeeId))
        .limit(1);
      if (!target[0]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Karyawan tidak ditemukan",
        });
      }

      const id = crypto.randomUUID();
      const inserted = await ctx.db
        .insert(kasbon)
        .values({
          id,
          employeeId,
          keperluan: input.keperluan,
          amountIdr: input.amountIdr,
          status: "pending",
          requestedByUserId: ctx.session.user.id,
        })
        .returning();

      return inserted[0]!;
    }),

  approve: supervisorProcedure
    .input(z.object({ kasbonId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(kasbon)
        .where(eq(kasbon.id, input.kasbonId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Kasbon tidak ditemukan",
        });
      }
      if (row.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kasbon tidak dalam status pending",
        });
      }

      const updated = await ctx.db
        .update(kasbon)
        .set({
          status: "approved",
          approvedByUserId: ctx.session.user.id,
          approvedAt: new Date(),
        })
        .where(eq(kasbon.id, row.id))
        .returning();

      return updated[0]!;
    }),

  reject: supervisorProcedure
    .input(
      z.object({
        kasbonId: z.string().min(1),
        reason: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(kasbon)
        .where(eq(kasbon.id, input.kasbonId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Kasbon tidak ditemukan",
        });
      }
      if (row.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kasbon tidak dalam status pending",
        });
      }

      const updated = await ctx.db
        .update(kasbon)
        .set({
          status: "rejected",
          rejectedReason: input.reason,
        })
        .where(eq(kasbon.id, row.id))
        .returning();

      return updated[0]!;
    }),

  disburse: kasirProcedure
    .input(z.object({ kasbonId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(kasbon)
        .where(eq(kasbon.id, input.kasbonId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Kasbon tidak ditemukan",
        });
      }
      if (row.status !== "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kasbon tidak dalam status approved",
        });
      }

      const updated = await ctx.db
        .update(kasbon)
        .set({
          status: "disbursed",
          disbursedByUserId: ctx.session.user.id,
          disbursedAt: new Date(),
        })
        .where(eq(kasbon.id, row.id))
        .returning();

      return updated[0]!;
    }),

  addPayment: kasirProcedure
    .input(
      z.object({
        kasbonId: z.string().min(1),
        amountIdr: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(kasbon)
        .where(eq(kasbon.id, input.kasbonId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Kasbon tidak ditemukan",
        });
      }
      if (row.status !== "disbursed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kasbon tidak dalam status disbursed",
        });
      }

      const totals = await paymentTotals(ctx.db, [row.id]);
      const paidIdr = totals[row.id] ?? 0;
      const sisa = row.amountIdr - paidIdr;
      if (input.amountIdr > sisa) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pembayaran melebihi sisa kasbon",
        });
      }

      const paymentId = crypto.randomUUID();
      const paymentRows = await ctx.db
        .insert(kasbonPayment)
        .values({
          id: paymentId,
          kasbonId: row.id,
          amountIdr: input.amountIdr,
          source: "manual",
          createdByUserId: ctx.session.user.id,
        })
        .returning();

      const nextSisa = sisa - input.amountIdr;
      let nextStatus = row.status;
      if (nextSisa <= 0) {
        const lunas = await ctx.db
          .update(kasbon)
          .set({ status: "lunas" })
          .where(eq(kasbon.id, row.id))
          .returning();
        nextStatus = lunas[0]?.status ?? "lunas";
      }

      return {
        payment: paymentRows[0]!,
        kasbon: { ...row, status: nextStatus },
        sisaIdr: nextSisa,
      };
    }),
});
