import { handle } from "@/lib/api";
import { recentEvents } from "@/lib/feed";

export const GET = handle(() => ({ events: recentEvents() }));
