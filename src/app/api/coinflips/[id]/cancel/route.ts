import { handle, idParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancelCoinflip } from "@/lib/coinflip";

export const POST = handle(async (_req, params) => {
  cancelCoinflip(await requireUser(), idParam(params));
});
