import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { Database } from "@BMJ-KARYAWAN/db";
import {
	attendance,
	employee,
	job,
	kasbon,
	kasbonPayment,
	storeTxn,
} from "@BMJ-KARYAWAN/db/schema/karyawan";

const SHEET_ID = "1jkBNmdJJE2vJMbq-WCLBr4ykR-1_uZf6cwmH2hTYyRs";

const SHEET_NAMES = [
	"RONI",
	"ECHON",
	"YULEN",
	"PERSENAN",
	"KASBON",
	"ABSEN",
	"Transaksi Toko",
] as const;

const JOB_SHEETS: Record<"RONI" | "ECHON" | "YULEN", string> = {
	RONI: "Roni",
	ECHON: "Econ",
	YULEN: "Yulen",
};

type SeedEmployee = {
	name: string;
	role: "kasir" | "mekanik";
	konsumsiMonthlyIdr: number;
	active: boolean;
};

const SEED_EMPLOYEES: SeedEmployee[] = [
	{ name: "MM Heni", role: "kasir", konsumsiMonthlyIdr: 200000, active: true },
	{ name: "Econ", role: "mekanik", konsumsiMonthlyIdr: 210000, active: true },
	{ name: "Roni", role: "mekanik", konsumsiMonthlyIdr: 300000, active: true },
	{ name: "Yulen", role: "mekanik", konsumsiMonthlyIdr: 0, active: true },
	{ name: "Ryan", role: "mekanik", konsumsiMonthlyIdr: 0, active: true },
	{ name: "Alqi", role: "mekanik", konsumsiMonthlyIdr: 330000, active: true },
	{ name: "Talli", role: "mekanik", konsumsiMonthlyIdr: 270000, active: true },
	{ name: "Iwan", role: "mekanik", konsumsiMonthlyIdr: 150000, active: true },
	{ name: "Yusuf", role: "mekanik", konsumsiMonthlyIdr: 0, active: true },
	{ name: "Nuboba", role: "mekanik", konsumsiMonthlyIdr: 0, active: true },
	{ name: "D'Manye", role: "mekanik", konsumsiMonthlyIdr: 0, active: false },
	{ name: "D'Liwan", role: "mekanik", konsumsiMonthlyIdr: 0, active: false },
];

const NAME_ALIAS: Record<string, string> = {
	echon: "Econ",
	econ: "Econ",
	"m'heni": "MM Heni",
	"mm heni": "MM Heni",
	mheni: "MM Heni",
};

const JOB_STATUSES = new Set(["proses", "selesai", "diterima"]);

export type ImportSheetResult = {
	employees: number;
	jobs: number;
	kasbon: number;
	kasbonPayments: number;
	attendance: number;
	storeTxns: number;
	ttlAmount: number;
	ttlPaid: number;
	ttlSisa: number;
};

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = "";
	let inQuotes = false;
	const src = text.replace(/^\uFEFF/, "");
	for (let i = 0; i < src.length; i++) {
		const c = src[i]!;
		if (inQuotes) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cur += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(cur);
			cur = "";
		} else if (c === "\n") {
			row.push(cur);
			rows.push(row);
			row = [];
			cur = "";
		} else if (c !== "\r") {
			cur += c;
		}
	}
	if (cur.length > 0 || row.length > 0) {
		row.push(cur);
		rows.push(row);
	}
	return rows;
}

function cell(row: string[], index: number): string {
	return (row[index] ?? "").trim();
}

function parseIdr(raw: string): number | null {
	let s = raw.trim();
	if (!s) return null;
	s = s.replace(/rp/gi, "").replace(/\s/g, "");
	if (s === "-" || s === "–" || s === "—") return 0;
	const cleaned = s.replace(/\./g, "").replace(/,/g, "");
	if (!/^-?\d+$/.test(cleaned)) return null;
	return Number(cleaned);
}

function parseWorkDate(raw: string): string | null {
	const m = raw.trim().match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/);
	if (!m) return null;
	const d = Number(m[1]);
	const mo = Number(m[2]);
	const y = Number(m[3]);
	if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
	return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseSheetNo(raw: string): number | null {
	const s = raw.trim();
	if (!s) return null;
	const n = Number(s.replace(/\./g, ""));
	if (!Number.isInteger(n) || n <= 0) return null;
	return n;
}

function parseJobStatus(raw: string): "proses" | "selesai" | "diterima" | null {
	const s = raw.trim().toLowerCase();
	if (JOB_STATUSES.has(s)) return s as "proses" | "selesai" | "diterima";
	return null;
}

