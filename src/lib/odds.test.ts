import { describe, expect, it } from "vitest";
import {
  combineOdds,
  legLabel,
  normalCdf,
  oddsFor,
  priceLeg,
  settleLeg,
  windowKeys,
  type LegSpec,
} from "./odds";
import type { HourlyPoint } from "./weather";
import { coinflipMessage, hashSeed, roll } from "./fair";

const DATE = "2026-11-18";

function points(rows: Array<[hour: number, tempF: number, precipProb: number, precipIn: number]>) {
  return new Map<string, HourlyPoint>(
    rows.map(([h, tempF, precipProb, precipIn]) => {
      const time = `${DATE}T${String(h).padStart(2, "0")}:00`;
      return [time, { time, tempF, precipProb, precipIn }];
    }),
  );
}

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
});

describe("window", () => {
  it("8pm-9pm reads the 8pm and 9pm temperatures and the 9pm precip total", () => {
    const leg: LegSpec = { kind: "temp", date: DATE, startHour: 20, endHour: 21, op: "over", low: 40 };
    expect(windowKeys(leg)).toEqual({
      tempKeys: [`${DATE}T20:00`, `${DATE}T21:00`],
      precipKeys: [`${DATE}T21:00`],
    });
  });

  it("a window ending at midnight rolls into the next day", () => {
    const leg: LegSpec = { kind: "rain", date: DATE, startHour: 23, endHour: 24, pick: "yes" };
    expect(windowKeys(leg).precipKeys).toEqual(["2026-11-19T00:00"]);
  });
});

describe("pricing", () => {
  const pts = points([
    [20, 44, 10, 0],
    [21, 46, 70, 0.05],
    [22, 45, 30, 0],
  ]);

  it("rain uses the highest hourly chance in the window", () => {
    const yes = priceLeg({ kind: "rain", date: DATE, startHour: 20, endHour: 22, pick: "yes" }, pts, 10);
    const no = priceLeg({ kind: "rain", date: DATE, startHour: 20, endHour: 22, pick: "no" }, pts, 10);
    expect(yes.probability).toBeCloseTo(0.7);
    expect(no.probability).toBeCloseTo(0.3);
  });

  it("temperature over the forecast high is a coin flip-ish, far above is unlikely", () => {
    const at = priceLeg({ kind: "temp", date: DATE, startHour: 20, endHour: 21, op: "over", low: 46 }, pts, 5);
    const far = priceLeg({ kind: "temp", date: DATE, startHour: 20, endHour: 21, op: "over", low: 60 }, pts, 5);
    expect(at.probability).toBeCloseTo(0.5, 2);
    expect(far.probability).toBe(0.02); // clamped
    expect(at.forecast.highF).toBe(46);
  });

  it("over + under at the same threshold sum to 1", () => {
    const over = priceLeg({ kind: "temp", date: DATE, startHour: 20, endHour: 22, op: "over", low: 45 }, pts, 3);
    const under = priceLeg({ kind: "temp", date: DATE, startHour: 20, endHour: 22, op: "under", low: 45 }, pts, 3);
    expect(over.probability + under.probability).toBeCloseTo(1, 6);
  });

  it("throws when the forecast doesn't cover the window", () => {
    expect(() => priceLeg({ kind: "rain", date: DATE, startHour: 1, endHour: 3, pick: "yes" }, pts, 1)).toThrow();
  });

  it("fair odds are 1/p, parlays multiply and cap", () => {
    expect(oddsFor(0.5)).toBe(2);
    expect(oddsFor(0.25, 0.05)).toBe(3.8);
    expect(combineOdds([2, 3, 1.5], 100)).toBe(9);
    expect(combineOdds([50, 50], 250)).toBe(250);
  });
});

describe("settlement", () => {
  const pts = points([
    [20, 44.2, 10, 0],
    [21, 46.8, 70, 0.02],
  ]);

  it("rain resolves on measurable precipitation", () => {
    expect(settleLeg({ kind: "rain", date: DATE, startHour: 20, endHour: 21, pick: "yes" }, pts)?.outcome).toBe("won");
    expect(settleLeg({ kind: "rain", date: DATE, startHour: 20, endHour: 21, pick: "no" }, pts)?.outcome).toBe("lost");
  });

  it("temperature resolves on the window high", () => {
    const between: LegSpec = { kind: "temp", date: DATE, startHour: 20, endHour: 21, op: "between", low: 45, high: 47 };
    expect(settleLeg(between, pts)).toEqual({ outcome: "won", observed: { highF: 46.8 } });
    expect(legLabel(between)).toBe("High between 45°F and 47°F, 8pm–9pm on 2026-11-18");
  });

  it("returns null until data exists", () => {
    expect(settleLeg({ kind: "rain", date: DATE, startHour: 21, endHour: 23, pick: "yes" }, pts)).toBeNull();
  });
});

describe("provably fair", () => {
  it("is deterministic and verifiable", () => {
    const seed = "a".repeat(64);
    expect(hashSeed(seed)).toHaveLength(64);
    const r = roll(seed, coinflipMessage(1, "abc"));
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    expect(roll(seed, coinflipMessage(1, "abc"))).toBe(r);
    expect(roll(seed, coinflipMessage(1, "abd"))).not.toBe(r);
  });
});
