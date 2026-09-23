import { TRPCError } from "@trpc/server";
import { and, asc, gte, lte, max } from "drizzle-orm";
import { z } from "zod";

import { storeTxn } from "@BMJ-KARYAWAN/db/schema/karyawan";

import { kasirOnlyProcedure, kasirProcedure, router } from "../index";

const kindSchema = z.enum(["kasir", "non_tunai", "panjar"]);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeInput = z
	.object({ from: ymd, to: ymd })
	.refine((value) => value.from <= value.to, {
		message: "Dari harus sebelum sampai",
		path: ["from"],
	});

function createdAtRange(from: string, to: string) {
	return {
		start: new Date(`${from}T00:00:00+09:00`),
		end: new Date(`${to}T23:59:59.999+09:00`),
	};
}

export const storeRouter = router({
	list: kasirProcedure.input(rangeInput).query(async ({ ctx, input }) => {
		const { start, end } = createdAtRange(input.from, input.to);
		return await ctx.db
			.select()
			.from(storeTxn)
			.where(and(gte(storeTxn.createdAt, start), lte(storeTxn.createdAt, end)))
			.orderBy(asc(storeTxn.seq));
	}),

	create: kasirOnlyProcedure
		.input(
			z.object({
				kind: kindSchema,
				amountIdr: z.number().int().positive(),
				note: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const note = input.note?.trim() ? input.note.trim() : null;
			for (let attempt = 0; attempt < 3; attempt++) {
				const [agg] = await ctx.db
					.select({ m: max(storeTxn.seq) })
					.from(storeTxn);
				const seq = (agg?.m ?? 0) + 1;
				const id = crypto.randomUUID();
				try {
					await ctx.db.insert(storeTxn).values({
						id,
						seq,
						kind: input.kind,
						amountIdr: input.amountIdr,
						note,
						createdByUserId: ctx.session.user.id,
					});
					return {
						id,
						seq,
						kind: input.kind,
						amountIdr: input.amountIdr,
						note,
						createdByUserId: ctx.session.user.id,
					};
				} catch (err) {
					if (!/UNIQUE/i.test(String(err))) throw err;
				}
			}
			throw new TRPCError({
				code: "CONFLICT",
				message: "Gagal nomor transaksi, coba lagi",
			});
		}),

	summary: kasirProcedure.input(rangeInput).query(async ({ ctx, input }) => {
		const { start, end } = createdAtRange(input.from, input.to);
		const rows = await ctx.db
			.select()
			.from(storeTxn)
			.where(and(gte(storeTxn.createdAt, start), lte(storeTxn.createdAt, end)));
		const counts = { kasir: 0, non_tunai: 0, panjar: 0 };
		const sums = { kasir: 0, non_tunai: 0, panjar: 0 };
		for (const row of rows) {
			if (
				row.kind === "kasir" ||
				row.kind === "non_tunai" ||
				row.kind === "panjar"
			) {
				counts[row.kind] += 1;
				sums[row.kind] += row.amountIdr;
			}
		}
		return {
			transaksiKali: rows.length,
			tunai: sums.kasir,
			nonTunai: sums.non_tunai,
			panjar: sums.panjar,
			counts,
			sums,
		};
	}),
});