function parsePercent(raw: string): number | null {
	const s = raw.trim().replace(/%/g, "").replace(",", ".").replace(/\s/g, "");
	if (!s) return 0;
	const n = Number(s);
	if (!Number.isFinite(n)) return null;
	const pct = n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n);
	if (pct < 0 || pct > 100) return null;
	return pct;
}

function parseAbsenValue(raw: string): 0 | 50 | 100 | null {
	const s = raw.trim().replace(",", ".");
	if (s === "1") return 100;
	if (s === "0.5") return 50;
	if (s === "0") return 0;
	return null;
}

function ymdToDate(ymd: string): Date {
	return new Date(`${ymd}T00:00:00+09:00`);
}

function canonicalEmployeeName(raw: string): string | null {
	const lower = raw.trim().toLowerCase();
	if (!lower) return null;
	if (NAME_ALIAS[lower]) return NAME_ALIAS[lower];
	for (const seed of SEED_EMPLOYEES) {
		if (seed.name.toLowerCase() === lower) return seed.name;
	}
	const hits: string[] = [];
	for (const seed of SEED_EMPLOYEES) {
		if (lower.includes(seed.name.toLowerCase())) hits.push(seed.name);
	}
	for (const [alias, canon] of Object.entries(NAME_ALIAS)) {
		if (alias.length >= 3 && lower.includes(alias)) hits.push(canon);
	}
	if (hits.length === 0) return null;
	hits.sort((a, b) => b.length - a.length);
	return hits[0] ?? null;
}

function findHeaderRow(rows: string[][], headerCell: string): number {
	const needle = headerCell.trim().toLowerCase();
	return rows.findIndex((r) =>
		r.some((c) => c.trim().toLowerCase() === needle),
	);
}

function gateway(name: string): never {
	throw new TRPCError({ code: "BAD_GATEWAY", message: name });
}

async function fetchSheetCsv(name: string): Promise<string> {
	const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		gateway(name);
	}
	if (!res.ok) gateway(name);
	const text = await res.text();
	if (!text.trim() || /^\s*</.test(text)) gateway(name);
	return text;
}

async function fetchAllSheets(): Promise<Record<string, string>> {
	const entries = await Promise.all(
		SHEET_NAMES.map(async (name) => [name, await fetchSheetCsv(name)] as const),
	);
	const out: Record<string, string> = {};
	for (const [name, csv] of entries) out[name] = csv;
	return out;
}

type JobInsert = {
	id: string;
	employeeId: string;
	workDate: string;
	description: string;
	amountIdr: number;
	struk: string | null;
	customerNote: string | null;
	status: "proses" | "selesai" | "diterima";
	kind: "ongkos" | "persenan";
	bengkelPercent: number | null;
	sheetNo: number | null;
};

function jobKey(row: {
	kind: string;
	sheetNo: number | null;
	employeeId: string;
	description: string;
	workDate: string;
	amountIdr: number;
}): string {
	if (row.sheetNo != null) {
		return `no:${row.kind}:${row.sheetNo}:${row.employeeId}`;
	}
	return `alt:${row.kind}:${row.employeeId}:${row.workDate}:${row.description}:${row.amountIdr}`;
}

async function upsertEmployees(tx: Database) {
	const existing = await tx.select().from(employee);
	const idByName = new Map<string, string>();
	for (const row of existing) {
		idByName.set(row.name.toLowerCase(), row.id);
	}
	let inserted = 0;
	for (const seed of SEED_EMPLOYEES) {
		const foundId = idByName.get(seed.name.toLowerCase());
		if (foundId) {
			await tx
				.update(employee)
				.set({
					role: seed.role,
					active: seed.active,
				})
				.where(eq(employee.id, foundId));
			idByName.set(seed.name.toLowerCase(), foundId);
		} else {
			const id = crypto.randomUUID();
			await tx.insert(employee).values({
				id,
				name: seed.name,
				role: seed.role,
				konsumsiMonthlyIdr: 0,
				bonusIdr: 0,
				active: seed.active,
			});
			idByName.set(seed.name.toLowerCase(), id);
			inserted += 1;
		}
	}
	const resolve = (name: string) => idByName.get(name.toLowerCase()) ?? null;
	return { inserted, resolve };
}

