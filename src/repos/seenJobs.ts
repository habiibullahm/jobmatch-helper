import { getDb } from "../db.js";
import type { NotifyChannel } from "../types.js";

export function hasSeenJob(chatId: number, jobId: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS ok FROM seen_jobs WHERE chat_id = ? AND job_id = ?`)
    .get(chatId, jobId) as { ok: number } | undefined;
  return Boolean(row);
}

export function markSeen(
  chatId: number,
  jobId: string,
  score: number,
  channel: NotifyChannel,
): void {
  getDb()
    .prepare(
      `INSERT INTO seen_jobs (chat_id, job_id, score, channel, notified_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, job_id) DO NOTHING`,
    )
    .run(chatId, jobId, score, channel, new Date().toISOString());
}

export function getSeenJobIds(chatId: number): Set<string> {
  const rows = getDb()
    .prepare(`SELECT job_id FROM seen_jobs WHERE chat_id = ?`)
    .all(chatId) as { job_id: string }[];
  return new Set(rows.map((r) => r.job_id));
}
