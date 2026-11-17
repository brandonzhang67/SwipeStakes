import { config } from "./config";
import { all, get, run, tx } from "./db";
import { AppError } from "./errors";
import { emit } from "./feed";
import { getWallet, move } from "./ledger";
import { assertCanStake } from "./limits";
import { fmtCents } from "./money";
import {
  combineOdds,
  legLabel,
  oddsFor,
  priceLeg,
  settleLeg,
  type LegSpec,
} from "./odds";
import { addDays, etDate, etToUtc, nowIso } from "./time";
import { getHouse, type User } from "./users";
import { getForecast, indexPoints, type HourlyPoint } from "./weather";

/**
 * Weather parlays on New Haven: "Will it rain 4pm-6pm?", "Will the high between 8pm
 * and 9pm be over 45°F?". Combine up to six legs and every leg has to hit.
 *
 * Unlike coin flips there is no natural counterparty, so the sponsor pool banks these
 * at fair odds straight from the forecast (PARLAY_MARGIN defaults to 0, so no house
 * edge), with a cap on the payout and on the pool's total exposure.
 */

const HOUR_MS = 3600_000;

export type QuotedLeg = LegSpec & {
  label: string;
  probability: number;
  odds: number;
  forecast: Record<string, number | undefined>;
};

export type Quote = {
  legs: QuotedLeg[];
  odds: number;
  probability: number;
  source: "open-meteo" | "mock";
};

function int(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new AppError(`${name} must be a whole number`);
  return n;
}

function num(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < -40 || n > 130) throw new AppError(`${name} must be a temperature in °F`);
  return Math.round(n * 10) / 10;
}

export function parseLeg(raw: unknown, now = new Date()): LegSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const today = etDate(now);
  const date = String(r.date ?? "");
  if (date !== today && date !== addDays(today, 1)) throw new AppError("Legs can be for today or tomorrow");
  const startHour = int(r.startHour, "Start hour");
  const endHour = int(r.endHour, "End hour");
  if (startHour < 0 || startHour > 23) throw new AppError("Start hour must be 0-23");
  if (endHour <= startHour || endHour > 24 || endHour - startHour > 12) {
    throw new AppError("Windows run 1 to 12 hours and end by midnight");
  }
  if (etToUtc(date, startHour) <= now) throw new AppError(`The ${startHour}:00 window has already started`);

  if (r.kind === "rain") {
    if (r.pick !== "yes" && r.pick !== "no") throw new AppError("Pick rain yes or no");
    return { kind: "rain", date, startHour, endHour, pick: r.pick };
  }
  if (r.kind === "temp") {
    const op = r.op;
    if (op !== "over" && op !== "under" && op !== "between") throw new AppError("Pick over, under or between");
    const low = num(r.low, "Temperature");
    if (op === "between") {
      const high = num(r.high, "Upper temperature");
      if (high - low < 1) throw new AppError("The range must be at least 1°F wide");
      return { kind: "temp", date, startHour, endHour, op, low, high };
    }
    return { kind: "temp", date, startHour, endHour, op, low };
  }
  throw new AppError("Unknown leg type");
}

function overlaps(a: LegSpec, b: LegSpec) {
  return a.kind === b.kind && a.date === b.date && a.startHour < b.endHour && b.startHour < a.endHour;
}

export function quoteLegs(rawLegs: unknown, points: HourlyPoint[], source: Quote["source"], now = new Date()): Quote {
  if (!Array.isArray(rawLegs) || rawLegs.length === 0) throw new AppError("Add at least one leg");
  if (rawLegs.length > config.parlayMaxLegs) throw new AppError(`At most ${config.parlayMaxLegs} legs`);
  const legs = rawLegs.map((l) => parseLeg(l, now));
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      if (overlaps(legs[i], legs[j])) {
        throw new AppError("Two legs of the same type can't cover overlapping hours");
      }
    }
  }
  const index = indexPoints(points);
  const quoted = legs.map((leg) => {
    const hoursAhead = (etToUtc(leg.date, leg.startHour).getTime() - now.getTime()) / HOUR_MS;
    let priced;
    try {
      priced = priceLeg(leg, index, hoursAhead);
    } catch (e) {
      throw new AppError((e as Error).message);
    }
    return {
      ...leg,
      label: legLabel(leg),
      probability: Math.round(priced.probability * 1000) / 1000,
      odds: oddsFor(priced.probability, config.parlayMargin),
      forecast: priced.forecast,
    };
  });
  return {
    legs: quoted,
    odds: combineOdds(quoted.map((l) => l.odds), config.parlayMaxOdds),
    probability: quoted.reduce((p, l) => p * l.probability, 1),
    source,
  };
}

