import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export const supervisorProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.session.user.role ?? "mekanik";
  if (role !== "supervisor") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Supervisor only" });
  }
  return next();
});

export const kasirProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.session.user.role ?? "mekanik";
  if (role !== "kasir" && role !== "supervisor") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Kasir or supervisor only",
    });
  }
  return next();
});
