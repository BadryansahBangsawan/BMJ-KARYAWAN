import { afterAll, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import { kasbon, kasbonPayment } from "@BMJ-KARYAWAN/db/schema/karyawan";

import type { Context } from "../context";
import { appRouter } from "./index";

const TS = 1_725_000_000_000;

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "supervisor" | "kasir" | "mekanik";
};

const clients: Client[] = [];

function closeClients() {
  while (clients.length > 0) {
    const client = clients.pop();
    try {
      client?.close();
    } catch {
      // already closed
    }
  }
}

afterAll(closeClients);
process.on("exit", closeClients);

const DDL = [
  `CREATE TABLE user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified INTEGER NOT NULL,
    image TEXT,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE employee (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE REFERENCES user(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pay_kind TEXT NOT NULL,
    ongkos_percent INTEGER NOT NULL,
    konsumsi_monthly_idr INTEGER NOT NULL,
    bonus_idr INTEGER NOT NULL,
    active INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE job (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id),
    work_date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_idr INTEGER NOT NULL,
    struk TEXT,
    customer_note TEXT,
    status TEXT NOT NULL,
    kind TEXT NOT NULL,
    bengkel_percent INTEGER,
    sheet_no INTEGER,
    created_by_user_id TEXT REFERENCES user(id),
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
    updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
  )`,
  `CREATE TABLE kasbon (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id),
    keperluan TEXT NOT NULL,
    amount_idr INTEGER NOT NULL,
    status TEXT NOT NULL,
    requested_by_user_id TEXT REFERENCES user(id),
    approved_by_user_id TEXT REFERENCES user(id),
    approved_at INTEGER,
    rejected_reason TEXT,
    disbursed_by_user_id TEXT REFERENCES user(id),
    disbursed_at INTEGER,
    sheet_no INTEGER,
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
  )`,
  `CREATE TABLE kasbon_payment (
    id TEXT PRIMARY KEY,
    kasbon_id TEXT NOT NULL REFERENCES kasbon(id),
    amount_idr INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_by_user_id TEXT REFERENCES user(id),
    payroll_line_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER))
  )`,
  `CREATE TABLE attendance (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employee(id),
    work_date TEXT NOT NULL,
    value INTEGER NOT NULL,
    marked_by_user_id TEXT REFERENCES user(id),
    check_in_at INTEGER,
    check_out_at INTEGER,
    check_in_photo TEXT,
    check_out_photo TEXT,
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch() * 1000 AS INTEGER)),
    UNIQUE (employee_id, work_date)
  )`,
  `CREATE TABLE payroll_period (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    pay_date TEXT NOT NULL,
    UNIQUE (year, month)
  )`,
  `CREATE TABLE payroll_line (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL REFERENCES payroll_period(id),
    employee_id TEXT NOT NULL REFERENCES employee(id),
    days_present INTEGER NOT NULL,
    alpa_days INTEGER NOT NULL,
    ongkos_percent INTEGER NOT NULL,
    daily_pay_idr INTEGER NOT NULL,
    job_share_idr INTEGER NOT NULL,
    konsumsi_idr INTEGER NOT NULL,
    bonus_idr INTEGER NOT NULL,
    kasbon_balance_idr INTEGER NOT NULL,
    kasbon_deduction_idr INTEGER NOT NULL,
    take_home_idr INTEGER NOT NULL,
    kasbon_remaining_idr INTEGER NOT NULL,
    UNIQUE (period_id, employee_id)
  )`,
];

async function openMemory() {
  const client = createClient({ url: ":memory:" });
  clients.push(client);
  await client.execute("PRAGMA foreign_keys = ON");
  for (const sql of DDL) {
    await client.execute(sql);
  }
  const db = drizzle(client) as unknown as Context["db"];
  return { client, db };
}

function caller(db: Context["db"], user: SessionUser) {
  return appRouter.createCaller({
    auth: null,
    db,
    session: { user },
  } as Context);
}

async function insertUser(client: Client, user: SessionUser) {
  await client.execute({
    sql: `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)`,
    args: [user.id, user.name, user.email, user.role, TS, TS],
  });
}

async function insertEmployee(
  client: Client,
  row: { id: string; userId?: string | null; name: string },
) {
  await client.execute({
    sql: `INSERT INTO employee (
            id, user_id, name, role, pay_kind, ongkos_percent,
            konsumsi_monthly_idr, bonus_idr, active, created_at
          ) VALUES (?, ?, ?, 'mekanik', 'persenan', 0, 0, 0, 1, ?)`,
    args: [row.id, row.userId ?? null, row.name, TS],
  });
}

async function paymentSum(db: Context["db"], kasbonId: string) {
  const rows = await db
    .select({ amountIdr: kasbonPayment.amountIdr })
    .from(kasbonPayment)
    .where(eq(kasbonPayment.kasbonId, kasbonId));
  return rows.reduce((sum, row) => sum + row.amountIdr, 0);
}

