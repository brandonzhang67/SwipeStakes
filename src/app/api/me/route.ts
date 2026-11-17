import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getWallet } from "@/lib/ledger";
import { isSelfExcluded, stakedTodayCents } from "@/lib/limits";
import { marketRateCents } from "@/lib/market";

export const GET = handle(async () => {
  const u = await requireUser();
  const w = getWallet(u.id);
  return {
    user: {
      id: u.id,
      netid: u.netid,
      displayName: u.display_name,
      college: u.college,
      is21: !!u.is_21,
      dailyLimitCents: u.daily_limit_cents,
      selfExcludedUntil: isSelfExcluded(u) ? u.self_excluded_until : null,
    },
    wallet: { swipes: w.swipes, cents: w.cents },
    marketRateCents: marketRateCents(),
    stakedTodayCents: stakedTodayCents(u.id),
    swipeFloor: config.swipeFloor,
    maxDailyLimitCents: config.maxDailyLimitCents,
  };
});
