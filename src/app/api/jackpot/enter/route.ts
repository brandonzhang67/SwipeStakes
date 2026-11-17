import { body, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { enterJackpot, jackpotState } from "@/lib/jackpot";

export const POST = handle(async (req) => {
  const u = await requireUser();
  const b = await body<{ kind: "free" | "swipe" | "dd"; count?: number }>(req);
  enterJackpot(u, b.kind, Number(b.count ?? 1));
  return jackpotState(u);
});
