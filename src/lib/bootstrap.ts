import { createCoinflip } from "./coinflip";
import { config } from "./config";
import { get } from "./db";
import { createOffer } from "./trading";
import { createUser, getHouse } from "./users";

let done = false;

/**
 * Make sure the sponsor pool exists and, for demos, that the market isn't empty on
 * first load. Demo accounts use NetIDs that can't collide with real ones.
 */
export function ensureBootstrapped() {
  if (done) return;
  getHouse();
  const anyone = get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE is_house = 0")!.n;
  if (config.seedDemo && anyone === 0) {
    const demo = [
      { netid: "demo_maya", displayName: "Maya", college: "Pauli Murray" },
      { netid: "demo_theo", displayName: "Theo", college: "Silliman" },
      { netid: "demo_priya", displayName: "Priya", college: "Ezra Stiles" },
      { netid: "demo_jordan", displayName: "Jordan", college: "Branford" },
    ].map((d) => createUser({ ...d, is21: true }));
    const [maya, theo, priya, jordan] = demo;
    createOffer(maya, "sell_swipe", 850);
    createOffer(theo, "sell_swipe", 925);
    createOffer(priya, "buy_swipe", 800);
    createOffer(jordan, "buy_swipe", 750);
    createCoinflip(theo, "swipes", 1);
    createCoinflip(priya, "dd", 2);
  }
  done = true;
}
