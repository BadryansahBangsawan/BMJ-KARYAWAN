import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

const timestampMs = (name: string) =>
	integer(name, { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull();

export const employee = sqliteTable("employee", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.unique()
		.references(() => user.id, { onDelete: "set null" }),
	name: text("name").notNull(),
	role: text("role").notNull(),
	dailyRateIdr: integer("daily_rate_idr").notNull().default(0),
	konsumsiMonthlyIdr: integer("konsumsi_monthly_idr").notNull().default(0),
	bonusIdr: integer("bonus_idr").notNull().default(0),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	createdAt: timestampMs("created_at"),
});

export const job = sqliteTable("job", {
	id: text("id").primaryKey(),
	employeeId: text("employee_id")
		.notNull()
		.references(() => employee.id),
	workDate: text("work_date").notNull(),
	description: text("description").notNull(),
	amountIdr: integer("amount_idr").notNull(),
	struk: text("struk"),
	customerNote: text("customer_note"),
	status: text("status").notNull(),
	kind: text("kind").notNull(),
	bengkelPercent: integer("bengkel_percent"),
	sheetNo: integer("sheet_no"),
	createdByUserId: text("created_by_user_id").references(() => user.id),
	createdAt: timestampMs("created_at"),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const kasbon = sqliteTable("kasbon", {
	id: text("id").primaryKey(),
	employeeId: text("employee_id")
		.notNull()
		.references(() => employee.id),
	keperluan: text("keperluan").notNull(),
	amountIdr: integer("amount_idr").notNull(),
	status: text("status").notNull(),
	requestedByUserId: text("requested_by_user_id").references(() => user.id),
	approvedByUserId: text("approved_by_user_id").references(() => user.id),
	approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
	rejectedReason: text("rejected_reason"),
	disbursedByUserId: text("disbursed_by_user_id").references(() => user.id),
	disbursedAt: integer("disbursed_at", { mode: "timestamp_ms" }),
	sheetNo: integer("sheet_no"),
	createdAt: timestampMs("created_at"),
});

export const kasbonPayment = sqliteTable("kasbon_payment", {
	id: text("id").primaryKey(),
	kasbonId: text("kasbon_id")
		.notNull()
		.references(() => kasbon.id),
	amountIdr: integer("amount_idr").notNull(),
	source: text("source").notNull(),
	createdByUserId: text("created_by_user_id").references(() => user.id),
	payrollLineId: text("payroll_line_id"),
	createdAt: timestampMs("created_at"),
});

export const attendance = sqliteTable(
	"attendance",
	{
		id: text("id").primaryKey(),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employee.id),
		workDate: text("work_date").notNull(),
		value: integer("value").notNull(),
		markedByUserId: text("marked_by_user_id").references(() => user.id),
		checkInAt: integer("check_in_at", { mode: "timestamp_ms" }),
		checkOutAt: integer("check_out_at", { mode: "timestamp_ms" }),
		checkInPhoto: text("check_in_photo"),
		checkOutPhoto: text("check_out_photo"),
		createdAt: timestampMs("created_at"),
	},
	(table) => [uniqueIndex("attendance_employeeId_workDate_uidx").on(table.employeeId, table.workDate)],
);

export const payrollPeriod = sqliteTable(
	"payroll_period",
	{
		id: text("id").primaryKey(),
		year: integer("year").notNull(),
		month: integer("month").notNull(),
		startDate: text("start_date").notNull(),
		endDate: text("end_date").notNull(),
		payDate: text("pay_date").notNull(),
		status: text("status").notNull(),
		finalizedByUserId: text("finalized_by_user_id").references(() => user.id),
		finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
	},
	(table) => [uniqueIndex("payroll_period_year_month_uidx").on(table.year, table.month)],
);

export const payrollLine = sqliteTable(
	"payroll_line",
	{
		id: text("id").primaryKey(),
		periodId: text("period_id")
			.notNull()
			.references(() => payrollPeriod.id),
		employeeId: text("employee_id")
			.notNull()
			.references(() => employee.id),
		daysPresent: integer("days_present").notNull(),
		alpaDays: integer("alpa_days").notNull(),
		dailyRateIdr: integer("daily_rate_idr").notNull(),
		dailyPayIdr: integer("daily_pay_idr").notNull(),
		jobShareIdr: integer("job_share_idr").notNull(),
		konsumsiIdr: integer("konsumsi_idr").notNull(),
		bonusIdr: integer("bonus_idr").notNull(),
		kasbonBalanceIdr: integer("kasbon_balance_idr").notNull(),
		kasbonDeductionIdr: integer("kasbon_deduction_idr").notNull(),
		takeHomeIdr: integer("take_home_idr").notNull(),
		kasbonRemainingIdr: integer("kasbon_remaining_idr").notNull(),
	},
	(table) => [uniqueIndex("payroll_line_periodId_employeeId_uidx").on(table.periodId, table.employeeId)],
);

export const storeTxn = sqliteTable("store_txn", {
	id: text("id").primaryKey(),
	seq: integer("seq").notNull(),
	kind: text("kind").notNull(),
	amountIdr: integer("amount_idr").notNull(),
	note: text("note"),
	createdByUserId: text("created_by_user_id").references(() => user.id),
	createdAt: timestampMs("created_at"),
});
