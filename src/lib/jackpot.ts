import { config } from "./config";
import { all, get, run, tx } from "./db";
import { AppError } from "./errors";
import { hashSeed, jackpotMessage, newSeed, roll } from "./fair";
import { emit } from "./feed";
import { getWallet, move } from "./ledger";
import { assertCanStake, isSelfExcluded } from "./limits";
import { marketRateCents } from "./market";
import { fmtCents, plural } from "./money";
import { addDays, etDate, etHour, etToUtc, nowIso } from "./time";
import { getHouse, type User } from "./users";

/**
 * Daily Jackpot. One ticket = one swipe, or one swipe's worth of dining dollars at the
 * market rate. Every Yalie also gets one free ticket per draw ("no purchase necessary"),
 * which is what keeps this a sweepstakes. The sponsor pool seeds every pot, so the
 * expected value for players is positive. Draws at 9pm Eastern.
 */

export type Jackpot = {
  id: number;
  draw_date: string;
  draws_at: string;
  server_seed: string;
  seed_hash: string;
  pot_swipes: number;
  pot_cents: number;
  sponsor_cents: number;
  status: "open" | "resolved" | "no_entries";
  total_tickets: number | null;
  winning_ticket: number | null;
  roll: number | null;
  winner_id: number | null;
  resolved_at: string | null;
};

type Entry = {
  id: number;
  jackpot_id: number;
  user_id: number;
  kind: "free" | "swipe" | "dd";
  tickets: number;
  swipes: number;
  cents: number;
};

function currentDrawDate(now = new Date()): string {
  const today = etDate(now);
  return etHour(now) < config.jackpotDrawHourET ? today : addDays(today, 1);
}

function getOrCreate(drawDate: string): Jackpot {
  return tx(() => {
    const existing = get<Jackpot>("SELECT * FROM jackpots WHERE draw_date = ?", drawDate);
    if (existing) return existing;
    const seed = newSeed();
    const house = getHouse();
    const sponsor = getWallet(house.id).cents >= config.jackpotSponsorCents ? config.jackpotSponsorCents : 0;
    const id = run(
      `INSERT INTO jackpots (draw_date, draws_at, server_seed, seed_hash, sponsor_cents) VALUES (?, ?, ?, ?, ?)`,
      drawDate,
      etToUtc(drawDate, config.jackpotDrawHourET).toISOString(),
      seed,
      hashSeed(seed),
      sponsor,
    );
    if (sponsor) move(house.id, 0, -sponsor, "jackpot_sponsor", { type: "jackpot", id });
    return get<Jackpot>("SELECT * FROM jackpots WHERE id = ?", id)!;
  });
}

/** Draw any jackpot whose time has passed. Safe to call on every request. */
export function resolveDueJackpots(now = new Date()) {
  const due = all<Jackpot>("SELECT * FROM jackpots WHERE status = 'open' AND draws_at <= ?", now.toISOString());
  for (const j of due) {
    tx(() => {
      const entries = all<Entry>("SELECT * FROM jackpot_entries WHERE jackpot_id = ? ORDER BY id", j.id);
      const total = entries.reduce((s, e) => s + e.tickets, 0);
      const ref = { type: "jackpot", id: j.id };
      if (total === 0) {
        if (j.sponsor_cents) move(getHouse().id, 0, j.sponsor_cents, "jackpot_refund", ref);
        run("UPDATE jackpots SET status = 'no_entries', total_tickets = 0, resolved_at = ? WHERE id = ?", nowIso(), j.id);
        return;
      }
      const r = roll(j.server_seed, jackpotMessage(j.draw_date, total));
      const ticket = Math.floor(r * total);
      let cursor = 0;
      const winner = entries.find((e) => (cursor += e.tickets) > ticket)!;
      const prizeCents = j.pot_cents + j.sponsor_cents;
      move(winner.user_id, j.pot_swipes, prizeCents, "jackpot_payout", ref);
      run(
        `UPDATE jackpots SET status = 'resolved', total_tickets = ?, winning_ticket = ?, roll = ?, winner_id = ?, resolved_at = ?
         WHERE id = ?`,
        total,
        ticket,
        r,
        winner.user_id,
        nowIso(),
        j.id,
      );
      const u = get<{ display_name: string; college: string }>(
        "SELECT display_name, college FROM users WHERE id = ?",
        winner.user_id,
      )!;
      emit(
        "jackpot",
        `${u.display_name} (${u.college}) won the jackpot: ${plural(j.pot_swipes, "swipe")} + ${fmtCents(prizeCents)}`,
        winner.user_id,
      );
    });
  }
}

