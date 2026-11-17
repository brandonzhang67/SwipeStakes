import { get, run, tx } from "./db";
import { AppError } from "./errors";
import { etDate, nowIso } from "./time";

export type Wallet = { user_id: number; swipes: number; cents: number };

export function getWallet(userId: number): Wallet {
  const w = get<Wallet>("SELECT * FROM wallets WHERE user_id = ?", userId);
  if (!w) throw new AppError("Wallet not found", 404);
  return w;
}

export type Reason =
  | "signup_grant"
  | "house_seed"
  | "offer_escrow"
  | "offer_refund"
  | "trade"
  | "coinflip_stake"
  | "coinflip_refund"
  | "coinflip_payout"
  | "jackpot_stake"
  | "jackpot_sponsor"
  | "jackpot_payout"
  | "jackpot_refund"
  | "parlay_stake"
  | "parlay_payout"
  | "parlay_refund";

/**
 * The only way balances change. Writes an append-only ledger row and updates the
 * wallet in the same transaction; refuses to let any balance go negative.
 */
export function move(
  userId: number,
  deltaSwipes: number,
  deltaCents: number,
  reason: Reason,
  ref?: { type: string; id: number },
  stakeValueCents = 0,
) {
  if (!Number.isInteger(deltaSwipes) || !Number.isInteger(deltaCents)) {
    throw new Error("Ledger deltas must be integers");
  }
  tx(() => {
    const w = getWallet(userId);
    if (w.swipes + deltaSwipes < 0) throw new AppError("Not enough swipes");
    if (w.cents + deltaCents < 0) throw new AppError("Not enough dining dollars");
    run(
      "UPDATE wallets SET swipes = swipes + ?, cents = cents + ? WHERE user_id = ?",
      deltaSwipes,
      deltaCents,
      userId,
    );
    run(
      `INSERT INTO ledger (user_id, delta_swipes, delta_cents, reason, ref_type, ref_id, stake_value_cents, created_at, et_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      deltaSwipes,
      deltaCents,
      reason,
      ref?.type ?? null,
      ref?.id ?? null,
      stakeValueCents,
      nowIso(),
      etDate(),
    );
  });
}
