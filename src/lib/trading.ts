import { all, get, run, tx } from "./db";
import { AppError } from "./errors";
import { emit } from "./feed";
import { move } from "./ledger";
import { fmtCents } from "./money";
import { nowIso } from "./time";
import type { User } from "./users";

/**
 * Straight trades: one swipe for a fixed number of dining dollars. No chance involved,
 * so no age gate or daily limit. Both sides are escrowed when the offer is posted, so
 * an accepted offer always settles.
 */

export type OfferSide = "sell_swipe" | "buy_swipe";

export type Offer = {
  id: number;
  maker_id: number;
  side: OfferSide;
  price_cents: number;
  status: "open" | "filled" | "cancelled";
  created_at: string;
};

export type OfferView = Offer & { maker_name: string; maker_college: string };

export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 50_00;

export function listOpenOffers(): OfferView[] {
  return all<OfferView>(
    `SELECT o.*, u.display_name AS maker_name, u.college AS maker_college
     FROM offers o JOIN users u ON u.id = o.maker_id
     WHERE o.status = 'open'
     ORDER BY CASE o.side WHEN 'sell_swipe' THEN o.price_cents ELSE -o.price_cents END, o.id`,
  );
}

export function recentTrades(limit = 10) {
  return all<{ id: number; price_cents: number; created_at: string; buyer: string; seller: string }>(
    `SELECT t.id, t.price_cents, t.created_at, b.display_name AS buyer, s.display_name AS seller
     FROM trades t JOIN users b ON b.id = t.buyer_id JOIN users s ON s.id = t.seller_id
     ORDER BY t.id DESC LIMIT ?`,
    limit,
  );
}

export function createOffer(user: User, side: OfferSide, priceCents: number): Offer {
  if (side !== "sell_swipe" && side !== "buy_swipe") throw new AppError("Invalid side");
  if (!Number.isInteger(priceCents) || priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS) {
    throw new AppError(`Price must be between ${fmtCents(MIN_PRICE_CENTS)} and ${fmtCents(MAX_PRICE_CENTS)}`);
  }
  return tx(() => {
    const id = run(
      "INSERT INTO offers (maker_id, side, price_cents, created_at) VALUES (?, ?, ?, ?)",
      user.id,
      side,
      priceCents,
      nowIso(),
    );
    const ref = { type: "offer", id };
    if (side === "sell_swipe") move(user.id, -1, 0, "offer_escrow", ref);
    else move(user.id, 0, -priceCents, "offer_escrow", ref);
    emit(
      "offer",
      side === "sell_swipe"
        ? `${user.display_name} is selling a swipe for ${fmtCents(priceCents)}`
        : `${user.display_name} wants to buy a swipe for ${fmtCents(priceCents)}`,
      user.id,
    );
    return get<Offer>("SELECT * FROM offers WHERE id = ?", id)!;
  });
}

function openOffer(id: number): Offer {
  const o = get<Offer>("SELECT * FROM offers WHERE id = ?", id);
  if (!o) throw new AppError("Offer not found", 404);
  if (o.status !== "open") throw new AppError("That offer is no longer open", 409);
  return o;
}

export function acceptOffer(user: User, offerId: number) {
  return tx(() => {
    const o = openOffer(offerId);
    if (o.maker_id === user.id) throw new AppError("You can't accept your own offer");
    const ref = { type: "offer", id: o.id };
    let buyerId: number, sellerId: number;
    if (o.side === "sell_swipe") {
      // Taker buys the escrowed swipe.
      buyerId = user.id;
      sellerId = o.maker_id;
      move(user.id, 1, -o.price_cents, "trade", ref);
      move(o.maker_id, 0, o.price_cents, "trade", ref);
    } else {
      // Taker sells a swipe for the escrowed dining dollars.
      buyerId = o.maker_id;
      sellerId = user.id;
      move(user.id, -1, o.price_cents, "trade", ref);
      move(o.maker_id, 1, 0, "trade", ref);
    }
    run("UPDATE offers SET status = 'filled' WHERE id = ?", o.id);
    run(
      "INSERT INTO trades (offer_id, buyer_id, seller_id, price_cents, created_at) VALUES (?, ?, ?, ?, ?)",
      o.id,
      buyerId,
      sellerId,
      o.price_cents,
      nowIso(),
    );
    emit("trade", `A swipe just traded for ${fmtCents(o.price_cents)}`, user.id);
  });
}

export function cancelOffer(user: User, offerId: number) {
  return tx(() => {
    const o = openOffer(offerId);
    if (o.maker_id !== user.id) throw new AppError("Not your offer", 403);
    const ref = { type: "offer", id: o.id };
    if (o.side === "sell_swipe") move(user.id, 1, 0, "offer_refund", ref);
    else move(user.id, 0, o.price_cents, "offer_refund", ref);
    run("UPDATE offers SET status = 'cancelled' WHERE id = ?", o.id);
  });
}
