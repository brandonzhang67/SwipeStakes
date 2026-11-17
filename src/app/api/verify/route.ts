import { handle } from "@/lib/api";
import { getCoinflip } from "@/lib/coinflip";
import { AppError } from "@/lib/errors";
import { coinflipMessage, jackpotMessage } from "@/lib/fair";
import { getJackpotForVerify } from "@/lib/jackpot";

/**
 * Everything needed to check a game independently. The /verify page recomputes the
 * hash and roll in the browser with WebCrypto instead of trusting these numbers.
 */
export const GET = handle((req) => {
  const game = req.nextUrl.searchParams.get("game");
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) throw new AppError("Invalid id");

  if (game === "coinflip") {
    const c = getCoinflip(id);
    return {
      game,
      id,
      status: c.status,
      seedHash: c.seed_hash,
      serverSeed: c.server_seed,
      message: c.client_seed ? coinflipMessage(c.id, c.client_seed) : null,
      roll: c.roll,
      rule: "Maker wins if roll < 0.5, otherwise the taker wins.",
      outcome: c.winner_name ? `${c.winner_name} won` : null,
    };
  }
  if (game === "jackpot") {
    const j = getJackpotForVerify(id);
    return {
      game,
      id,
      status: j.status,
      seedHash: j.seed_hash,
      serverSeed: j.server_seed,
      message: j.total_tickets ? jackpotMessage(j.draw_date, j.total_tickets) : null,
      roll: j.roll,
      rule: "Winning ticket = floor(roll × total tickets); tickets are numbered in entry order starting at 0.",
      outcome: j.winning_ticket !== null ? `Ticket #${j.winning_ticket} of ${j.total_tickets}` : null,
    };
  }
  throw new AppError("game must be coinflip or jackpot");
});
