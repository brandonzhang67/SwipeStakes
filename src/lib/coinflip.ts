import { randomBytes } from "node:crypto";
import { all, get, run, tx } from "./db";
import { AppError } from "./errors";
import { coinflipMessage, hashSeed, newSeed, roll } from "./fair";
import { emit } from "./feed";
import { move } from "./ledger";
import { assertCanStake } from "./limits";
import { marketRateCents } from "./market";
import { fmtCents, plural } from "./money";
import { nowIso } from "./time";
import type { User } from "./users";

/**
 * Coin Flip: one player puts up N swipes, the other puts up N swipes' worth of dining
 * dollars at the market rate. 50/50, winner takes both. Peer-to-peer, no house edge.
 */

export type Coinflip = {
  id: number;
  maker_id: number;
  maker_side: "swipes" | "dd";
  swipes: number;
  cents: number;
  taker_id: number | null;
  server_seed: string;
  seed_hash: string;
  client_seed: string | null;
  roll: number | null;
  winner_id: number | null;
  status: "open" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
};

export type CoinflipView = Omit<Coinflip, "server_seed"> & {
  server_seed: string | null; // only revealed once resolved
  maker_name: string;
  taker_name: string | null;
  winner_name: string | null;
};

export const MAX_FLIP_SWIPES = 3;

function view(c: Coinflip & { maker_name: string; taker_name: string | null; winner_name: string | null }): CoinflipView {
  return { ...c, server_seed: c.status === "resolved" ? c.server_seed : null };
}

const SELECT = `SELECT c.*, m.display_name AS maker_name, t.display_name AS taker_name, w.display_name AS winner_name
  FROM coinflips c JOIN users m ON m.id = c.maker_id
  LEFT JOIN users t ON t.id = c.taker_id LEFT JOIN users w ON w.id = c.winner_id`;

type Row = Coinflip & { maker_name: string; taker_name: string | null; winner_name: string | null };

export function listCoinflips(): { open: CoinflipView[]; recent: CoinflipView[] } {
  return {
    open: all<Row>(`${SELECT} WHERE c.status = 'open' ORDER BY c.id DESC`).map(view),
    recent: all<Row>(`${SELECT} WHERE c.status = 'resolved' ORDER BY c.resolved_at DESC LIMIT 15`).map(view),
  };
}

export function getCoinflip(id: number): CoinflipView {
  const r = get<Row>(`${SELECT} WHERE c.id = ?`, id);
  if (!r) throw new AppError("Coin flip not found", 404);
  return view(r);
}

function stakeFor(side: "swipes" | "dd", swipes: number, cents: number) {
  return side === "swipes" ? { swipes, cents: 0 } : { swipes: 0, cents };
}

export function createCoinflip(user: User, makerSide: "swipes" | "dd", swipes: number): CoinflipView {
  if (makerSide !== "swipes" && makerSide !== "dd") throw new AppError("Invalid side");
  if (!Number.isInteger(swipes) || swipes < 1 || swipes > MAX_FLIP_SWIPES) {
    throw new AppError(`Flip between 1 and ${MAX_FLIP_SWIPES} swipes`);
  }
  return tx(() => {
    const cents = swipes * marketRateCents();
    const stake = stakeFor(makerSide, swipes, cents);
    const value = assertCanStake(user, stake);
    const seed = newSeed();
    const id = run(
      `INSERT INTO coinflips (maker_id, maker_side, swipes, cents, server_seed, seed_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.id,
      makerSide,
      swipes,
      cents,
      seed,
      hashSeed(seed),
      nowIso(),
    );
    move(user.id, -stake.swipes, -stake.cents, "coinflip_stake", { type: "coinflip", id }, value);
    emit(
      "coinflip",
      `${user.display_name} opened a coin flip: ${plural(swipes, "swipe")} vs ${fmtCents(cents)}`,
      user.id,
    );
    return getCoinflip(id);
  });
}

export function takeCoinflip(user: User, id: number, clientSeed?: string): CoinflipView {
  return tx(() => {
    const c = get<Coinflip>("SELECT * FROM coinflips WHERE id = ?", id);
    if (!c) throw new AppError("Coin flip not found", 404);
    if (c.status !== "open") throw new AppError("Someone already took that flip", 409);
    if (c.maker_id === user.id) throw new AppError("You can't flip against yourself");

    const takerSide = c.maker_side === "swipes" ? "dd" : "swipes";
    const stake = stakeFor(takerSide, c.swipes, c.cents);
    const value = assertCanStake(user, stake);
    const ref = { type: "coinflip", id };
    move(user.id, -stake.swipes, -stake.cents, "coinflip_stake", ref, value);

    const seed = (clientSeed ?? "").trim().slice(0, 64) || randomBytes(8).toString("hex");
    const r = roll(c.server_seed, coinflipMessage(c.id, seed));
    const winnerId = r < 0.5 ? c.maker_id : user.id;
    move(winnerId, c.swipes, c.cents, "coinflip_payout", ref);
    run(
      `UPDATE coinflips SET taker_id = ?, client_seed = ?, roll = ?, winner_id = ?, status = 'resolved', resolved_at = ?
       WHERE id = ?`,
      user.id,
      seed,
      r,
      winnerId,
      nowIso(),
      id,
    );
    const result = getCoinflip(id);
    emit(
      "coinflip",
      `${result.winner_name} won a coin flip: ${plural(c.swipes, "swipe")} + ${fmtCents(c.cents)}`,
      winnerId,
    );
    return result;
  });
}

export function cancelCoinflip(user: User, id: number) {
  return tx(() => {
    const c = get<Coinflip>("SELECT * FROM coinflips WHERE id = ?", id);
    if (!c) throw new AppError("Coin flip not found", 404);
    if (c.maker_id !== user.id) throw new AppError("Not your flip", 403);
    if (c.status !== "open") throw new AppError("That flip is already closed", 409);
    const stake = stakeFor(c.maker_side, c.swipes, c.cents);
    // Negative stake value gives the amount back to today's limit.
    move(user.id, stake.swipes, stake.cents, "coinflip_refund", { type: "coinflip", id }, -c.cents);
    run("UPDATE coinflips SET status = 'cancelled' WHERE id = ?", id);
  });
}
