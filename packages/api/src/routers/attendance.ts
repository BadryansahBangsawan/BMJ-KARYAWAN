import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@BMJ-KARYAWAN/db";
import { attendance, employee } from "@BMJ-KARYAWAN/db/schema/karyawan";

import {
  protectedProcedure,
  router,
  supervisorProcedure,
} from "../index";

// ---------------------------------------------------------------------------
// Workshop location — update these coordinates to match the real workshop.
// Radius is in metres; 50m keeps clock-in on the workshop lot.
// ---------------------------------------------------------------------------
const WORKSHOP_LAT = -1.8779371;  // Jl. Mariadei No.55, Serui, Kab. Kepulauan Yapen
const WORKSHOP_LNG = 136.2299775; // Jl. Mariadei No.55, Serui, Kab. Kepulauan Yapen
const CHECKIN_RADIUS_M = 50;

/** Haversine distance in metres between two WGS-84 coordinates. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000; // Earth radius in metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Role = "supervisor" | "kasir" | "mekanik";

function sessionRole(role: string | null | undefined): Role {
  if (role === "supervisor" || role === "kasir" || role === "mekanik") {
    return role;
  }
  return "mekanik";
}

function monthRange(year: number, month: number) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${ym}-01`, endDate: `${ym}-${String(last).padStart(2, "0")}` };
}

function isSundayJayapura(workDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate);
  if (!match) return true;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return true;
  }
  return utc.getUTCDay() === 0;
}

function workDatesMonSat(year: number, month: number) {
  const { endDate } = monthRange(year, month);
  const last = Number(endDate.slice(8));
  const dates: string[] = [];
  for (let day = 1; day <= last; day++) {
    const workDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isSundayJayapura(workDate)) dates.push(workDate);
  }
  return dates;
}

async function employeeByUserId(db: Database, userId: string) {
  const [row] = await db
    .select()
    .from(employee)
    .where(eq(employee.userId, userId))
    .limit(1);
  return row ?? null;
}

const TZ = "Asia/Jayapura";

function todayYmdJayapura() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function jayapuraMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function selfCheckinValue(now = new Date()) {
  const mins = jayapuraMinutes(now);
  if (mins < 6 * 60) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Absen masuk mulai jam 06:00",
    });
  }
  if (mins <= 8 * 60 + 59) return 100;
  if (mins <= 9 * 60 + 29) return 90;
  if (mins <= 12 * 60) return 50;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Absen masuk hanya sampai jam 12:00",
  });
}

function assertNotFutureWorkDate(workDate: string) {
  if (workDate > todayYmdJayapura()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tidak bisa absen untuk tanggal yang belum terjadi",
    });
  }
}


function assertWorkshopPresence(lat: number, lng: number, workDate: string) {
  if (isSundayJayapura(workDate)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Hari Minggu tidak bisa absen",
    });
  }
  const distM = haversineM(lat, lng, WORKSHOP_LAT, WORKSHOP_LNG);
  if (distM > CHECKIN_RADIUS_M) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Lokasi terlalu jauh dari bengkel (${Math.round(distM)} m). Absen hanya bisa dilakukan di bengkel.`,
    });
  }
}

export const attendanceRouter = router({
  mineToday: protectedProcedure.query(async ({ ctx }) => {
    const me = await employeeByUserId(ctx.db, ctx.session.user.id);
    if (!me) return null;
    const workDate = todayYmdJayapura();
    const [row] = await ctx.db
      .select({
        id: attendance.id,
        employeeId: attendance.employeeId,
        workDate: attendance.workDate,
        value: attendance.value,
        checkInAt: attendance.checkInAt,
        checkOutAt: attendance.checkOutAt,
      })
      .from(attendance)
      .where(and(eq(attendance.employeeId, me.id), eq(attendance.workDate, workDate)))
      .limit(1);
    return row ?? null;
  }),

  selfCheckin: protectedProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        photo: z
          .string()
          .min(32)
          .max(80_000)
          .refine((value) => value.startsWith("data:image/"), "Foto absen wajib"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workDate = todayYmdJayapura();
      if (input.workDate !== workDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absen masuk hanya untuk hari ini",
        });
      }
      assertWorkshopPresence(input.lat, input.lng, workDate);

      const me = await employeeByUserId(ctx.db, ctx.session.user.id);
      if (!me) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data karyawan tidak ditemukan. Hubungi supervisor.",
        });
      }

      const [existing] = await ctx.db
        .select({
          id: attendance.id,
          checkInAt: attendance.checkInAt,
        })
        .from(attendance)
        .where(and(eq(attendance.employeeId, me.id), eq(attendance.workDate, workDate)))
        .limit(1);

      if (existing?.checkInAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sudah absen masuk hari ini",
        });
      }

      const now = new Date();
      const value = selfCheckinValue(now);
      if (existing) {
        const [updated] = await ctx.db
          .update(attendance)
          .set({
            value,
            markedByUserId: ctx.session.user.id,
            checkInAt: now,
            checkInPhoto: input.photo,
          })
          .where(eq(attendance.id, existing.id))
          .returning({
            id: attendance.id,
            employeeId: attendance.employeeId,
            workDate: attendance.workDate,
            value: attendance.value,
            checkInAt: attendance.checkInAt,
            checkOutAt: attendance.checkOutAt,
          });
        return updated!;
      }

      const [inserted] = await ctx.db
        .insert(attendance)
        .values({
          id: crypto.randomUUID(),
          employeeId: me.id,
          workDate,
          value,
          markedByUserId: ctx.session.user.id,
          checkInAt: now,
          checkInPhoto: input.photo,
        })
        .returning({
          id: attendance.id,
          employeeId: attendance.employeeId,
          workDate: attendance.workDate,
          value: attendance.value,
          checkInAt: attendance.checkInAt,
          checkOutAt: attendance.checkOutAt,
        });
      return inserted!;
    }),

  selfCheckout: protectedProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        photo: z
          .string()
          .min(32)
          .max(80_000)
          .refine((value) => value.startsWith("data:image/"), "Foto absen wajib"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workDate = todayYmdJayapura();
      if (input.workDate !== workDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absen pulang hanya untuk hari ini",
        });
      }
      assertWorkshopPresence(input.lat, input.lng, workDate);

      const me = await employeeByUserId(ctx.db, ctx.session.user.id);
      if (!me) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data karyawan tidak ditemukan. Hubungi supervisor.",
        });
      }

      const [existing] = await ctx.db
        .select({
          id: attendance.id,
          checkInAt: attendance.checkInAt,
          checkOutAt: attendance.checkOutAt,
        })
        .from(attendance)
        .where(and(eq(attendance.employeeId, me.id), eq(attendance.workDate, workDate)))
        .limit(1);

      if (!existing?.checkInAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Absen masuk dulu sebelum pulang",
        });
      }
      if (existing.checkOutAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sudah absen pulang hari ini",
        });
      }

      const [updated] = await ctx.db
        .update(attendance)
        .set({
          markedByUserId: ctx.session.user.id,
          checkOutAt: new Date(),
          checkOutPhoto: input.photo,
        })
        .where(eq(attendance.id, existing.id))
        .returning({
          id: attendance.id,
          employeeId: attendance.employeeId,
          workDate: attendance.workDate,
          value: attendance.value,
          checkInAt: attendance.checkInAt,
          checkOutAt: attendance.checkOutAt,
        });
      return updated!;
    }),

  month: protectedProcedure
    .input(
      z.object({
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const role = sessionRole(ctx.session.user.role);
      const { startDate, endDate } = monthRange(input.year, input.month);
      const days = workDatesMonSat(input.year, input.month);

      let employees;
      if (role === "supervisor") {
        employees = await ctx.db
          .select()
          .from(employee)
          .where(and(eq(employee.active, true), ne(employee.role, "supervisor")))
          .orderBy(asc(employee.name));
      } else {
        const me = await employeeByUserId(ctx.db, ctx.session.user.id);
        employees = me ? [me] : [];
      }

      const employeeIds = employees.map((row) => row.id);
      const marks =
        employeeIds.length === 0
          ? []
          : await ctx.db
              .select({
                id: attendance.id,
                employeeId: attendance.employeeId,
                workDate: attendance.workDate,
                value: attendance.value,
              })
              .from(attendance)
              .where(
                and(
                  gte(attendance.workDate, startDate),
                  lte(attendance.workDate, endDate),
                  inArray(attendance.employeeId, employeeIds),
                ),
              );

      return {
        year: input.year,
        month: input.month,
        startDate,
        endDate,
        days,
        employees: employees.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
        })),
        marks: marks.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          workDate: row.workDate,
          value: row.value,
        })),
      };
    }),

  set: supervisorProcedure
    .input(
      z.object({
        employeeId: z.string().min(1),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        value: z.union([z.literal(0), z.literal(50), z.literal(90), z.literal(100)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertNotFutureWorkDate(input.workDate);
      if (isSundayJayapura(input.workDate)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Hari Minggu tidak diisi",
        });
      }

      const target = await ctx.db
        .select()
        .from(employee)
        .where(eq(employee.id, input.employeeId))
        .limit(1);
      if (!target[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Karyawan tidak ditemukan",
        });
      }

      const existing = await ctx.db
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.employeeId, input.employeeId),
            eq(attendance.workDate, input.workDate),
          ),
        )
        .limit(1);

      if (existing[0]) {
        const updated = await ctx.db
          .update(attendance)
          .set({
            value: input.value,
            markedByUserId: ctx.session.user.id,
          })
          .where(eq(attendance.id, existing[0].id))
          .returning();
        return updated[0]!;
      }

      const inserted = await ctx.db
        .insert(attendance)
        .values({
          id: crypto.randomUUID(),
          employeeId: input.employeeId,
          workDate: input.workDate,
          value: input.value,
          markedByUserId: ctx.session.user.id,
        })
        .returning();
      return inserted[0]!;
    }),

  clear: supervisorProcedure
    .input(
      z.object({
        employeeId: z.string().min(1),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertNotFutureWorkDate(input.workDate);
      const deleted = await ctx.db
        .delete(attendance)
        .where(
          and(
            eq(attendance.employeeId, input.employeeId),
            eq(attendance.workDate, input.workDate),
          ),
        )
        .returning();
      return deleted[0] ?? null;
    }),
});
