import { body, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createCoinflip, listCoinflips } from "@/lib/coinflip";
import { marketRateCents } from "@/lib/market";

export const GET = handle(() => ({ ...listCoinflips(), marketRateCents: marketRateCents() }));

export const POST = handle(async (req) => {
  const u = await requireUser();
  const b = await body<{ side: "swipes" | "dd"; swipes: number }>(req);
  return { coinflip: createCoinflip(u, b.side, Number(b.swipes)) };
});
