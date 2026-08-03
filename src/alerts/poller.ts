import type { Api } from "grammy";
import type { AppConfig } from "../config.js";
import type { JobSearch } from "../jobSearch.js";
import { buildSearchTerms } from "../keywords.js";
import { formatInstantAlert } from "../messages.js";
import { rankJobs } from "../ranker.js";
import * as seenJobs from "../repos/seenJobs.js";
import * as users from "../repos/users.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startAlertPoller(
  api: Api,
  jobSearch: JobSearch,
  config: AppConfig,
): NodeJS.Timeout {
  const intervalMs = Math.max(1, config.alertPollMinutes) * 60 * 1000;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const alertUsers = users.listAlertUsers();
      for (const profile of alertUsers) {
        try {
          const terms = buildSearchTerms(profile.keywords);
          if (terms.length === 0) continue;
          const { jobs } = await jobSearch.searchAll({
            whatOr: terms.join(" "),
            locationText: profile.prefsText ?? undefined,
            resultsPerPage: 20,
          });
          const seen = seenJobs.getSeenJobIds(profile.chatId);

          for (const job of jobs) {
            if (seen.has(job.id)) continue;
            const ranked = rankJobs([job], profile.keywords, profile.prefsText, 1);
            const row = ranked[0];
            if (!row) continue;

            if (row.score.score >= config.strongMatchMin) {
              await api.sendMessage(profile.chatId, formatInstantAlert(row), {
                parse_mode: "HTML",
                link_preview_options: { is_disabled: true },
              });
              seenJobs.markSeen(profile.chatId, job.id, row.score.score, "instant");
              seen.add(job.id);
            } else if (row.score.score >= config.digestMatchMin) {
              // Leave for digest — do not mark yet
            } else {
              // Too weak — mark so we don't rescore forever
              seenJobs.markSeen(profile.chatId, job.id, row.score.score, "weak");
              seen.add(job.id);
            }
          }
        } catch (error) {
          console.error("Alert poll failed for user", {
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

  const kickoff = setTimeout(() => {
    void run();
  }, 15_000);

  const handle = setInterval(() => {
    void run();
  }, intervalMs);

  void kickoff;
  return handle;
}
