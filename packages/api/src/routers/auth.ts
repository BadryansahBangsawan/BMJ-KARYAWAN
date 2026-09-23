import { hashPassword } from "@BMJ-KARYAWAN/auth";
import { account, user } from "@BMJ-KARYAWAN/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const authRouter = router({
  bootstrapNeeded: publicProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select({ n: count() }).from(user);
    return { needed: (row?.n ?? 0) === 0 };
  }),

  bootstrapSupervisor: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        email: z.email(),
        password: z.string().min(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.select({ n: count() }).from(user);
      if ((row?.n ?? 0) > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bootstrap already completed",
        });
      }

      const userId = crypto.randomUUID();
      const passwordHash = await hashPassword(input.password);
      try {
        await ctx.db.transaction(async (tx) => {
          await tx.insert(user).values({
            id: userId,
            name: input.name,
            email: input.email.trim(),
            emailVerified: true,
            role: "supervisor",
          });
          await tx.insert(account).values({
            id: crypto.randomUUID(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: passwordHash,
          });
        });
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bootstrap already completed",
        });
      }

      const all = await ctx.db
        .select({ id: user.id })
        .from(user)
        .orderBy(asc(user.createdAt), asc(user.id));
      if (all.length > 1) {
        const winnerId = all[0]!.id;
        if (winnerId !== userId) {
          await ctx.db.delete(user).where(eq(user.id, userId));
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bootstrap already completed",
          });
        }
        for (const extra of all.slice(1)) {
          await ctx.db.delete(user).where(eq(user.id, extra.id));
        }
      }

      return { ok: true as const, userId };
    }),
});
