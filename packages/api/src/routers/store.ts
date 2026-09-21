import { TRPCError } from "@trpc/server";
import { asc, max } from "drizzle-orm";
import { z } from "zod";

import { storeTxn } from "@BMJ-KARYAWAN/db/schema/karyawan";

import { kasirOnlyProcedure, kasirProcedure, router } from "../index";

const kindSchema = z.enum(["kasir", "non_tunai", "panjar"]);

export const storeRouter = router({
	list: kasirProcedure.query(async ({ ctx }) => {
		return await ctx.db.select().from(storeTxn).orderBy(asc(storeTxn.seq));
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

	summary: kasirProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db.select().from(storeTxn);
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
