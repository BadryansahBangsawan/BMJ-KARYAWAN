import { hashPassword } from "@BMJ-KARYAWAN/auth";
import type { Database } from "@BMJ-KARYAWAN/db";
import { account, user } from "@BMJ-KARYAWAN/db/schema/auth";
import { employee } from "@BMJ-KARYAWAN/db/schema/karyawan";
import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { kasirProcedure, protectedProcedure, router, supervisorProcedure } from "../index";

const roleSchema = z.enum(["supervisor", "kasir", "mekanik"]);
const payKindSchema = z.enum(["gaji", "persenan"]);
type Role = z.infer<typeof roleSchema>;

async function assertUniqueActiveName(
  db: Database,
  name: string,
  exceptId?: string,
) {
  const normalized = name.trim().toLowerCase();
  const [row] = await db
    .select({ id: employee.id })
    .from(employee)
    .where(
      and(
        eq(employee.active, true),
        sql`lower(${employee.name}) = ${normalized}`,
        exceptId ? ne(employee.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (row) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Employee name already exists",
    });
  }
}

async function findUserByEmail(db: Database, email: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

async function signUpWithRole(
  db: Database,
  input: { name: string; email: string; password: string; role: Role },
) {
  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: "Email already exists" });
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  try {
    await db.insert(user).values({
      id: userId,
      name: input.name,
      email: input.email.trim(),
      emailVerified: true,
      role: input.role,
    });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
  } catch {
    throw new TRPCError({ code: "CONFLICT", message: "Email already exists" });
  }
  return userId;
}

async function setCredentialPassword(db: Database, userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [acct] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (acct) {
    await db.update(account).set({ password: passwordHash }).where(eq(account.id, acct.id));
    return;
  }
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
  });
}

async function assertUserIdFree(
  db: Database,
  userId: string,
  exceptEmployeeId?: string,
) {
  const [taken] = await db
    .select({ id: employee.id })
    .from(employee)
    .where(
      and(
        eq(employee.userId, userId),
        exceptEmployeeId ? ne(employee.id, exceptEmployeeId) : undefined,
      ),
    )
    .limit(1);
  if (taken) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "User already assigned",
    });
  }
}

