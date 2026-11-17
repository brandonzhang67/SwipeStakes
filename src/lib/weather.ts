import { createHash } from "node:crypto";
import { config } from "./config";
import { get, run } from "./db";
import { AppError } from "./errors";
import { addDays, etDate, hourKey } from "./time";

/** One hour in New Haven. Keys are naive Eastern wall-clock "YYYY-MM-DDTHH:00". */
export type HourlyPoint = {
  time: string;
  tempF: number;
  /** Chance of precipitation in the hour (0-100). Null for some past hours. */
  precipProb: number | null;
  /** Precipitation over the preceding hour, inches. */
  precipIn: number;
};

export type Forecast = {
  source: "open-meteo" | "mock";
  fetchedAt: string;
  points: HourlyPoint[];
};

const FRESH_MS = 10 * 60 * 1000;
const STALE_OK_MS = 6 * 60 * 60 * 1000;

/**
 * Hourly weather for New Haven covering the past 2 days (used to settle parlays) and the
 * next 2 days (used to price them). Cached in SQLite so we stay well inside Open-Meteo's
 * free-tier limits.
 */
export async function getForecast(): Promise<Forecast> {
  if (config.weatherProvider === "mock") return mockForecast();

  const key = "open-meteo:new-haven";
  const cached = get<{ fetched_at: string; payload: string }>("SELECT * FROM weather_cache WHERE key = ?", key);
  const age = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
  if (cached && age < FRESH_MS) return JSON.parse(cached.payload);

  try {
    const fresh = await fetchOpenMeteo();
    run(
      "INSERT INTO weather_cache (key, fetched_at, payload) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload",
      key,
      fresh.fetchedAt,
      JSON.stringify(fresh),
    );
    return fresh;
  } catch (e) {
    if (cached && age < STALE_OK_MS) return JSON.parse(cached.payload);
    throw new AppError(`Weather data is unavailable right now (${(e as Error).message}). Try again shortly.`, 503);
  }
}

async function fetchOpenMeteo(): Promise<Forecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(config.location.latitude),
    longitude: String(config.location.longitude),
    hourly: "temperature_2m,precipitation_probability,precipitation",
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
    timezone: config.timeZone,
    past_days: "2",
    forecast_days: "3",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as OpenMeteoResponse | null;
  if (!res.ok || !body || body.error || !body.hourly) {
    throw new Error(body?.reason ?? `HTTP ${res.status}`);
  }
  const h = body.hourly;
  const points: HourlyPoint[] = h.time.map((time, i) => ({
    time,
    tempF: h.temperature_2m[i],
    precipProb: h.precipitation_probability[i],
    precipIn: h.precipitation[i] ?? 0,
  }));
  return {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    points: points.filter((p) => typeof p.tempF === "number"),
  };
}

type OpenMeteoResponse = {
  error?: boolean;
  reason?: string;
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
  };
};

/**
 * Deterministic fake weather for offline development (WEATHER_PROVIDER=mock).
 * Never use it for real stakes: it is the same for everyone and fully predictable.
 */
export function mockForecast(): Forecast {
  const today = etDate();
  const points: HourlyPoint[] = [];
  for (let day = -2; day <= 2; day++) {
    const date = addDays(today, day);
    const dayHash = hashNum(`day:${date}`);
    const base = 38 + dayHash * 20; // daily mean, 38-58F
    const wetness = hashNum(`wet:${date}`); // how rainy the day is
    for (let h = 0; h < 24; h++) {
      const tempF = Math.round((base + 9 * Math.sin(((h - 9) / 24) * 2 * Math.PI)) * 10) / 10;
      const precipProb = Math.round(Math.min(95, Math.max(0, wetness * 90 + 15 * Math.sin(h / 3 + dayHash * 6) - 5)));
      const rained = hashNum(`rain:${date}:${h}`) * 100 < precipProb;
      points.push({
        time: hourKey(date, h),
        tempF,
        precipProb,
        precipIn: rained ? Math.round(hashNum(`amt:${date}:${h}`) * 12) / 100 + 0.01 : 0,
      });
    }
  }
  return { source: "mock", fetchedAt: new Date().toISOString(), points };
}

function hashNum(s: string): number {
  return parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

export function indexPoints(points: HourlyPoint[]): Map<string, HourlyPoint> {
  return new Map(points.map((p) => [p.time, p]));
}
