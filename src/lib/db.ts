import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  netid TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  college TEXT NOT NULL,
  is_21 INTEGER NOT NULL DEFAULT 0,
  is_house INTEGER NOT NULL DEFAULT 0,
  daily_limit_cents INTEGER NOT NULL,
  self_excluded_until TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  swipes INTEGER NOT NULL CHECK (swipes >= 0),
  cents INTEGER NOT NULL CHECK (cents >= 0)
);

-- Append-only source of truth for every balance change.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  delta_swipes INTEGER NOT NULL,
  delta_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  stake_value_cents INTEGER NOT NULL DEFAULT 0, -- >0 only for game stakes; drives daily limits
  created_at TEXT NOT NULL,
  et_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user_date ON ledger(user_id, et_date);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  maker_id INTEGER NOT NULL REFERENCES users(id),
  side TEXT NOT NULL CHECK (side IN ('sell_swipe', 'buy_swipe')),
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  price_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coinflips (
  id INTEGER PRIMARY KEY,
  maker_id INTEGER NOT NULL REFERENCES users(id),
  maker_side TEXT NOT NULL CHECK (maker_side IN ('swipes', 'dd')),
  swipes INTEGER NOT NULL,
  cents INTEGER NOT NULL,
  taker_id INTEGER REFERENCES users(id),
  server_seed TEXT NOT NULL,
  seed_hash TEXT NOT NULL,
  client_seed TEXT,
  roll REAL,
  winner_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS jackpots (
  id INTEGER PRIMARY KEY,
  draw_date TEXT NOT NULL UNIQUE,
  draws_at TEXT NOT NULL,
  server_seed TEXT NOT NULL,
  seed_hash TEXT NOT NULL,
  pot_swipes INTEGER NOT NULL DEFAULT 0,
  pot_cents INTEGER NOT NULL DEFAULT 0,
  sponsor_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'no_entries')),
  total_tickets INTEGER,
  winning_ticket INTEGER,
  roll REAL,
  winner_id INTEGER REFERENCES users(id),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS jackpot_entries (
  id INTEGER PRIMARY KEY,
  jackpot_id INTEGER NOT NULL REFERENCES jackpots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('free', 'swipe', 'dd')),
  tickets INTEGER NOT NULL,
  swipes INTEGER NOT NULL DEFAULT 0,
  cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parlays (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  stake_swipes INTEGER NOT NULL DEFAULT 0,
  stake_cents INTEGER NOT NULL DEFAULT 0,
  stake_value_cents INTEGER NOT NULL,
  odds REAL NOT NULL,
  potential_payout_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
  locks_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS parlay_legs (
  id INTEGER PRIMARY KEY,
  parlay_id INTEGER NOT NULL REFERENCES parlays(id),
  kind TEXT NOT NULL CHECK (kind IN ('rain', 'temp')),
  date TEXT NOT NULL,
  start_hour INTEGER NOT NULL,
  end_hour INTEGER NOT NULL,
  params TEXT NOT NULL,
  label TEXT NOT NULL,
  probability REAL NOT NULL,
  odds REAL NOT NULL,
  forecast TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'won', 'lost', 'void')),
  observed TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weather_cache (
  key TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
`;

const g = globalThis as unknown as { __swipestakesDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__swipestakesDb) {
    const file = config.databasePath;
    if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const conn = new DatabaseSync(file);
    conn.exec(SCHEMA);
    g.__swipestakesDb = conn;
  }
  return g.__swipestakesDb;
}

/** For tests: drop the cached connection so the next db() call opens a fresh one. */
export function resetDbForTests() {
  g.__swipestakesDb?.close();
  g.__swipestakesDb = undefined;
}

let depth = 0;

/**
 * Run fn inside a transaction. node:sqlite is synchronous and we never await inside,
 * so nothing else can interleave. Nested calls join the outer transaction.
 */
export function tx<T>(fn: () => T): T {
  const conn = db();
  if (depth > 0) return fn();
  conn.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

type Param = string | number | bigint | null | Uint8Array;

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Param[]): number {
  const r = db().prepare(sql).run(...params);
  return Number(r.lastInsertRowid);
}
