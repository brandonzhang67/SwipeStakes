import { config } from "./config";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: config.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function etParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** "YYYY-MM-DD" in Eastern time. */
export function etDate(d = new Date()): string {
  const p = etParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Current Eastern hour, 0-23. */
export function etHour(d = new Date()): number {
  return etParts(d).hour;
}

/** Add days to a "YYYY-MM-DD" string. */
export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/**
 * Naive local hour key "YYYY-MM-DDTHH:00" for `hour` hours after midnight of `date`
 * (hour may be >= 24). Matches Open-Meteo's hourly keys when timezone=America/New_York.
 */
export function hourKey(date: string, hour: number): string {
  const d = addDays(date, Math.floor(hour / 24));
  return `${d}T${String(hour % 24).padStart(2, "0")}:00`;
}

/** Convert an Eastern wall-clock time to a UTC instant. */
export function etToUtc(date: string, hour: number, minute = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Offset of Eastern time from UTC around that instant.
  const p = etParts(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess - (asUtc - guess));
}

export function formatHour(h: number): string {
  const hh = h % 24;
  const suffix = hh < 12 ? "am" : "pm";
  const n = hh % 12 === 0 ? 12 : hh % 12;
  return `${n}${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
