export const DISPLAY_TIMEZONE = "Asia/Shanghai";

export function dateKey(date: Date, timeZone = DISPLAY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function atZonedTime(day: string, time: string, timeZone = DISPLAY_TIMEZONE): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, date, hour, minute);
  let utc = wallTime;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(utc));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const rendered = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
    utc += wallTime - rendered;
  }
  return new Date(utc);
}

export function calendarRange(now: Date, days: number, timeZone = DISPLAY_TIMEZONE) {
  const today = dateKey(now, timeZone);
  const firstDay = new Date(`${today}T00:00:00Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - (days - 1));
  const nextDay = new Date(`${today}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { start: atZonedTime(firstDay.toISOString().slice(0, 10), "00:00", timeZone), end: atZonedTime(nextDay.toISOString().slice(0, 10), "00:00", timeZone) };
}
