import { handle } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { jackpotState } from "@/lib/jackpot";

export const GET = handle(async () => jackpotState(await currentUser()));
