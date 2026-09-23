import { describe, expect, test } from "bun:test";

import {
  allocatePayrollDeduction,
  alpaDays,
  clampKasbonDeduction,
  isPastYearMonth,
  isPayrollLocked,
  isSundayJayapura,
  kasbonStatusAfterSisa,
  presentHundredths,
  splitBengkelOngkos,
  todayYmd,
} from "./domain";

describe("domain", () => {
  test("splitBengkelOngkos clamps percent and leaves remainder to mechanic", () => {
    expect(splitBengkelOngkos(10_000, 0)).toEqual({
      bengkelIdr: 0,
      mechanicIdr: 10_000,
    });
    expect(splitBengkelOngkos(10_000, 100)).toEqual({
      bengkelIdr: 10_000,
      mechanicIdr: 0,
    });
    expect(splitBengkelOngkos(10_000, 30)).toEqual({
      bengkelIdr: 3_000,
      mechanicIdr: 7_000,
    });
    const half = splitBengkelOngkos(10_001, 50);
    expect(half.bengkelIdr).toBe(Math.round((10_001 * 50) / 100));
    expect(half.mechanicIdr).toBe(10_001 - half.bengkelIdr);
  });

  test("presentHundredths counts 90 as a full day", () => {
    expect(
      [100, 90, 50, 0].reduce((sum, value) => sum + presentHundredths(value), 0),
    ).toBe(250);
    expect(
      Array.from({ length: 10 }, () => 90).reduce(
        (sum, value) => sum + presentHundredths(value),
        0,
      ),
    ).toBe(1000);
  });

  test("alpaDays counts missing and non-present marks on or before asOf", () => {
    const workDates = Array.from(
      { length: 22 },
      (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
    );
    const marks = {
      "2026-01-01": 100,
      "2026-01-02": 100,
      "2026-01-03": 100,
    };
    expect(alpaDays(workDates, marks, "2026-01-23")).toBe(19);
  });

  test("clampKasbonDeduction never exceeds pay or sisa", () => {
    expect(clampKasbonDeduction(999, 400, 250)).toBe(250);
    expect(clampKasbonDeduction(999, 100, 250)).toBe(100);
    expect(clampKasbonDeduction(-1, 100, 250)).toBe(0);
  });

  test("allocatePayrollDeduction is FIFO and kasbonStatusAfterSisa follows sisa", () => {
    const older = {
      id: "older",
      amountIdr: 60,
      paidIdr: 0,
      disbursedAt: 1,
      createdAt: 1,
    };
    const newer = {
      id: "newer",
      amountIdr: 50,
      paidIdr: 0,
      disbursedAt: 2,
      createdAt: 2,
    };
    expect(allocatePayrollDeduction([older, newer], 80)).toEqual([
      { kasbonId: "older", amountIdr: 60 },
      { kasbonId: "newer", amountIdr: 20 },
    ]);
    expect(
      allocatePayrollDeduction(
        [
          { ...older, paidIdr: 0 },
          { ...newer, paidIdr: 0 },
        ],
        40,
      ),
    ).toEqual([{ kasbonId: "older", amountIdr: 40 }]);
    expect(kasbonStatusAfterSisa(0)).toBe("lunas");
    expect(kasbonStatusAfterSisa(20)).toBe("disbursed");
  });

  test("isSundayJayapura uses civil dates and rejects impossible days", () => {
    expect(isSundayJayapura("2026-09-20")).toBe(true);
    expect(isSundayJayapura("2026-09-23")).toBe(false);
    expect(isSundayJayapura("2026-02-31")).toBe(true);
  });

  test("todayYmd is Jayapura civil date", () => {
    expect(todayYmd(new Date("2026-09-22T16:00:00Z"))).toBe("2026-09-23");
    expect(todayYmd(new Date("2026-09-22T14:59:00Z"))).toBe("2026-09-22");
  });

  test("isPayrollLocked auto-locks past months", () => {
    const now = new Date("2026-09-23T07:00:00+09:00");
    expect(isPastYearMonth(2026, 8, now)).toBe(true);
    expect(isPastYearMonth(2026, 9, now)).toBe(false);
    expect(isPayrollLocked(2026, 8, null, now)).toBe(true);
    expect(isPayrollLocked(2026, 9, null, now)).toBe(false);
    expect(isPayrollLocked(2026, 9, now, now)).toBe(true);
  });
});
