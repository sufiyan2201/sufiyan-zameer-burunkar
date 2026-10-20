import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");

export const dbPath = process.env.DB_PATH || path.join(dataDir, "kindconnect.db");
if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    phone         TEXT,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('Donor', 'NGO')),
    organization  TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ngos (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL UNIQUE,
    city           TEXT NOT NULL,
    address        TEXT NOT NULL,
    phone          TEXT,
    email          TEXT,
    lat            REAL NOT NULL,
    lng            REAL NOT NULL,
    categories     TEXT NOT NULL,           -- JSON array, e.g. ["Clothes","Books"]
    required_items TEXT,
    priority       TEXT NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
    verified       INTEGER NOT NULL DEFAULT 0,
    description    TEXT
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    ngo         TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    target      INTEGER NOT NULL,
    raised      INTEGER NOT NULL DEFAULT 0,
    priority    TEXT    NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
    description TEXT    NOT NULL,
    created_by  INTEGER REFERENCES users(id),
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS donations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    type           TEXT    NOT NULL,        -- 'Money' or an item category
    item           TEXT    NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 1,
    ngo            TEXT    NOT NULL,
    status         TEXT    NOT NULL,
    amount         INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT,
    campaign_id    INTEGER REFERENCES campaigns(id),
    description    TEXT,
    pickup_address TEXT,
    phone          TEXT,
    item_condition TEXT,
    anonymous      INTEGER NOT NULL DEFAULT 0,
    simulate       INTEGER NOT NULL DEFAULT 0, -- 1 = demo auto-progress through the stages
    created_at     INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id);
  CREATE INDEX IF NOT EXISTS idx_donations_ngo  ON donations(ngo);
`);

/** Run several statements as one all-or-nothing unit. */
export function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
