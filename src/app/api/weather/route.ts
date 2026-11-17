import { handle } from "@/lib/api";
import { weatherBoard } from "@/lib/parlay";

export const GET = handle(() => weatherBoard());