function collectOngkosJobs(
	csv: string,
	employeeId: string,
	existingKeys: Set<string>,
): JobInsert[] {
	const rows = parseCsv(csv);
	const header = findHeaderRow(rows, "PEKERJAAN");
	if (header < 0) return [];
	const out: JobInsert[] = [];
	for (const row of rows.slice(header + 1)) {
		const description = cell(row, 2);
		const status = parseJobStatus(cell(row, 5));
		const amountIdr = parseIdr(cell(row, 3));
		const workDate = parseWorkDate(cell(row, 1));
		if (!description || !status || amountIdr == null || !workDate) continue;
		const sheetNo = parseSheetNo(cell(row, 0));
		const draft: JobInsert = {
			id: crypto.randomUUID(),
			employeeId,
			workDate,
			description,
			amountIdr,
			struk: cell(row, 4) || null,
			customerNote: cell(row, 6) || null,
			status,
			kind: "ongkos",
			bengkelPercent: null,
			sheetNo,
		};
		const key = jobKey(draft);
		if (existingKeys.has(key)) continue;
		existingKeys.add(key);
		out.push(draft);
	}
	return out;
}

function collectPersenanJobs(
	csv: string,
	resolve: (name: string) => string | null,
	existingKeys: Set<string>,
): JobInsert[] {
	const rows = parseCsv(csv);
	const header = findHeaderRow(rows, "MEKANIK");
	if (header < 0) return [];
	const out: JobInsert[] = [];
	for (const row of rows.slice(header + 1)) {
		const mechanic = canonicalEmployeeName(cell(row, 2));
		if (!mechanic) continue;
		const employeeId = resolve(mechanic);
		if (!employeeId) continue;
		const description = cell(row, 3);
		const status = parseJobStatus(cell(row, 6));
		const amountIdr = parseIdr(cell(row, 4));
		const workDate = parseWorkDate(cell(row, 1));
		const pct = parsePercent(cell(row, 7));
		if (!description || !status || amountIdr == null || !workDate || pct == null) {
			continue;
		}
		const draft: JobInsert = {
			id: crypto.randomUUID(),
			employeeId,
			workDate,
			description,
			amountIdr,
			struk: cell(row, 5) || null,
			customerNote: null,
			status,
			kind: "persenan",
			bengkelPercent: pct,
			sheetNo: parseSheetNo(cell(row, 0)),
		};
		const key = jobKey(draft);
		if (existingKeys.has(key)) continue;
		existingKeys.add(key);
		out.push(draft);
	}
	return out;
}

type KasbonInsert = {
	id: string;
	employeeId: string;
	keperluan: string;
	amountIdr: number;
	status: "disbursed" | "lunas";
	disbursedAt: Date | null;
	sheetNo: number | null;
	createdAt: Date;
};

type PaymentInsert = {
	id: string;
	kasbonId: string;
	amountIdr: number;
	source: "manual";
	createdAt: Date;
};

function collectKasbon(
	csv: string,
	resolve: (name: string) => string | null,
	existingSheetNos: Set<number>,
): { kasbons: KasbonInsert[]; payments: PaymentInsert[] } {
	const rows = parseCsv(csv);
	const header = findHeaderRow(rows, "KARYAWAN");
	if (header < 0) return { kasbons: [], payments: [] };
	const kasbons: KasbonInsert[] = [];
	const payments: PaymentInsert[] = [];
	for (const row of rows.slice(header + 1)) {
		const name = canonicalEmployeeName(cell(row, 2));
		if (!name) continue;
		const employeeId = resolve(name);
		if (!employeeId) continue;
		const amountIdr = parseIdr(cell(row, 4));
		const paidRaw = cell(row, 5);
		const paid = parseIdr(paidRaw);
		if (amountIdr == null && paidRaw) continue;
		if (amountIdr == null) continue;
		const sheetNo = parseSheetNo(cell(row, 0));
		if (sheetNo != null && existingSheetNos.has(sheetNo)) continue;
		if (sheetNo != null) existingSheetNos.add(sheetNo);
		const sisa = parseIdr(cell(row, 6));
		const paidAmt = paid ?? 0;
		const remaining = sisa != null ? sisa : amountIdr - paidAmt;
		const lunas = remaining <= 0;
		const workDate = parseWorkDate(cell(row, 1));
		const at = workDate ? ymdToDate(workDate) : new Date();
		const id = crypto.randomUUID();
		kasbons.push({
			id,
			employeeId,
			keperluan: cell(row, 3) || "kasbon",
			amountIdr,
			status: lunas ? "lunas" : "disbursed",
			disbursedAt: at,
			sheetNo,
			createdAt: at,
		});
		if ((paid ?? 0) > 0) {
			payments.push({
				id: crypto.randomUUID(),
				kasbonId: id,
				amountIdr: paid ?? 0,
				source: "manual",
				createdAt: at,
			});
		}
	}
	return { kasbons, payments };
}