export async function quote(rawLegs: unknown): Promise<Quote> {
  const f = await getForecast();
  return quoteLegs(rawLegs, f.points, f.source);
}

/** Sum of potential payouts the sponsor pool owes if every open parlay hits. */
function openExposureCents(): number {
  return (
    get<{ total: number | null }>("SELECT SUM(potential_payout_cents) AS total FROM parlays WHERE status = 'open'")
      ?.total ?? 0
  );
}

export async function placeParlay(user: User, rawLegs: unknown, stake: { swipes?: unknown; cents?: unknown }) {
  const q = await quote(rawLegs);
  const swipes = stake.swipes ? int(stake.swipes, "Swipes") : 0;
  const cents = stake.cents ? int(stake.cents, "Stake") : 0;
  if ((swipes > 0) === (cents > 0)) throw new AppError("Stake either swipes or dining dollars");
  if (swipes < 0 || swipes > 3) throw new AppError("Stake 1 to 3 swipes");
  if (cents < 0 || (cents > 0 && cents < 100)) throw new AppError("Minimum stake is $1.00");

  return tx(() => {
    const value = assertCanStake(user, { swipes, cents });
    const payout = Math.round(value * q.odds);
    if (payout > config.parlayMaxPayoutCents) {
      const maxStake = Math.floor(config.parlayMaxPayoutCents / q.odds);
      throw new AppError(`Max payout is ${fmtCents(config.parlayMaxPayoutCents)}. Lower your stake to ${fmtCents(maxStake)} or less.`);
    }
    const house = getHouse();
    if (getWallet(house.id).cents < openExposureCents() + payout) {
      throw new AppError("The sponsor pool can't cover that payout right now. Try a smaller stake.", 409);
    }
    const locksAt = new Date(Math.min(...q.legs.map((l) => etToUtc(l.date, l.startHour).getTime())));
    const id = run(
      `INSERT INTO parlays (user_id, stake_swipes, stake_cents, stake_value_cents, odds, potential_payout_cents, locks_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      swipes,
      cents,
      value,
      q.odds,
      payout,
      locksAt.toISOString(),
      nowIso(),
    );
    for (const l of q.legs) {
      const params =
        l.kind === "rain" ? { pick: l.pick } : { op: l.op, low: l.low, ...(l.op === "between" ? { high: l.high } : {}) };
      run(
        `INSERT INTO parlay_legs (parlay_id, kind, date, start_hour, end_hour, params, label, probability, odds, forecast)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        l.kind,
        l.date,
        l.startHour,
        l.endHour,
        JSON.stringify(params),
        l.label,
        l.probability,
        l.odds,
        JSON.stringify(l.forecast),
      );
    }
    const ref = { type: "parlay", id };
    move(user.id, -swipes, -cents, "parlay_stake", ref, value);
    move(house.id, swipes, cents, "parlay_stake", ref);
    emit(
      "parlay",
      `${user.display_name} built a ${q.legs.length}-leg weather parlay at ${q.odds.toFixed(2)}x`,
      user.id,
    );
    return { id, odds: q.odds, payoutCents: payout };
  });
}

type LegRow = {
  id: number;
  parlay_id: number;
  kind: "rain" | "temp";
  date: string;
  start_hour: number;
  end_hour: number;
  params: string;
  label: string;
  probability: number;
  odds: number;
  forecast: string;
  outcome: "pending" | "won" | "lost" | "void";
  observed: string | null;
};

type ParlayRow = {
  id: number;
  user_id: number;
  stake_swipes: number;
  stake_cents: number;
  stake_value_cents: number;
  odds: number;
  potential_payout_cents: number;
  status: "open" | "won" | "lost" | "void";
  locks_at: string;
  created_at: string;
  settled_at: string | null;
};

