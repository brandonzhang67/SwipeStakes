import { handle, idParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancelOffer } from "@/lib/trading";

export const POST = handle(async (_req, params) => {
  cancelOffer(await requireUser(), idParam(params));
});