export const employeeRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(employee)
      .where(eq(employee.userId, ctx.session.user.id))
      .limit(1);
    return row ?? null;
  }),

  list: kasirProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: employee.id,
        userId: employee.userId,
        name: employee.name,
        role: employee.role,
        payKind: employee.payKind,
        ongkosPercent: employee.ongkosPercent,
        konsumsiMonthlyIdr: employee.konsumsiMonthlyIdr,
        bonusIdr: employee.bonusIdr,
        active: employee.active,
        createdAt: employee.createdAt,
        email: user.email,
      })
      .from(employee)
      .leftJoin(user, eq(employee.userId, user.id))
      .orderBy(employee.name);
  }),

  create: supervisorProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        role: roleSchema,
        email: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
          z.email().optional(),
        ),
        password: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
          z.string().min(8).optional(),
        ),
        ongkosPercent: z.number().int().min(0).max(100),
        payKind: payKindSchema,
        konsumsiMonthlyIdr: z.number().int().min(0),
        bonusIdr: z.number().int().min(0),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const hasEmail = input.email !== undefined;
      const hasPassword = input.password !== undefined;
      if (hasEmail !== hasPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email and password are both required to create a login",
        });
      }

      if (input.active) {
        await assertUniqueActiveName(ctx.db, input.name);
      }

      let userId: string | null = null;
      if (input.email && input.password) {
        userId = await signUpWithRole(ctx.db, {
          name: input.name,
          email: input.email,
          password: input.password,
          role: input.role,
        });
      }

      const [row] = await ctx.db
        .insert(employee)
        .values({
          id: crypto.randomUUID(),
          name: input.name,
          role: input.role,
          payKind: input.payKind,
          ongkosPercent: input.payKind === "gaji" ? 0 : input.ongkosPercent,
          konsumsiMonthlyIdr: input.konsumsiMonthlyIdr,
          bonusIdr: input.payKind === "gaji" ? input.bonusIdr : 0,
          active: input.active,
          userId,
        })
        .returning();
      return row;
    }),

  update: supervisorProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).optional(),
        role: roleSchema.optional(),
        payKind: payKindSchema.optional(),
        ongkosPercent: z.number().int().min(0).max(100).optional(),
        konsumsiMonthlyIdr: z.number().int().min(0).optional(),
        bonusIdr: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
        email: z.email().nullable().optional(),
        password: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
          z.string().min(8).optional(),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(employee)
        .where(eq(employee.id, input.id))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      const nextName = input.name ?? existing.name;
      const nextActive = input.active ?? existing.active;
      const nextRole = input.role ?? (existing.role as Role);

      if (nextActive) {
        await assertUniqueActiveName(ctx.db, nextName, existing.id);
      }

      let nextUserId: string | null | undefined;
      if (input.email === null) {
        nextUserId = null;
      } else if (input.email !== undefined) {
        const emailUser = await findUserByEmail(ctx.db, input.email);
        if (emailUser) {
          if (existing.userId !== emailUser.id) {
            if (input.password) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Email already exists",
              });
            }
            await assertUserIdFree(ctx.db, emailUser.id, existing.id);
          }
          nextUserId = emailUser.id;
          await ctx.db
            .update(user)
            .set({ role: nextRole })
            .where(eq(user.id, emailUser.id));
          if (input.password && existing.userId === emailUser.id) {
            await setCredentialPassword(ctx.db, emailUser.id, input.password);
          }
        } else {
          if (!input.password) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Password required to create user",
            });
          }
          nextUserId = await signUpWithRole(ctx.db, {
            name: nextName,
            email: input.email,
            password: input.password,
            role: nextRole,
          });
        }
      } else if (input.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email and password are both required to create a login",
        });
      }

      if (nextUserId === undefined && existing.userId && input.role) {
        await ctx.db
          .update(user)
          .set({ role: nextRole })
          .where(eq(user.id, existing.userId));
      }

      const [row] = await ctx.db
        .update(employee)
        .set({
          name: nextName,
          role: nextRole,
          payKind: input.payKind ?? existing.payKind,
          ongkosPercent:
            (input.payKind ?? existing.payKind) === "gaji"
              ? 0
              : (input.ongkosPercent ?? existing.ongkosPercent),
          konsumsiMonthlyIdr: input.konsumsiMonthlyIdr ?? existing.konsumsiMonthlyIdr,
          bonusIdr:
            (input.payKind ?? existing.payKind) === "persenan"
              ? 0
              : (input.bonusIdr ?? existing.bonusIdr),
          active: nextActive,
          ...(nextUserId !== undefined ? { userId: nextUserId } : {}),
        })
        .where(eq(employee.id, existing.id))
        .returning();
      return row;
    }),

  assignUser: supervisorProcedure
    .input(
      z.object({
        employeeId: z.string().min(1),
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(employee)
        .where(eq(employee.id, input.employeeId))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }

      const [authUser] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);
      if (!authUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await assertUserIdFree(ctx.db, input.userId, existing.id);

      await ctx.db
        .update(user)
        .set({ role: existing.role })
        .where(eq(user.id, input.userId));

      const [row] = await ctx.db
        .update(employee)
        .set({ userId: input.userId })
        .where(eq(employee.id, existing.id))
        .returning();
      return row;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        image: z
          .string()
          .max(80_000)
          .refine((value) => value.startsWith("data:image/jpeg"), "Foto harus JPEG")
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [mine] = await ctx.db
        .select()
        .from(employee)
        .where(eq(employee.userId, userId))
        .limit(1);
      if (mine?.active) {
        await assertUniqueActiveName(ctx.db, input.name, mine.id);
      }

      await ctx.db
        .update(user)
        .set({
          name: input.name,
          ...(input.image !== undefined ? { image: input.image } : {}),
        })
        .where(eq(user.id, userId));

      if (mine) {
        await ctx.db
          .update(employee)
          .set({ name: input.name })
          .where(eq(employee.id, mine.id));
      }

      return { name: input.name };
    }),
});