/**
 * Attempt to extract a year and 1-based month number from the rows that
 * appear above the "ABS TGL" header row.  The ABSEN sheet typically has a
 * title such as "ABSEN KARYAWAN BULAN SEPTEMBER 2026" somewhere in those
 * rows.  We scan every cell for an Indonesian month name (or common
 * abbreviations) followed by — or preceded by — a four-digit year.
 */
const INDONESIAN_MONTHS: Record<string, number> = {
	januari: 1, jan: 1,
	februari: 2, feb: 2,
	maret: 3, mar: 3,
	april: 4, apr: 4,
	mei: 5,
	juni: 6, jun: 6,
	juli: 7, jul: 7,
	agustus: 8, agu: 8, agst: 8,
	september: 9, sep: 9, sept: 9,
	oktober: 10, okt: 10,
	november: 11, nov: 11,
	desember: 12, des: 12,
};

function detectAbsenYearMonth(rows: string[][], headerIdx: number): { year: number; month: number } | null {
	for (let r = 0; r < headerIdx; r++) {
		for (const raw of rows[r]!) {
			const text = raw.trim().toLowerCase();
			// Try "bulan <month> <year>" or just "<month> <year>" or "<year> <month>"
			const yearMatch = text.match(/\b(20\d{2})\b/);
			if (!yearMatch) continue;
			const year = Number(yearMatch[1]);
			for (const [monthName, monthNum] of Object.entries(INDONESIAN_MONTHS)) {
				if (text.includes(monthName)) {
					return { year, month: monthNum };
				}
			}
			// Fallback: numeric month "MM/YYYY" or "YYYY/MM" patterns
			const numeric = text.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/) ??
				text.match(/\b(20\d{2})\/(0?[1-9]|1[0-2])\b/);
			if (numeric) {
				const [, a, b] = numeric;
				const [mo, yr] = Number(a) > 12 ? [Number(b), Number(a)] : [Number(a), Number(b)];
				return { year: yr, month: mo };
			}
		}
	}
	return null;
}

function collectAttendance(
	csv: string,
	resolve: (name: string) => string | null,
	existing: Set<string>,
) {
	const rows = parseCsv(csv);
	const headerIdx = rows.findIndex((r) =>
		cell(r, 0).toLowerCase().includes("abs tgl"),
	);
	if (headerIdx < 0) return [];

	// Determine the year/month from the sheet's title rows; fall back to the
	// current UTC month so that a missing header never silently misdates rows.
	const detected = detectAbsenYearMonth(rows, headerIdx);
	const now = new Date();
	const year = detected?.year ?? now.getUTCFullYear();
	const month = detected?.month ?? (now.getUTCMonth() + 1);

	const header = rows[headerIdx]!;
	const colEmp: Array<string | null> = header.map((h, i) => {
		if (i === 0) return null;
		if (/cuaca/i.test(h)) return null;
		const name = canonicalEmployeeName(h);
		return name ? resolve(name) : null;
	});
	const out: Array<{
		id: string;
		employeeId: string;
		workDate: string;
		value: number;
	}> = [];
	const ym = `${year}-${String(month).padStart(2, "0")}`;
	for (const row of rows.slice(headerIdx + 1)) {
		const dayRaw = cell(row, 0);
		if (!/^\d{1,2}$/.test(dayRaw)) continue;
		const day = Number(dayRaw);
		if (day < 1 || day > 31) continue;
		const workDate = `${ym}-${String(day).padStart(2, "0")}`;
		for (let i = 1; i < row.length; i++) {
			const employeeId = colEmp[i];
			if (!employeeId) continue;
			const value = parseAbsenValue(cell(row, i));
			if (value == null) continue;
			const key = `${employeeId}:${workDate}`;
			if (existing.has(key)) continue;
			existing.add(key);
			out.push({
				id: crypto.randomUUID(),
				employeeId,
				workDate,
				value,
			});
		}
	}
	return out;
}