export function jackpotState(user: User | null) {
  resolveDueJackpots();
  const j = getOrCreate(currentDrawDate());
  const totals = get<{ tickets: number | null; players: number }>(
    "SELECT SUM(tickets) AS tickets, COUNT(DISTINCT user_id) AS players FROM jackpot_entries WHERE jackpot_id = ?",
    j.id,
  )!;
  const mine = user
    ? all<Entry>("SELECT * FROM jackpot_entries WHERE jackpot_id = ? AND user_id = ?", j.id, user.id)
    : [];
  const previous = get<Jackpot & { winner_name: string | null; winner_college: string | null }>(
    `SELECT j.*, u.display_name AS winner_name, u.college AS winner_college FROM jackpots j
     LEFT JOIN users u ON u.id = j.winner_id WHERE j.status != 'open' ORDER BY j.draw_date DESC LIMIT 1`,
  );
  return {
    jackpot: {
      id: j.id,
      draw_date: j.draw_date,
      draws_at: j.draws_at,
      seed_hash: j.seed_hash,
      pot_swipes: j.pot_swipes,
      pot_cents: j.pot_cents,
      sponsor_cents: j.sponsor_cents,
      total_tickets: totals.tickets ?? 0,
      players: totals.players,
    },
    ticketPriceCents: marketRateCents(),
    myTickets: mine.reduce((s, e) => s + e.tickets, 0),
    usedFreeEntry: mine.some((e) => e.kind === "free"),
    paidTicketsLeft: config.jackpotMaxPaidTicketsPerDay - mine.filter((e) => e.kind !== "free").reduce((s, e) => s + e.tickets, 0),
    previous: previous
      ? {
          id: previous.id,
          draw_date: previous.draw_date,
          status: previous.status,
          winner_name: previous.winner_name,
          winner_college: previous.winner_college,
          pot_swipes: previous.pot_swipes,
          prize_cents: previous.pot_cents + previous.sponsor_cents,
          total_tickets: previous.total_tickets,
        }
      : null,
  };
}

export function enterJackpot(user: User, kind: "free" | "swipe" | "dd", count = 1) {
  resolveDueJackpots();
  if (!["free", "swipe", "dd"].includes(kind)) throw new AppError("Invalid entry type");
  if (!Number.isInteger(count) || count < 1) throw new AppError("Invalid ticket count");
  return tx(() => {
    const j = getOrCreate(currentDrawDate());
    const mine = all<Entry>("SELECT * FROM jackpot_entries WHERE jackpot_id = ? AND user_id = ?", j.id, user.id);
    const ref = { type: "jackpot", id: j.id };

    if (kind === "free") {
      if (user.is_house) throw new AppError("The sponsor pool cannot play");
      if (isSelfExcluded(user)) throw new AppError("You've paused games", 403);
      if (mine.some((e) => e.kind === "free")) throw new AppError("You already used today's free ticket");
      run(
        "INSERT INTO jackpot_entries (jackpot_id, user_id, kind, tickets, created_at) VALUES (?, ?, 'free', 1, ?)",
        j.id,
        user.id,
        nowIso(),
      );
      emit("jackpot", `${user.display_name} grabbed a free jackpot ticket`, user.id);
      return;
    }

    const paidSoFar = mine.filter((e) => e.kind !== "free").reduce((s, e) => s + e.tickets, 0);
    if (paidSoFar + count > config.jackpotMaxPaidTicketsPerDay) {
      throw new AppError(`Max ${config.jackpotMaxPaidTicketsPerDay} paid tickets per draw`);
    }
    const swipes = kind === "swipe" ? count : 0;
    const cents = kind === "dd" ? count * marketRateCents() : 0;
    const value = assertCanStake(user, { swipes, cents });
    run(
      "INSERT INTO jackpot_entries (jackpot_id, user_id, kind, tickets, swipes, cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      j.id,
      user.id,
      kind,
      count,
      swipes,
      cents,
      nowIso(),
    );
    move(user.id, -swipes, -cents, "jackpot_stake", ref, value);
    run("UPDATE jackpots SET pot_swipes = pot_swipes + ?, pot_cents = pot_cents + ? WHERE id = ?", swipes, cents, j.id);
    emit(
      "jackpot",
      `${user.display_name} put ${kind === "swipe" ? plural(count, "swipe") : fmtCents(cents)} into tonight's jackpot`,
      user.id,
    );
  });
}

export function getJackpotForVerify(id: number) {
  const j = get<Jackpot>("SELECT * FROM jackpots WHERE id = ?", id);
  if (!j) throw new AppError("Jackpot not found", 404);
  return { ...j, server_seed: j.status === "open" ? null : j.server_seed };
}
