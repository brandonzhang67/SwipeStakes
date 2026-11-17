import { formatHour, hourKey } from "./time";
import type { HourlyPoint } from "./weather";

/**
 * Pricing and settlement for weather parlay legs. Pure functions, no I/O, so they're
 * easy to unit test.
 *
 * A window [startHour, endHour) on `date` covers:
 *  - temperature readings at each hour mark from start to end inclusive
 *    (8pm-9pm => the 8:00pm and 9:00pm readings), and
 *  - precipitation for each hour inside the window (Open-Meteo reports precipitation
 *    at hour H as the total over the hour ending at H, so we read start+1 .. end).
 */

export type RainLeg = {
  kind: "rain";
  date: string;
  startHour: number;
  endHour: number;
  pick: "yes" | "no";
};

export type TempLeg = {
  kind: "temp";
  date: string;
  startHour: number;
  endHour: number;
  /** Bet on the HIGH temperature (F) in the window. */
  op: "over" | "under" | "between";
  /** over/under: the threshold. between: the low end (inclusive). */
  low: number;
  /** between only: the high end (inclusive). */
  high?: number;
};

export type LegSpec = RainLeg | TempLeg;

/** Measurable precipitation: 0.01 in. */
export const RAIN_THRESHOLD_IN = 0.01;
export const MIN_PROB = 0.02;
export const MAX_PROB = 0.98;

export function legLabel(leg: LegSpec): string {
  const when = `${formatHour(leg.startHour)}–${formatHour(leg.endHour)} on ${leg.date}`;
  if (leg.kind === "rain") return `${leg.pick === "yes" ? "Rain" : "No rain"} ${when}`;
  if (leg.op === "between") return `High between ${leg.low}°F and ${leg.high}°F, ${when}`;
  return `High ${leg.op} ${leg.low}°F, ${when}`;
}

export function windowKeys(leg: LegSpec) {
  const tempKeys: string[] = [];
  const precipKeys: string[] = [];
  for (let h = leg.startHour; h <= leg.endHour; h++) tempKeys.push(hourKey(leg.date, h));
  for (let h = leg.startHour + 1; h <= leg.endHour; h++) precipKeys.push(hourKey(leg.date, h));
  return { tempKeys, precipKeys };
}

function pick(points: Map<string, HourlyPoint>, keys: string[]): HourlyPoint[] | null {
  const out: HourlyPoint[] = [];
  for (const k of keys) {
    const p = points.get(k);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf approximation, |err| < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Forecast uncertainty (F, one std dev) for a window starting `hoursAhead` from now. */
export function tempSigma(hoursAhead: number): number {
  return Math.min(6, 1.5 + 0.08 * Math.max(0, hoursAhead));
}

export type Priced = {
  probability: number;
  forecast: { highF?: number; sigma?: number; maxPrecipProb?: number };
};

/**
 * Probability the leg hits, according to the forecast.
 *
 * Rain: we use the highest hourly chance of precipitation in the window. That's a
 * conservative estimate of "any rain in the window" (hours are strongly correlated, so
 * multiplying them as if independent would overstate it badly).
 *
 * Temperature: the window's forecast high is the mean of a normal distribution whose
 * spread grows with lead time.
 */
export function priceLeg(leg: LegSpec, points: Map<string, HourlyPoint>, hoursAhead: number): Priced {
  const { tempKeys, precipKeys } = windowKeys(leg);
  if (leg.kind === "rain") {
    const hrs = pick(points, precipKeys);
    if (!hrs) throw new Error("No forecast for that window yet");
    const maxP = Math.max(...hrs.map((h) => h.precipProb ?? 0)) / 100;
    const p = leg.pick === "yes" ? maxP : 1 - maxP;
    return { probability: clampProb(p), forecast: { maxPrecipProb: Math.round(maxP * 100) } };
  }
  const hrs = pick(points, tempKeys);
  if (!hrs) throw new Error("No forecast for that window yet");
  const mean = Math.max(...hrs.map((h) => h.tempF));
  const sigma = tempSigma(hoursAhead);
  const z = (t: number) => (t - mean) / sigma;
  let p: number;
  if (leg.op === "over") p = 1 - normalCdf(z(leg.low));
  else if (leg.op === "under") p = normalCdf(z(leg.low));
  else p = normalCdf(z(leg.high!)) - normalCdf(z(leg.low));
  return {
    probability: clampProb(p),
    forecast: { highF: Math.round(mean * 10) / 10, sigma: Math.round(sigma * 10) / 10 },
  };
}

export function clampProb(p: number): number {
  return Math.min(MAX_PROB, Math.max(MIN_PROB, p));
}

/** Decimal odds (payout per 1 staked, stake included). margin = 0 is fair odds. */
export function oddsFor(probability: number, margin = 0): number {
  return Math.round(((1 - margin) / probability) * 100) / 100;
}

export function combineOdds(legOdds: number[], cap: number): number {
  const product = legOdds.reduce((a, b) => a * b, 1);
  return Math.round(Math.min(cap, product) * 100) / 100;
}

export type Observed = { highF?: number; totalPrecipIn?: number };

/** Settle a leg against observed weather. Returns null if data isn't available yet. */
export function settleLeg(
  leg: LegSpec,
  points: Map<string, HourlyPoint>,
): { outcome: "won" | "lost"; observed: Observed } | null {
  const { tempKeys, precipKeys } = windowKeys(leg);
  if (leg.kind === "rain") {
    const hrs = pick(points, precipKeys);
    if (!hrs) return null;
    const total = Math.round(hrs.reduce((s, h) => s + h.precipIn, 0) * 100) / 100;
    const rained = total >= RAIN_THRESHOLD_IN;
    return { outcome: rained === (leg.pick === "yes") ? "won" : "lost", observed: { totalPrecipIn: total } };
  }
  const hrs = pick(points, tempKeys);
  if (!hrs) return null;
  const high = Math.max(...hrs.map((h) => h.tempF));
  const hit =
    leg.op === "over" ? high > leg.low : leg.op === "under" ? high < leg.low : high >= leg.low && high <= leg.high!;
  return { outcome: hit ? "won" : "lost", observed: { highF: high } };
}
