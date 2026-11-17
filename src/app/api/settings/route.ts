import { body, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { run } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isSelfExcluded } from "@/lib/limits";

const PAUSES: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };

export const PATCH = handle(async (req) => {
  const u = await requireUser();
  const b = await body<{ dailyLimitCents?: number; is21?: boolean; pause?: string }>(req);

  if (b.dailyLimitCents !== undefined) {
    const v = Number(b.dailyLimitCents);
    if (!Number.isInteger(v) || v < 0 || v > config.maxDailyLimitCents) throw new AppError("Invalid daily limit");
    // Lowering is instant; raising is blocked while a pause is active.
    if (v > u.daily_limit_cents && isSelfExcluded(u)) throw new AppError("You can't raise your limit during a pause");
    run("UPDATE users SET daily_limit_cents = ? WHERE id = ?", v, u.id);
  }
  if (b.is21 !== undefined) {
    // Demo only: self-attested. Production verifies age (e.g. ID check) before enabling stakes.
    run("UPDATE users SET is_21 = ? WHERE id = ?", b.is21 ? 1 : 0, u.id);
  }
  if (b.pause !== undefined) {
    const days = PAUSES[b.pause];
    if (!days) throw new AppError("Pause for 24h, 7d or 30d");
    // A pause can be extended but never shortened: that's the point of a cooling-off period.
    const until = new Date(Date.now() + days * 86400_000);
    const current = u.self_excluded_until ? new Date(u.self_excluded_until) : null;
    if (!current || until > current) run("UPDATE users SET self_excluded_until = ? WHERE id = ?", until.toISOString(), u.id);
  }
  return { ok: true };
});
