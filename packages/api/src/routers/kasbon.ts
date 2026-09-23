import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { employee, kasbon, kasbonPayment } from "@BMJ-KARYAWAN/db/schema/karyawan";

import {
  kasirProcedure,
  protectedProcedure,
  router,
  supervisorProcedure,
} from "../index";
import { kasbonStatusAfterSisa, sessionRole } from "../lib/domain";
import { employeeByUserId, paymentTotals } from "../lib/workshop-db";


const kasbonStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "disbursed",
  "lunas",
]);


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
        employeeId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = sessionRole(ctx.session.user.role);

      let employeeId: string | undefined;
      if (role === "supervisor") {
        const requested = input.employeeId?.trim();
        if (!requested) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pilih karyawan.",
          });
        }
        employeeId = requested;
      } else {
        const me = await employeeByUserId(ctx.db, ctx.session.user.id);
        if (input.employeeId && input.employeeId !== me?.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Tidak bisa mengajukan kasbon untuk orang lain",
          });
        }
        employeeId = me?.id;
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

      return await ctx.db.transaction(async (tx) => {
        const totals = await paymentTotals(tx, [row.id]);
        const paidIdr = totals[row.id] ?? 0;
        const sisa = row.amountIdr - paidIdr;
        if (input.amountIdr > sisa) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pembayaran melebihi sisa kasbon",
          });
        }

        const paymentId = crypto.randomUUID();
        const paymentRows = await tx
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
        const nextStatus = kasbonStatusAfterSisa(nextSisa);
        await tx
          .update(kasbon)
          .set({ status: nextStatus })
          .where(eq(kasbon.id, row.id));

        return {
          payment: paymentRows[0]!,
          kasbon: { ...row, status: nextStatus },
          sisaIdr: nextSisa,
        };
      });
    }),
});
