import { handle, idParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { takeCoinflip } from "@/lib/coinflip";

export const POST = handle(async (req, params) => {
  const u = await requireUser();
  const b = (await req.json().catch(() => ({}))) as { clientSeed?: string };
  return { coinflip: takeCoinflip(u, idParam(params), b.clientSeed) };
});
