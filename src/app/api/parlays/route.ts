import { body, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listParlays, placeParlay } from "@/lib/parlay";

export const GET = handle(async () => ({ parlays: listParlays((await requireUser()).id) }));

export const POST = handle(async (req) => {
  const u = await requireUser();
  const b = await body<{ legs: unknown; stake: { swipes?: number; cents?: number } }>(req);
  return { parlay: await placeParlay(u, b.legs, b.stake ?? {}) };
});
