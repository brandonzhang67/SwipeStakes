import { handle, idParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { acceptOffer } from "@/lib/trading";

export const POST = handle(async (_req, params) => {
  acceptOffer(await requireUser(), idParam(params));
});
