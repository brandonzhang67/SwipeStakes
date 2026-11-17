import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Provably fair randomness (commit-reveal).
 *
 * 1. Before a game opens we generate a secret server seed and publish sha256(seed).
 * 2. When the game resolves, roll = HMAC-SHA256(key = seed, message) mapped to [0, 1).
 * 3. Afterwards the seed is revealed so anyone can check sha256(seed) matches the
 *    published hash and recompute the roll themselves (the /verify page does this
 *    in the browser).
 */
export function newSeed(): string {
  return randomBytes(32).toString("hex");
}

export function hashSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function roll(serverSeed: string, message: string): number {
  const hex = createHmac("sha256", serverSeed).update(message).digest("hex");
  // First 52 bits, exactly representable in a double.
  return parseInt(hex.slice(0, 13), 16) / 2 ** 52;
}

export const coinflipMessage = (id: number, clientSeed: string) => `coinflip:${id}:${clientSeed}`;
export const jackpotMessage = (drawDate: string, totalTickets: number) =>
  `jackpot:${drawDate}:${totalTickets}`;
