import { config } from "./config";
import { get } from "./db";
import { AppError } from "./errors";
import { getWallet } from "./ledger";
import { marketRateCents } from "./market";
import { fmtCents } from "./money";
import { etDate } from "./time";
import type { User } from "./users";

/** Total value staked on games today (Eastern), in cents. */
export function stakedTodayCents(userId: number): number {
  const r = get<{ total: number | null }>(
    "SELECT SUM(stake_value_cents) AS total FROM ledger WHERE user_id = ? AND et_date = ?",
    userId,
    etDate(),
  );
  return r?.total ?? 0;
}

export function isSelfExcluded(user: User): boolean {
  return !!user.self_excluded_until && new Date(user.self_excluded_until) > new Date();
}

/**
 * Responsible-play gate for anything with chance + a stake. Returns the stake's value
 * in cents (swipes priced at the market rate) so callers can record it on the ledger.
 */
export function assertCanStake(user: User, stake: { swipes?: number; cents?: number }): number {
  const swipes = stake.swipes ?? 0;
  const cents = stake.cents ?? 0;
  if (user.is_house) throw new AppError("The sponsor pool cannot play");
  if (isSelfExcluded(user)) {
    throw new AppError("You've paused games until " + new Date(user.self_excluded_until!).toLocaleString(), 403);
  }
  if (!user.is_21) {
    throw new AppError("Games with a stake are 21+. Straight trades and the free jackpot entry are open to everyone.", 403);
  }
  if (swipes > 0) {
    const w = getWallet(user.id);
    if (w.swipes - swipes < config.swipeFloor) {
      throw new AppError(
        `Swipe floor: you need to keep at least ${config.swipeFloor} swipes for actual meals.`,
      );
    }
  }
  const value = swipes * marketRateCents() + cents;
  const used = stakedTodayCents(user.id);
  if (used + value > user.daily_limit_cents) {
    throw new AppError(
      `That would take you past your daily limit (${fmtCents(used)} of ${fmtCents(user.daily_limit_cents)} used today).`,
    );
  }
  return value;
}
