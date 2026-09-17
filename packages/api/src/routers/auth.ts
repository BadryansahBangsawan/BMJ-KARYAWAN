import { createAuth, type AuthConfig } from "@BMJ-KARYAWAN/auth";
import { user } from "@BMJ-KARYAWAN/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { env } from "cloudflare:workers";
import { count, eq } from "drizzle-orm";
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

      const auth = createAuth(env as AuthConfig, ctx.db);
      const result = await auth.api.signUpEmail({
        body: {
          name: input.name,
          email: input.email,
          password: input.password,
        },
      });

      await ctx.db
        .update(user)
        .set({ role: "supervisor", emailVerified: true })
        .where(eq(user.id, result.user.id));

      return { ok: true as const, userId: result.user.id };
    }),
});