function legSpec(row: LegRow): LegSpec {
  return { kind: row.kind, date: row.date, startHour: row.start_hour, endHour: row.end_hour, ...JSON.parse(row.params) };
}

/** Settle every leg whose window ended over an hour ago, then pay out finished parlays. */
export async function settleDueParlays(now = new Date()) {
  const pending = all<LegRow>(
    "SELECT l.* FROM parlay_legs l JOIN parlays p ON p.id = l.parlay_id WHERE p.status = 'open' AND l.outcome = 'pending'",
  );
  const due = pending.filter((l) => etToUtc(l.date, l.end_hour).getTime() + HOUR_MS <= now.getTime());
  if (due.length === 0) return;

  let points: Map<string, HourlyPoint>;
  try {
    points = indexPoints((await getForecast()).points);
  } catch {
    return; // Try again on the next request.
  }

  tx(() => {
    const touched = new Set<number>();
    for (const leg of due) {
      const res = settleLeg(legSpec(leg), points);
      if (res) {
        run("UPDATE parlay_legs SET outcome = ?, observed = ? WHERE id = ?", res.outcome, JSON.stringify(res.observed), leg.id);
        touched.add(leg.parlay_id);
      } else if (etToUtc(leg.date, leg.end_hour).getTime() + 24 * HOUR_MS <= now.getTime()) {
        // No observation a day later: void rather than guess.
        run("UPDATE parlay_legs SET outcome = 'void' WHERE id = ?", leg.id);
        touched.add(leg.parlay_id);
      }
    }
    const house = getHouse();
    for (const parlayId of touched) {
      const p = get<ParlayRow>("SELECT * FROM parlays WHERE id = ?", parlayId)!;
      const legs = all<LegRow>("SELECT * FROM parlay_legs WHERE parlay_id = ?", parlayId);
      const ref = { type: "parlay", id: parlayId };
      const name = get<{ display_name: string }>("SELECT display_name FROM users WHERE id = ?", p.user_id)!.display_name;
      if (legs.some((l) => l.outcome === "lost")) {
        run("UPDATE parlays SET status = 'lost', settled_at = ? WHERE id = ?", nowIso(), parlayId);
      } else if (legs.some((l) => l.outcome === "void")) {
        move(house.id, -p.stake_swipes, -p.stake_cents, "parlay_refund", ref);
        move(p.user_id, p.stake_swipes, p.stake_cents, "parlay_refund", ref);
        run("UPDATE parlays SET status = 'void', settled_at = ? WHERE id = ?", nowIso(), parlayId);
      } else if (legs.every((l) => l.outcome === "won")) {
        move(house.id, 0, -p.potential_payout_cents, "parlay_payout", ref);
        move(p.user_id, 0, p.potential_payout_cents, "parlay_payout", ref);
        run("UPDATE parlays SET status = 'won', settled_at = ? WHERE id = ?", nowIso(), parlayId);
        emit(
          "parlay",
          `${name} hit a ${legs.length}-leg weather parlay for ${fmtCents(p.potential_payout_cents)}`,
          p.user_id,
        );
      }
    }
  });
}

export function listParlays(userId: number) {
  const parlays = all<ParlayRow>("SELECT * FROM parlays WHERE user_id = ? ORDER BY id DESC LIMIT 30", userId);
  return parlays.map((p) => ({
    ...p,
    legs: all<LegRow>("SELECT * FROM parlay_legs WHERE parlay_id = ? ORDER BY id", p.id).map((l) => ({
      id: l.id,
      label: l.label,
      probability: l.probability,
      odds: l.odds,
      outcome: l.outcome,
      forecast: JSON.parse(l.forecast),
      observed: l.observed ? JSON.parse(l.observed) : null,
    })),
  }));
}

/** Upcoming hours (today + tomorrow) for the parlay builder. */
export async function weatherBoard(now = new Date()) {
  const f = await getForecast();
  const today = etDate(now);
  const days = [today, addDays(today, 1)];
  const nowMs = now.getTime();
  const hours = f.points
    .map((p) => ({ ...p, date: p.time.slice(0, 10), hour: Number(p.time.slice(11, 13)) }))
    .filter((p) => days.includes(p.date) && etToUtc(p.date, p.hour).getTime() > nowMs);
  return { source: f.source, fetchedAt: f.fetchedAt, days, hours, location: config.location.name };
}
