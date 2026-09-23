export type UserRole = "supervisor" | "kasir" | "mekanik";
export type AbsenValue = 0 | 50 | 90 | 100;

export type DebtSlice = {
  id: string;
  amountIdr: number;
  paidIdr: number;
  disbursedAt: number | null;
  createdAt: number;
};

export function sessionRole(
  user: { role?: string | null } | string | null | undefined,
): UserRole {
  const role = typeof user === "string" ? user : user?.role;
  if (role === "supervisor" || role === "kasir" || role === "mekanik") {
    return role;
  }
  return "mekanik";
}

export function ymdInJayapura(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jayapura" });
}

export function todayYmd(now?: Date): string {
  return ymdInJayapura(now ?? new Date());
}

export function isSundayJayapura(workDate: string): boolean {
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

export function monthRange(year: number, month: number): {
  startDate: string;
  endDate: string;
  payDate: string;
} {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${ym}-01`;
  const endDate = `${ym}-${String(last).padStart(2, "0")}`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const payDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { startDate, endDate, payDate };
}

export function workDatesMonSat(year: number, month: number): string[] {
  const { endDate } = monthRange(year, month);
  const last = Number(endDate.slice(8));
  const dates: string[] = [];
  for (let day = 1; day <= last; day++) {
    const workDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!isSundayJayapura(workDate)) dates.push(workDate);
  }
  return dates;
}

export function presentHundredths(value: number): number {
  if (value === 100 || value === 90) return 100;
  if (value === 50) return 50;
  return 0;
}

export function displayedAbsenValue(
  value: number | undefined,
  workDate: string,
  today: string,
  isSunday?: boolean,
): number | undefined {
  if (value !== undefined) return value;
  const sunday = isSunday ?? isSundayJayapura(workDate);
  if (sunday || workDate > today) return undefined;
  return 0;
}

export function alpaDays(
  workDates: readonly string[],
  marks: Readonly<Record<string, number>>,
  asOf: string,
): number {
  let count = 0;
  for (const date of workDates) {
    if (date > asOf) continue;
    const value = marks[date];
    if (value !== 100 && value !== 90 && value !== 50) count += 1;
  }
  return count;
}

export function clampKasbonDeduction(
  amountIdr: number,
  kasbonBalanceIdr: number,
  payIdr: number,
): number {
  return Math.min(Math.max(0, amountIdr), kasbonBalanceIdr, Math.max(0, payIdr));
}

export function allocatePayrollDeduction(
  debts: readonly DebtSlice[],
  deductionIdr: number,
): { kasbonId: string; amountIdr: number }[] {
  const open = debts.filter((debt) => debt.amountIdr - debt.paidIdr > 0);
  open.sort((a, b) => {
    const ta = a.disbursedAt ?? a.createdAt;
    const tb = b.disbursedAt ?? b.createdAt;
    if (ta !== tb) return ta - tb;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  let remaining = deductionIdr;
  const payments: { kasbonId: string; amountIdr: number }[] = [];
  for (const debt of open) {
    if (remaining <= 0) break;
    const sisa = debt.amountIdr - debt.paidIdr;
    const amountIdr = Math.min(remaining, sisa);
    payments.push({ kasbonId: debt.id, amountIdr });
    remaining -= amountIdr;
  }
  return payments;
}

export function kasbonStatusAfterSisa(sisaIdr: number): "disbursed" | "lunas" {
  return sisaIdr <= 0 ? "lunas" : "disbursed";
}

export function splitBengkelOngkos(amountIdr: number, bengkelPercent: number) {
  const pct = Math.min(100, Math.max(0, bengkelPercent));
  const bengkelIdr = Math.round((amountIdr * pct) / 100);
  return { bengkelIdr, mechanicIdr: amountIdr - bengkelIdr };
}
