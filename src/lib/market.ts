import { config } from "./config";
import { all } from "./db";

/** Market price of one swipe in cents: average of the last 10 straight trades. */
export function marketRateCents(): number {
  const rows = all<{ price_cents: number }>(
    "SELECT price_cents FROM trades ORDER BY id DESC LIMIT 10",
  );
  if (rows.length === 0) return config.defaultRateCents;
  return Math.round(rows.reduce((s, r) => s + r.price_cents, 0) / rows.length);
}
