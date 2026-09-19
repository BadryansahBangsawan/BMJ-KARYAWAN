export const ABSEN_FULL = 100;
export const ABSEN_LATE = 90;
export const ABSEN_HALF = 50;
export const ABSEN_ALPA = 0;

export function absenLabel(value: number | undefined) {
  if (value === ABSEN_FULL) return "1";
  if (value === ABSEN_LATE) return "9>";
  if (value === ABSEN_HALF) return "0,5";
  if (value === ABSEN_ALPA) return "0";
  return "";
}

export function absenCaption(value: number | undefined) {
  if (value === ABSEN_FULL) return "Hadir";
  if (value === ABSEN_LATE) return "Telat 9>";
  if (value === ABSEN_HALF) return "Setengah";
  if (value === ABSEN_ALPA) return "Alpa";
  return "Kosong";
}

export function absenToneClass(value: number | undefined) {
  if (value === ABSEN_FULL) return "bg-success text-success-foreground";
  if (value === ABSEN_LATE) return "bg-[oklch(0.86_0.14_95)] text-[oklch(0.28_0.06_85)]";
  if (value === ABSEN_HALF) return "bg-destructive/35 text-destructive";
  if (value === ABSEN_ALPA) return "bg-destructive text-white";
  return "bg-muted text-muted-foreground";
}

/** Past/today workdays with no row display as alpa (0). Future stays empty. */
export function displayedAbsenValue(
  value: number | undefined,
  workDate: string,
  today: string,
  isSunday = false,
) {
  if (value !== undefined) return value;
  if (isSunday || workDate > today) return undefined;
  return ABSEN_ALPA;
}
