import { getDb } from "../db.js";
import type { UserProfile } from "../types.js";

interface UserRow {
  chat_id: number;
  keywords_json: string;
  prefs_text: string | null;
  alerts_enabled: number;
  last_digest_date: string | null;
  updated_at: string;
}

function rowToProfile(row: UserRow): UserProfile {
  let keywords: string[] = [];
  try {
    const parsed = JSON.parse(row.keywords_json) as unknown;
    if (Array.isArray(parsed)) {
      keywords = parsed.filter((k): k is string => typeof k === "string");
    }
  } catch {
    keywords = [];
  }

  return {
    chatId: row.chat_id,
    keywords,
    prefsText: row.prefs_text,
    alertsEnabled: row.alerts_enabled === 1,
    lastDigestDate: row.last_digest_date,
    updatedAt: row.updated_at,
  };
}

export function getUser(chatId: number): UserProfile | undefined {
  const row = getDb()
    .prepare(
      `SELECT chat_id, keywords_json, prefs_text, alerts_enabled, last_digest_date, updated_at
       FROM users WHERE chat_id = ?`,
    )
    .get(chatId) as UserRow | undefined;
  return row ? rowToProfile(row) : undefined;
}

export function upsertProfile(
  chatId: number,
  keywords: string[],
  prefsText: string | null | undefined,
): UserProfile {
  const now = new Date().toISOString();
  const existing = getUser(chatId);
  const prefs =
    prefsText === undefined ? (existing?.prefsText ?? null) : prefsText || null;

  getDb()
    .prepare(
      `INSERT INTO users (chat_id, keywords_json, prefs_text, alerts_enabled, last_digest_date, updated_at)
       VALUES (@chat_id, @keywords_json, @prefs_text, @alerts_enabled, @last_digest_date, @updated_at)
       ON CONFLICT(chat_id) DO UPDATE SET
         keywords_json = excluded.keywords_json,
         prefs_text = excluded.prefs_text,
         updated_at = excluded.updated_at`,
    )
    .run({
      chat_id: chatId,
      keywords_json: JSON.stringify(keywords),
      prefs_text: prefs,
      alerts_enabled: existing?.alertsEnabled ? 1 : 0,
      last_digest_date: existing?.lastDigestDate ?? null,
      updated_at: now,
    });

  return getUser(chatId)!;
}

export function setAlertsEnabled(chatId: number, enabled: boolean): UserProfile | undefined {
  const existing = getUser(chatId);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE users SET alerts_enabled = ?, updated_at = ? WHERE chat_id = ?`,
    )
    .run(enabled ? 1 : 0, now, chatId);

  return getUser(chatId);
}

export function setLastDigestDate(chatId: number, date: string): void {
  getDb()
    .prepare(`UPDATE users SET last_digest_date = ?, updated_at = ? WHERE chat_id = ?`)
    .run(date, new Date().toISOString(), chatId);
}

export function clearProfile(chatId: number): void {
  getDb().prepare(`DELETE FROM users WHERE chat_id = ?`).run(chatId);
}

export function listAlertUsers(): UserProfile[] {
  const rows = getDb()
    .prepare(
      `SELECT chat_id, keywords_json, prefs_text, alerts_enabled, last_digest_date, updated_at
       FROM users
       WHERE alerts_enabled = 1`,
    )
    .all() as UserRow[];

  return rows.map(rowToProfile).filter((u) => u.keywords.length > 0);
}
