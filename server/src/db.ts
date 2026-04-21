import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(join(DATA_DIR, "pdfs"), { recursive: true });

export const db = new Database(join(DATA_DIR, "olympics.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    sport           TEXT NOT NULL,
    discipline      TEXT,
    event           TEXT,
    venue           TEXT,
    start_utc       TEXT NOT NULL,
    end_utc         TEXT,
    medal           INTEGER NOT NULL DEFAULT 0,
    session_code    TEXT,
    source_version  TEXT NOT NULL,
    raw             TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_sport_idx     ON sessions(sport);
  CREATE INDEX IF NOT EXISTS sessions_venue_idx     ON sessions(venue);
  CREATE INDEX IF NOT EXISTS sessions_start_idx     ON sessions(start_utc);
  CREATE INDEX IF NOT EXISTS sessions_medal_idx     ON sessions(medal);

  CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    sport, discipline, event, venue,
    content='sessions', content_rowid='rowid'
  );

  CREATE TABLE IF NOT EXISTS venues (
    slug    TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    lat     REAL NOT NULL,
    lng     REAL NOT NULL,
    city    TEXT NOT NULL,
    sports  TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS refresh_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at          TEXT NOT NULL,
    ok              INTEGER NOT NULL,
    source_version  TEXT,
    pdfs_downloaded INTEGER NOT NULL DEFAULT 0,
    sessions_parsed INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    duration_ms     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS refresh_log_ran_idx ON refresh_log(ran_at DESC);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Web Push: each browser subscription is the identity. No user accounts.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id            TEXT PRIMARY KEY,          -- random id we mint
    endpoint      TEXT NOT NULL UNIQUE,
    p256dh        TEXT NOT NULL,
    auth          TEXT NOT NULL,
    user_agent    TEXT,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    disabled      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS follows (
    subscription_id TEXT NOT NULL,
    sport           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    PRIMARY KEY (subscription_id, sport),
    FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS follows_sport_idx ON follows(sport);

  CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id TEXT NOT NULL,
    sport           TEXT NOT NULL,
    kind            TEXT NOT NULL,          -- new_medal | time_change | venue_change | removed | added
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    session_id      TEXT,
    payload         TEXT NOT NULL,          -- JSON blob
    created_at      TEXT NOT NULL,
    read_at         TEXT,
    push_status     TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
    push_error      TEXT,
    FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS notif_sub_idx ON notifications(subscription_id, created_at DESC);

  -- Snapshot of last successful parse, used for diffing.
  CREATE TABLE IF NOT EXISTS session_snapshot (
    id          TEXT PRIMARY KEY,
    sport       TEXT NOT NULL,
    event       TEXT,
    venue       TEXT,
    start_utc   TEXT NOT NULL,
    medal       INTEGER NOT NULL DEFAULT 0
  );
`);

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db.prepare(
    "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, value);
}
