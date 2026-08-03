import type { Api } from "grammy";
import type { AppConfig } from "../config.js";
import type { JobSearch } from "../jobSearch.js";
import { buildSearchTerms } from "../keywords.js";
import { formatDigestMessage } from "../messages.js";
import { rankJobs } from "../ranker.js";
import * as seenJobs from "../repos/seenJobs.js";
import * as users from "../repos/users.js";
import type { RankedJob } from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jakartaDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function jakartaHour(now = new Date()): number {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return Number(hourStr);
}

export function startDigestScheduler(
  api: Api,
  jobSearch: JobSearch,
  config: AppConfig,
): NodeJS.Timeout {
  const checkEveryMs = 5 * 60 * 1000;
  let running = false;

  const runDigest = async () => {
    if (running) return;
    running = true;
    try {
      const today = jakartaDateString();
      const hour = jakartaHour();
      if (hour < config.digestHourWib) return;

      const alertUsers = users.listAlertUsers();
      for (const profile of alertUsers) {
        if (profile.lastDigestDate === today) continue;

        try {
          const terms = buildSearchTerms(profile.keywords);
          if (terms.length === 0) {
            users.setLastDigestDate(profile.chatId, today);
            continue;
          }

          const { jobs } = await jobSearch.searchAll({
            whatOr: terms.join(" "),
            locationText: profile.prefsText ?? undefined,
            resultsPerPage: 20,
          });
          const seen = seenJobs.getSeenJobIds(profile.chatId);

          const candidates: RankedJob[] = [];
          for (const job of jobs) {
            if (seen.has(job.id)) continue;
            const ranked = rankJobs([job], profile.keywords, profile.prefsText, 1);
            const row = ranked[0];
            if (!row) continue;
            if (row.score.score >= config.digestMatchMin) {
              candidates.push(row);
            } else {
              // Below digest floor — don't thrash on every poll/digest
              seenJobs.markSeen(profile.chatId, job.id, row.score.score, "weak");
              seen.add(job.id);
            }
          }

          candidates.sort((a, b) => b.score.score - a.score.score);
          const top = candidates.slice(0, 5);

          if (top.length > 0) {
            await api.sendMessage(profile.chatId, formatDigestMessage(top), {
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
            });
            for (const row of top) {
              seenJobs.markSeen(profile.chatId, row.job.id, row.score.score, "digest");
            }
          }

          // Only mark day done after successful processing (including empty digest)
          users.setLastDigestDate(profile.chatId, today);
        } catch (error) {
          // Do not set lastDigestDate — retry this user on next tick
          console.error("Digest failed for user", {
            chatId: profile.chatId,
            errorName: error instanceof Error ? error.name : "unknown",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
        await sleep(750);
      }
    } finally {
      running = false;
    }
  };

  return setInterval(() => {
    void runDigest();
  }, checkEveryMs);
}
