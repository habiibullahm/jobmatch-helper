import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | undefined;

export function openDb(dataDir: string): Database.Database {
  if (db) return db;

  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "jobmatch.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  try {
    fs.chmodSync(dbPath, 0o600);
  } catch {
    // Best-effort on Windows / restricted FS
  }
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not opened. Call openDb() first.");
  }
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id INTEGER PRIMARY KEY,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      prefs_text TEXT,
      alerts_enabled INTEGER NOT NULL DEFAULT 0,
      last_digest_date TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seen_jobs (
      chat_id INTEGER NOT NULL,
      job_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      channel TEXT NOT NULL,
      notified_at TEXT NOT NULL,
      PRIMARY KEY (chat_id, job_id),
      FOREIGN KEY (chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
    );
  `);
}
