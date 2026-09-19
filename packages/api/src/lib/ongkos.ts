export function splitBengkelOngkos(amountIdr: number, bengkelPercent: number) {
  const pct = Math.min(100, Math.max(0, bengkelPercent));
  const bengkelIdr = Math.round((amountIdr * pct) / 100);
  return { bengkelIdr, mechanicIdr: amountIdr - bengkelIdr };
}
