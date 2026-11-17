import { all, run } from "./db";
import { nowIso } from "./time";

export type FeedEvent = {
  id: number;
  user_id: number | null;
  kind: string;
  message: string;
  created_at: string;
};

export function emit(kind: string, message: string, userId?: number) {
  run(
    "INSERT INTO events (user_id, kind, message, created_at) VALUES (?, ?, ?, ?)",
    userId ?? null,
    kind,
    message,
    nowIso(),
  );
}

export function recentEvents(limit = 30): FeedEvent[] {
  return all<FeedEvent>("SELECT * FROM events ORDER BY id DESC LIMIT ?", limit);
}
