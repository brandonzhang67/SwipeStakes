import { beforeEach, describe, expect, it } from "vitest";
import { cancelCoinflip, createCoinflip, takeCoinflip } from "./coinflip";
import { all, get, resetDbForTests, run } from "./db";
import { enterJackpot, jackpotState, resolveDueJackpots } from "./jackpot";
import { getWallet } from "./ledger";
import { marketRateCents } from "./market";
import { listParlays, placeParlay, settleDueParlays } from "./parlay";
import { addDays, etDate, etToUtc } from "./time";
import { acceptOffer, cancelOffer, createOffer } from "./trading";
import { createUser, getHouse, getUser, type User } from "./users";

let a: User, b: User;

function totals() {
  return get<{ swipes: number; cents: number }>("SELECT SUM(swipes) AS swipes, SUM(cents) AS cents FROM wallets")!;
}
function escrowed() {
  // Value sitting in open offers / flips / jackpot pots that isn't in any wallet.
  const offers = get<{ s: number; c: number }>(
    "SELECT COALESCE(SUM(side='sell_swipe'),0) AS s, COALESCE(SUM(CASE WHEN side='buy_swipe' THEN price_cents END),0) AS c FROM offers WHERE status='open'",
  )!;
  const flips = get<{ s: number; c: number }>(
    "SELECT COALESCE(SUM(CASE WHEN maker_side='swipes' THEN swipes END),0) AS s, COALESCE(SUM(CASE WHEN maker_side='dd' THEN cents END),0) AS c FROM coinflips WHERE status='open'",
  )!;
  const pots = get<{ s: number; c: number }>(
    "SELECT COALESCE(SUM(pot_swipes),0) AS s, COALESCE(SUM(pot_cents + sponsor_cents),0) AS c FROM jackpots WHERE status='open'",
  )!;
  return { swipes: offers.s + flips.s + pots.s, cents: offers.c + flips.c + pots.c };
}
function conserved() {
  const t = totals();
  const e = escrowed();
  const minted = get<{ s: number; c: number }>(
    "SELECT SUM(delta_swipes) AS s, SUM(delta_cents) AS c FROM ledger WHERE reason IN ('signup_grant','house_seed')",
  )!;
  expect(t.swipes + e.swipes).toBe(minted.s);
  expect(t.cents + e.cents).toBe(minted.c);
}

beforeEach(() => {
  resetDbForTests();
  getHouse();
  a = createUser({ netid: "aa111", displayName: "Ada", college: "Morse", is21: true });
  b = createUser({ netid: "bb222", displayName: "Ben", college: "Berkeley", is21: true });
});

describe("straight trades", () => {
  it("escrows on post, settles on accept, and moves the market rate", () => {
    const o = createOffer(a, "sell_swipe", 800);
    expect(getWallet(a.id).swipes).toBe(13);
    acceptOffer(b, o.id);
    expect(getWallet(a.id)).toMatchObject({ swipes: 13, cents: 128_00 });
    expect(getWallet(b.id)).toMatchObject({ swipes: 15, cents: 112_00 });
    expect(marketRateCents()).toBe(800);
    conserved();
  });

  it("refunds on cancel and blocks self-accept", () => {
    const o = createOffer(a, "buy_swipe", 1000);
    expect(() => acceptOffer(a, o.id)).toThrow(/own offer/);
    cancelOffer(a, o.id);
    expect(getWallet(a.id).cents).toBe(120_00);
    conserved();
  });

  it("doesn't need 21+", () => {
    const young = createUser({ netid: "cc333", displayName: "Cy", college: "Saybrook", is21: false });
    acceptOffer(young, createOffer(a, "sell_swipe", 900).id);
    expect(getWallet(young.id).swipes).toBe(15);
  });
});

