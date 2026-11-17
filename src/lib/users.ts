import { config } from "./config";
import { get, run, tx } from "./db";
import { AppError } from "./errors";
import { move } from "./ledger";
import { nowIso } from "./time";

export type User = {
  id: number;
  netid: string;
  display_name: string;
  college: string;
  is_21: number;
  is_house: number;
  daily_limit_cents: number;
  self_excluded_until: string | null;
  created_at: string;
};

export const HOUSE_NETID = "__house__";

export function getUser(id: number): User | undefined {
  return get<User>("SELECT * FROM users WHERE id = ?", id);
}

export function getUserByNetid(netid: string): User | undefined {
  return get<User>("SELECT * FROM users WHERE netid = ?", netid.toLowerCase());
}

export function requireUser(id: number): User {
  const u = getUser(id);
  if (!u) throw new AppError("User not found", 404);
  return u;
}

export function createUser(input: {
  netid: string;
  displayName: string;
  college: string;
  is21: boolean;
  isHouse?: boolean;
  grant?: { swipes: number; cents: number };
}): User {
  return tx(() => {
    const id = run(
      `INSERT INTO users (netid, display_name, college, is_21, is_house, daily_limit_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.netid.toLowerCase(),
      input.displayName,
      input.college,
      input.is21 ? 1 : 0,
      input.isHouse ? 1 : 0,
      config.defaultDailyLimitCents,
      nowIso(),
    );
    run("INSERT INTO wallets (user_id, swipes, cents) VALUES (?, 0, 0)", id);
    const grant = input.grant ?? { swipes: config.signupSwipes, cents: config.signupCents };
    if (grant.swipes || grant.cents) {
      move(id, grant.swipes, grant.cents, input.isHouse ? "house_seed" : "signup_grant");
    }
    return getUser(id)!;
  });
}

/**
 * The house account is the sponsor pool. It never plays coin flips or the jackpot;
 * it only funds jackpot sponsorships and banks weather parlays at fair odds.
 */
export function getHouse(): User {
  let house = getUserByNetid(HOUSE_NETID);
  if (!house) {
    house = createUser({
      netid: HOUSE_NETID,
      displayName: "SwipeStakes sponsor pool",
      college: "—",
      is21: true,
      isHouse: true,
      grant: { swipes: 0, cents: config.houseSeedCents },
    });
  }
  return house;
}