function collectStoreTxns(
	csv: string,
	existingSeq: Set<number>,
): Array<{
	id: string;
	seq: number;
	kind: "kasir" | "non_tunai" | "panjar";
	amountIdr: number;
	note: string | null;
}> {
	const rows = parseCsv(csv);
	const header = findHeaderRow(rows, "Stts");
	if (header < 0) return [];
	const out: Array<{
		id: string;
		seq: number;
		kind: "kasir" | "non_tunai" | "panjar";
		amountIdr: number;
		note: string | null;
	}> = [];
	let nextSeq = existingSeq.size > 0 ? Math.max(...existingSeq) + 1 : 1;
	for (const row of rows.slice(header + 1)) {
		const amountIdr = parseIdr(cell(row, 3));
		if (amountIdr == null) continue;
		const kindRaw = cell(row, 2).toLowerCase();
		let kind: "kasir" | "non_tunai" | "panjar" | null = null;
		if (kindRaw === "kasir") kind = "kasir";
		else if (kindRaw === "non tunai" || kindRaw === "non_tunai") kind = "non_tunai";
		else if (kindRaw === "panjar") kind = "panjar";
		if (!kind) continue;
		const seqParsed = parseSheetNo(cell(row, 1));
		const seq = seqParsed ?? nextSeq;
		if (existingSeq.has(seq)) continue;
		existingSeq.add(seq);
		if (seq >= nextSeq) nextSeq = seq + 1;
		out.push({
			id: crypto.randomUUID(),
			seq,
			kind,
			amountIdr,
			note: null,
		});
	}
	return out;
}

async function kasbonTotals(tx: Database) {
	const kasbonRows = await tx.select().from(kasbon);
	const payRows = await tx.select().from(kasbonPayment);
	const paid = new Map<string, number>();
	for (const p of payRows) {
		paid.set(p.kasbonId, (paid.get(p.kasbonId) ?? 0) + p.amountIdr);
	}
	let ttlAmount = 0;
	let ttlPaid = 0;
	let ttlSisa = 0;
	for (const k of kasbonRows) {
		if (k.status !== "disbursed" && k.status !== "lunas") continue;
		const p = paid.get(k.id) ?? 0;
		ttlAmount += k.amountIdr;
		ttlPaid += p;
		ttlSisa += k.amountIdr - p;
	}
	return { ttlAmount, ttlPaid, ttlSisa };
}

async function applyImport(
	tx: Database,
	sheets: Record<string, string>,
): Promise<ImportSheetResult> {
	const { inserted: employeesInserted, resolve } = await upsertEmployees(tx);

	const existingJobs = await tx.select().from(job);
	const jobKeys = new Set(existingJobs.map((j) => jobKey(j)));
	const newJobs: JobInsert[] = [];
	for (const [sheet, empName] of Object.entries(JOB_SHEETS)) {
		const empId = resolve(empName);
		if (!empId) continue;
		newJobs.push(...collectOngkosJobs(sheets[sheet] ?? "", empId, jobKeys));
	}
	newJobs.push(
		...collectPersenanJobs(sheets.PERSENAN ?? "", resolve, jobKeys),
	);
	if (newJobs.length > 0) await tx.insert(job).values(newJobs);

	const existingKasbon = await tx.select().from(kasbon);
	const kasbonSheetNos = new Set<number>();
	for (const k of existingKasbon) {
		if (k.sheetNo != null) kasbonSheetNos.add(k.sheetNo);
	}
	const { kasbons, payments } = collectKasbon(
		sheets.KASBON ?? "",
		resolve,
		kasbonSheetNos,
	);
	if (kasbons.length > 0) await tx.insert(kasbon).values(kasbons);
	if (payments.length > 0) await tx.insert(kasbonPayment).values(payments);

	const existingAbsen = await tx.select().from(attendance);
	const absenKeys = new Set(
		existingAbsen.map((a) => `${a.employeeId}:${a.workDate}`),
	);
	const newAbsen = collectAttendance(sheets.ABSEN ?? "", resolve, absenKeys);
	if (newAbsen.length > 0) await tx.insert(attendance).values(newAbsen);

	const existingStore = await tx.select().from(storeTxn);
	const seqs = new Set(existingStore.map((s) => s.seq));
	const newStore = collectStoreTxns(sheets["Transaksi Toko"] ?? "", seqs);
	if (newStore.length > 0) await tx.insert(storeTxn).values(newStore);

	const totals = await kasbonTotals(tx);
	return {
		employees: employeesInserted,
		jobs: newJobs.length,
		kasbon: kasbons.length,
		kasbonPayments: payments.length,
		attendance: newAbsen.length,
		storeTxns: newStore.length,
		...totals,
	};
}

export async function importSheet(db: Database): Promise<ImportSheetResult> {
	const sheets = await fetchAllSheets();
	return await db.transaction((tx) => applyImport(tx as unknown as Database, sheets));
}