describe("coin flip", () => {
  it("pays the winner both stakes", () => {
    const flip = createCoinflip(a, "swipes", 1);
    expect(flip.server_seed).toBeNull(); // hidden until resolved
    const done = takeCoinflip(b, flip.id, "client");
    expect(done.server_seed).toHaveLength(64);
    const winner = done.winner_id === a.id ? a : b;
    const loser = winner === a ? b : a;
    expect(getWallet(winner.id).swipes + getWallet(loser.id).swipes).toBe(28);
    expect(getWallet(winner.id).cents - getWallet(loser.id).cents).toBe(winner === a ? 18_00 : 0);
    conserved();
  });

  it("enforces 21+, the swipe floor and the daily limit", () => {
    const young = createUser({ netid: "cc333", displayName: "Cy", college: "Saybrook", is21: false });
    expect(() => createCoinflip(young, "dd", 1)).toThrow(/21\+/);

    run("UPDATE wallets SET swipes = 4 WHERE user_id = ?", a.id);
    expect(() => createCoinflip(a, "swipes", 2)).toThrow(/Swipe floor/);

    // $40 default limit, $9 per swipe: 4 swipes of DD ok, a 5th isn't.
    createCoinflip(b, "dd", 3);
    createCoinflip(b, "dd", 1);
    expect(() => createCoinflip(b, "dd", 1)).toThrow(/daily limit/);
  });

  it("cancelling gives the limit back", () => {
    const f = createCoinflip(b, "dd", 3);
    cancelCoinflip(b, f.id);
    createCoinflip(b, "dd", 3);
    conserved();
  });
});

describe("jackpot", () => {
  it("draws a winner who gets pot + sponsor", () => {
    enterJackpot(a, "free");
    enterJackpot(b, "swipe", 2);
    expect(() => enterJackpot(a, "free")).toThrow(/free ticket/);
    const s = jackpotState(a);
    expect(s.jackpot.total_tickets).toBe(3);
    expect(s.jackpot.sponsor_cents).toBe(25_00);
    conserved();

    resolveDueJackpots(new Date(Date.now() + 2 * 86400_000));
    const j = get<{ status: string; winner_id: number }>("SELECT * FROM jackpots WHERE id = ?", s.jackpot.id)!;
    expect(j.status).toBe("resolved");
    const w = getWallet(j.winner_id);
    expect(w.cents).toBe(120_00 + 25_00);
    conserved();
  });

  it("free entries are open to under-21s", () => {
    const young = createUser({ netid: "cc333", displayName: "Cy", college: "Saybrook", is21: false });
    enterJackpot(young, "free");
    expect(() => enterJackpot(young, "swipe", 1)).toThrow(/21\+/);
  });
});

describe("weather parlays (mock weather)", () => {
  const tomorrow = () => addDays(etDate(), 1);

  it("prices, places, and settles against observed weather", async () => {
    const legs = [
      { kind: "rain", date: tomorrow(), startHour: 14, endHour: 17, pick: "no" },
      { kind: "temp", date: tomorrow(), startHour: 20, endHour: 21, op: "over", low: 30 },
    ];
    const placed = await placeParlay(a, legs, { cents: 5_00 });
    expect(placed.odds).toBeGreaterThan(1);
    expect(getWallet(a.id).cents).toBe(115_00);

    // Nothing settles before the windows end.
    await settleDueParlays();
    expect(listParlays(a.id)[0].status).toBe("open");

    await settleDueParlays(new Date(etToUtc(tomorrow(), 23).getTime()));
    const p = listParlays(a.id)[0];
    expect(["won", "lost"]).toContain(p.status);
    expect(p.legs.every((l) => l.outcome !== "pending")).toBe(true);
    if (p.status === "won") expect(getWallet(a.id).cents).toBe(115_00 + placed.payoutCents);
    else expect(getWallet(a.id).cents).toBe(115_00);
    conserved();
  });

  it("rejects started windows, overlapping legs and over-cap payouts", async () => {
    await expect(
      placeParlay(a, [{ kind: "rain", date: addDays(etDate(), -1), startHour: 1, endHour: 2, pick: "yes" }], { cents: 100 }),
    ).rejects.toThrow(/today or tomorrow/);
    await expect(
      placeParlay(
        a,
        [
          { kind: "rain", date: tomorrow(), startHour: 1, endHour: 4, pick: "yes" },
          { kind: "rain", date: tomorrow(), startHour: 3, endHour: 5, pick: "no" },
        ],
        { cents: 100 },
      ),
    ).rejects.toThrow(/overlapping/);
    await expect(
      placeParlay(a, [{ kind: "temp", date: tomorrow(), startHour: 12, endHour: 13, op: "over", low: 120 }], { cents: 40_00 }),
    ).rejects.toThrow(/Max payout/);
  });

  it("refuses when self-excluded", async () => {
    run("UPDATE users SET self_excluded_until = ? WHERE id = ?", new Date(Date.now() + 86400_000).toISOString(), a.id);
    await expect(
      placeParlay(getUser(a.id)!, [{ kind: "rain", date: tomorrow(), startHour: 9, endHour: 10, pick: "yes" }], { cents: 100 }),
    ).rejects.toThrow(/paused/);
    expect(all("SELECT * FROM parlays")).toHaveLength(0);
  });
});
