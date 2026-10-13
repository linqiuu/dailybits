import Holidays from "date-holidays";

export function isWorkingDay(date: Date, timezone = "Asia/Shanghai"): boolean {
  if (process.env.SKIP_NON_WORKING_DAYS === "false") return true;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  const calendar = new Holidays(process.env.HOLIDAY_COUNTRY || "CN");
  return weekday !== "Sat" && weekday !== "Sun" && !calendar.isHoliday(date);
}
