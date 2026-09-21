const TZ = "Asia/Jayapura";

export function formatIdr(n: number) {
  return n.toLocaleString("id-ID");
}

export function formatRp(n: number) {
  return `Rp ${formatIdr(n)}`;
}

export function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function jayapuraYearMonth(ymd = todayYmd()) {
  const [yearPart, monthPart] = ymd.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  return { year, month };
}

export function monthBounds(ymd = todayYmd()) {
  const [year, month] = ymd.split("-");
  const last = new Date(Number(year), Number(month), 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
  };
}

export function previousMonthBounds(ymd = todayYmd()) {
  const { year, month } = jayapuraYearMonth(ymd);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const last = new Date(prevYear, prevMonth, 0).getDate();
  const mm = String(prevMonth).padStart(2, "0");
  return {
    from: `${prevYear}-${mm}-01`,
    to: `${prevYear}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

export function formatLongDate(ymd?: string) {
  const date = ymd ? new Date(`${ymd}T12:00:00+09:00`) : new Date();
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
}

export function todayParts(ymd = todayYmd()) {
  const date = new Date(`${ymd}T12:00:00+09:00`);
  return {
    ymd,
    day: Number(ymd.slice(8)),
    weekday: date.toLocaleDateString("id-ID", { weekday: "long", timeZone: TZ }),
    monthYear: date.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: TZ }),
  };
}

export function weekDays(ymd = todayYmd(), span = 3) {
  const date = new Date(`${ymd}T12:00:00+09:00`);
  const days: Array<{
    ymd: string;
    day: number;
    label: string;
    isToday: boolean;
    isSunday: boolean;
    fromToday: number;
  }> = [];
  for (let offset = -span; offset <= span; offset += 1) {
    const cell = new Date(date);
    cell.setUTCDate(cell.getUTCDate() + offset);
    const cellYmd = cell.toISOString().slice(0, 10);
    days.push({
      ymd: cellYmd,
      day: Number(cellYmd.slice(8)),
      label: cell.toLocaleDateString("id-ID", { weekday: "short", timeZone: TZ }),
      isToday: offset === 0,
      isSunday: cell.getUTCDay() === 0,
      fromToday: offset,
    });
  }
  return days;
}

export function monthLabel(year: number, month: number) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ymdFromMs(value: string | number | Date | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function formatDateTime(value: string | number | Date | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("id-ID", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(value: string | number | Date | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
