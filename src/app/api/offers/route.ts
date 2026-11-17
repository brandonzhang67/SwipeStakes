import { body, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { marketRateCents } from "@/lib/market";
import { createOffer, listOpenOffers, recentTrades, type OfferSide } from "@/lib/trading";

export const GET = handle(() => ({
  offers: listOpenOffers(),
  trades: recentTrades(),
  marketRateCents: marketRateCents(),
}));

export const POST = handle(async (req) => {
  const u = await requireUser();
  const b = await body<{ side: OfferSide; priceCents: number }>(req);
  return { offer: createOffer(u, b.side, Number(b.priceCents)) };
});