describe("money behavior", () => {
  test("mekanik job.setStatus throws Mekanik cannot change job status", async () => {
    const { db } = await openMemory();
    const mekanik = caller(db, {
      id: "user-mekanik",
      name: "Mek",
      email: "mek@test.local",
      role: "mekanik",
    });
    await expect(
      mekanik.job.setStatus({ id: "job-1", status: "diterima" }),
    ).rejects.toThrow("Mekanik cannot change job status");
  });

  test("kasir job.create throws Kasir cannot create jobs", async () => {
    const { db } = await openMemory();
    const kasir = caller(db, {
      id: "user-kasir",
      name: "Kas",
      email: "kasir@test.local",
      role: "kasir",
    });
    await expect(
      kasir.job.create({
        workDate: "2026-09-22",
        description: "servis",
        amountIdr: 1000,
      }),
    ).rejects.toThrow("Kasir cannot create jobs");
  });

  test("mekanik job.create for another employee throws", async () => {
    const { client, db } = await openMemory();
    const user: SessionUser = {
      id: "user-mekanik",
      name: "Mek",
      email: "mek@test.local",
      role: "mekanik",
    };
    await insertUser(client, user);
    await insertEmployee(client, {
      id: "emp-me",
      userId: user.id,
      name: "Mek",
    });
    const mekanik = caller(db, user);
    await expect(
      mekanik.job.create({
        employeeId: "emp-other",
        workDate: "2026-09-22",
        description: "servis",
        amountIdr: 1000,
      }),
    ).rejects.toThrow("Cannot create jobs for another employee");
  });

  test("kasbon.addPayment rejects overpay and keeps stored sum", async () => {
    const { client, db } = await openMemory();
    const user: SessionUser = {
      id: "user-kasir",
      name: "Kas",
      email: "kasir@test.local",
      role: "kasir",
    };
    await insertUser(client, user);
    await insertEmployee(client, { id: "emp-1", name: "Mek" });
    await client.execute({
      sql: `INSERT INTO kasbon (
              id, employee_id, keperluan, amount_idr, status, created_at
            ) VALUES ('kasbon-1', 'emp-1', 'bon', 10000, 'disbursed', ?)`,
      args: [TS],
    });
    const kasir = caller(db, user);
    const first = await kasir.kasbon.addPayment({
      kasbonId: "kasbon-1",
      amountIdr: 6000,
    });
    expect(first.sisaIdr).toBe(4000);
    await expect(
      kasir.kasbon.addPayment({ kasbonId: "kasbon-1", amountIdr: 5000 }),
    ).rejects.toThrow("Pembayaran melebihi sisa kasbon");
    expect(await paymentSum(db, "kasbon-1")).toBe(6000);
  });

  test("payroll.setDeduction writes FIFO payroll payments and can lower them", async () => {
    const { client, db } = await openMemory();
    const supervisor: SessionUser = {
      id: "user-sup",
      name: "Sup",
      email: "sup@test.local",
      role: "supervisor",
    };
    await insertUser(client, supervisor);
    await insertEmployee(client, { id: "emp-1", name: "Mek" });
    await client.execute({
      sql: `INSERT INTO kasbon (
              id, employee_id, keperluan, amount_idr, status,
              disbursed_at, created_at
            ) VALUES
              ('k-old', 'emp-1', 'lama', 60, 'disbursed', 1000, 1000),
              ('k-new', 'emp-1', 'baru', 50, 'disbursed', 2000, 2000)`,
    });
    await client.execute({
      sql: `INSERT INTO payroll_period (id, year, month, start_date, end_date, pay_date)
            VALUES ('period-1', 2026, 8, '2026-08-01', '2026-08-31', '2026-09-01')`,
    });
    await client.execute({
      sql: `INSERT INTO payroll_line (
              id, period_id, employee_id, days_present, alpa_days, ongkos_percent,
              daily_pay_idr, job_share_idr, konsumsi_idr, bonus_idr,
              kasbon_balance_idr, kasbon_deduction_idr, take_home_idr, kasbon_remaining_idr
            ) VALUES (
              'line-1', 'period-1', 'emp-1', 0, 0, 0,
              100, 0, 0, 0,
              110, 0, 100, 110
            )`,
    });

    const sup = caller(db, supervisor);
    await sup.payroll.setDeduction({
      lineId: "line-1",
      kasbonDeductionIdr: 80,
    });

    const firstPays = await db
      .select()
      .from(kasbonPayment)
      .where(eq(kasbonPayment.source, "payroll"));
    expect(firstPays).toHaveLength(2);
    expect(
      firstPays.every(
        (row) => row.payrollLineId === "line-1" && row.source === "payroll",
      ),
    ).toBe(true);
    const byKasbon = Object.fromEntries(
      firstPays.map((row) => [row.kasbonId, row.amountIdr]),
    );
    expect(byKasbon["k-old"]).toBe(60);
    expect(byKasbon["k-new"]).toBe(20);

    const [olderAfter80] = await db
      .select({ status: kasbon.status })
      .from(kasbon)
      .where(eq(kasbon.id, "k-old"));
    expect(olderAfter80?.status).toBe("lunas");

    await sup.payroll.setDeduction({
      lineId: "line-1",
      kasbonDeductionIdr: 40,
    });

    const secondPays = await db
      .select()
      .from(kasbonPayment)
      .where(eq(kasbonPayment.source, "payroll"));
    expect(secondPays).toHaveLength(1);
    expect(secondPays[0]?.kasbonId).toBe("k-old");
    expect(secondPays[0]?.amountIdr).toBe(40);
    expect(secondPays[0]?.payrollLineId).toBe("line-1");
    expect(secondPays[0]?.source).toBe("payroll");

    const [olderAfter40] = await db
      .select({ status: kasbon.status })
      .from(kasbon)
      .where(eq(kasbon.id, "k-old"));
    expect(olderAfter40?.status).toBe("disbursed");
  });
});
