import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@BMJ-KARYAWAN/db";
import {
	employee,
	job,
	kasbon,
	kasbonPayment,
	payrollLine,
	payrollPeriod,
} from "@BMJ-KARYAWAN/db/schema/karyawan";

import { kasirProcedure, router } from "../index";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const rangeInput = z.object({
	from: ymd,
	to: ymd,
});

type JobRow = typeof job.$inferSelect;

type OngkosRow = {
	employeeId: string;
	name: string;
	totalAmount: number;
	diterimaAmount: number;
	mechanicShare: number;
	bengkelShare: number;
	kasbonSisa: number;
};

function mechanicShare(row: JobRow): number {
	if (row.status !== "diterima") return 0;
	if (row.kind === "ongkos") return row.amountIdr;
	if (row.kind === "persenan") {
		const pct = row.bengkelPercent ?? 0;
		return row.amountIdr - Math.round((row.amountIdr * pct) / 100);
	}
	return 0;
}

function bengkelShare(row: JobRow): number {
	if (row.status !== "diterima") return 0;
	if (row.kind === "persenan") {
		const pct = row.bengkelPercent ?? 0;
		return Math.round((row.amountIdr * pct) / 100);
	}
	return 0;
}

function ymdJayapura(value: Date | number | string): string {
	const d = value instanceof Date ? value : new Date(value);
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Jayapura",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(d);
	const y = parts.find((p) => p.type === "year")?.value ?? "1970";
	const m = parts.find((p) => p.type === "month")?.value ?? "01";
	const day = parts.find((p) => p.type === "day")?.value ?? "01";
	return `${y}-${m}-${day}`;
}

async function kasbonSisaByEmployee(db: Database) {
	const kasbonRows = await db.select().from(kasbon);
	const payRows = await db.select().from(kasbonPayment);
	const paid = new Map<string, number>();
	for (const p of payRows) {
		paid.set(p.kasbonId, (paid.get(p.kasbonId) ?? 0) + p.amountIdr);
	}
	const sisa = new Map<string, number>();
	for (const k of kasbonRows) {
		if (k.status !== "disbursed" && k.status !== "lunas") continue;
		sisa.set(
			k.employeeId,
			(sisa.get(k.employeeId) ?? 0) + (k.amountIdr - (paid.get(k.id) ?? 0)),
		);
	}
	return sisa;
}

async function buildOngkosRows(db: Database, jobs: JobRow[]): Promise<OngkosRow[]> {
	const employees = await db.select().from(employee);
	const sisaMap = await kasbonSisaByEmployee(db);
	const byEmp = new Map<string, OngkosRow>();
	for (const e of employees) {
		byEmp.set(e.id, {
			employeeId: e.id,
			name: e.name,
			totalAmount: 0,
			diterimaAmount: 0,
			mechanicShare: 0,
			bengkelShare: 0,
			kasbonSisa: sisaMap.get(e.id) ?? 0,
		});
	}
	const seen = new Set<string>();
	for (const j of jobs) {
		const row = byEmp.get(j.employeeId);
		if (!row) continue;
		if (j.status !== "batal") {
			row.totalAmount += j.amountIdr;
			seen.add(j.employeeId);
		}
		if (j.status === "diterima") {
			row.diterimaAmount += j.amountIdr;
			row.mechanicShare += mechanicShare(j);
			row.bengkelShare += bengkelShare(j);
			seen.add(j.employeeId);
		}
	}
	for (const [id, row] of byEmp) {
		if (row.kasbonSisa !== 0) seen.add(id);
	}
	const rows = [...seen]
		.map((id) => byEmp.get(id))
		.filter((r): r is OngkosRow => r != null)
		.sort((a, b) => a.name.localeCompare(b.name, "id"));
	const total: OngkosRow = {
		employeeId: "",
		name: "Total",
		totalAmount: 0,
		diterimaAmount: 0,
		mechanicShare: 0,
		bengkelShare: 0,
		kasbonSisa: 0,
	};
	for (const r of rows) {
		total.totalAmount += r.totalAmount;
		total.diterimaAmount += r.diterimaAmount;
		total.mechanicShare += r.mechanicShare;
		total.bengkelShare += r.bengkelShare;
		total.kasbonSisa += r.kasbonSisa;
	}
	rows.push(total);
	return rows;
}

export const laporanRouter = router({
	ongkos: kasirProcedure.input(rangeInput).query(async ({ ctx, input }) => {
		const jobs = await ctx.db
			.select()
			.from(job)
			.where(and(gte(job.workDate, input.from), lte(job.workDate, input.to)));
		return {
			from: input.from,
			to: input.to,
			rows: await buildOngkosRows(ctx.db, jobs),
		};
	}),

	kumulatif: kasirProcedure.query(async ({ ctx }) => {
		const jobs = await ctx.db.select().from(job);
		return { rows: await buildOngkosRows(ctx.db, jobs) };
	}),

	diagram: kasirProcedure.input(rangeInput).query(async ({ ctx, input }) => {
		const jobs = await ctx.db
			.select()
			.from(job)
			.where(
				and(
					eq(job.status, "diterima"),
					gte(job.workDate, input.from),
					lte(job.workDate, input.to),
				),
			);
		let pendapatan = 0;
		for (const j of jobs) pendapatan += j.amountIdr;

		const periods = await ctx.db.select().from(payrollPeriod);
		const overlapping = periods.filter(
			(p) => p.startDate <= input.to && p.endDate >= input.from,
		);
		const finalized = overlapping.filter((p) => p.status === "finalized");
		const use =
			finalized.length > 0
				? finalized
				: overlapping.filter((p) => p.status === "draft");
		let takeHome = 0;
		if (use.length > 0) {
			const lines = await ctx.db
				.select()
				.from(payrollLine)
				.where(
					inArray(
						payrollLine.periodId,
						use.map((p) => p.id),
					),
				);
			for (const line of lines) takeHome += line.takeHomeIdr;
		}

		const pays = await ctx.db
			.select()
			.from(kasbonPayment)
			.where(eq(kasbonPayment.source, "manual"));
		let manual = 0;
		for (const p of pays) {
			const payDate = ymdJayapura(p.createdAt);
			if (payDate >= input.from && payDate <= input.to) manual += p.amountIdr;
		}

		const pengeluaran = takeHome + manual;
		return {
			from: input.from,
			to: input.to,
			pendapatan,
			pengeluaran,
			bengkel: pendapatan - pengeluaran,
		};
	}),
});
