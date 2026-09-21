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

import { router, supervisorProcedure } from "../index";
import { splitBengkelOngkos } from "../lib/ongkos";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const rangeInput = z
	.object({
		from: ymd,
		to: ymd,
	})
	.refine((value) => value.from <= value.to, {
		message: "Dari harus sebelum sampai",
		path: ["from"],
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

function ymdDiffDays(from: string, to: string): number {
	const a = Date.parse(`${from}T00:00:00+09:00`);
	const b = Date.parse(`${to}T00:00:00+09:00`);
	return Math.floor((b - a) / 86_400_000) + 1;
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
	const percentById = new Map(employees.map((e) => [e.id, e.ongkosPercent]));
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
			seen.add(j.employeeId);
			if (employees.find((e) => e.id === j.employeeId)?.payKind === "gaji") continue;
			const { bengkelIdr, mechanicIdr } = splitBengkelOngkos(
				j.amountIdr,
				j.bengkelPercent ?? percentById.get(j.employeeId) ?? 0,
			);
			row.mechanicShare += mechanicIdr;
			row.bengkelShare += bengkelIdr;
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
	ongkos: supervisorProcedure.input(rangeInput).query(async ({ ctx, input }) => {
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

	kumulatif: supervisorProcedure.query(async ({ ctx }) => {
		const jobs = await ctx.db.select().from(job);
		return { rows: await buildOngkosRows(ctx.db, jobs) };
	}),

	diagram: supervisorProcedure.input(rangeInput).query(async ({ ctx, input }) => {
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
		const seen = new Set<string>();
		const overlapping: typeof periods = [];
		for (const p of periods) {
			if (p.startDate > input.to || p.endDate < input.from) continue;
			if (seen.has(p.id)) continue;
			seen.add(p.id);
			overlapping.push(p);
		}
		let takeHome = 0;
		if (overlapping.length > 0) {
			const lines = await ctx.db
				.select()
				.from(payrollLine)
				.where(
					inArray(
						payrollLine.periodId,
						overlapping.map((p) => p.id),
					),
				);
			const takeHomeByPeriod = new Map<string, number>();
			for (const line of lines) {
				takeHomeByPeriod.set(
					line.periodId,
					(takeHomeByPeriod.get(line.periodId) ?? 0) + line.takeHomeIdr,
				);
			}
			for (const period of overlapping) {
				const overlapFrom =
					period.startDate < input.from ? input.from : period.startDate;
				const overlapTo = period.endDate > input.to ? input.to : period.endDate;
				if (overlapFrom > overlapTo) continue;
				const periodDays = ymdDiffDays(period.startDate, period.endDate);
				const overlapDays = ymdDiffDays(overlapFrom, overlapTo);
				const sumTakeHome = takeHomeByPeriod.get(period.id) ?? 0;
				takeHome += Math.round((sumTakeHome * overlapDays) / periodDays);
			}
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
