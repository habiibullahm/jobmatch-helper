import type { AdzunaClient } from "./adzuna.js";
import type { AppConfig } from "./config.js";
import type { IndoCatalog } from "./indoCatalog.js";
import { toAdzunaWhere, toIndoWhere } from "./prefs.js";
import type { JobListing } from "./types.js";

export interface SearchAllResult {
  jobs: JobListing[];
  adzunaFailed: boolean;
}

function dedupeKey(job: JobListing): string {
  return `${job.title.trim().toLowerCase()}|${job.company.trim().toLowerCase()}`;
}

/** Prefer Indo when title+company collide. */
function mergeJobs(indo: JobListing[], adzuna: JobListing[]): JobListing[] {
  const map = new Map<string, JobListing>();
  for (const job of indo) {
    map.set(dedupeKey(job), { ...job, source: "indo" });
  }
  for (const job of adzuna) {
    const key = dedupeKey(job);
    if (!map.has(key)) {
      map.set(key, { ...job, source: job.source ?? "adzuna" });
    }
  }
  return [...map.values()];
}

export function createJobSearch(options: {
  adzuna: AdzunaClient;
  indo: IndoCatalog;
  config: AppConfig;
}) {
  const { adzuna, indo, config } = options;

  async function searchAll(query: {
    what?: string;
    whatOr?: string;
    locationText?: string;
    resultsPerPage?: number;
  }): Promise<SearchAllResult> {
    const what = query.what?.trim() || "";
    const whatOr = query.whatOr?.trim() || "";
    const locationText = query.locationText;
    const indoWhere = toIndoWhere(locationText);
    const adzunaWhere = toAdzunaWhere(locationText, config.adzunaCountry);

    const indoJobs = indo.searchIndoJobs({
      what: what || undefined,
      whatOr: whatOr || undefined,
      where: indoWhere,
    });

    let adzunaJobs: JobListing[] = [];
    let adzunaFailed = false;
    try {
      if (whatOr || what) {
        adzunaJobs = await adzuna.searchJobs({
          what: what || undefined,
          whatOr: whatOr || undefined,
          where: adzunaWhere,
          resultsPerPage: query.resultsPerPage ?? 20,
        });
        adzunaJobs = adzunaJobs.map((j) => ({ ...j, source: "adzuna" as const }));
      }
    } catch (error) {
      adzunaFailed = true;
      console.error("Adzuna search failed in searchAll", {
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      if (indoJobs.length === 0) throw error;
    }

    return {
      jobs: mergeJobs(indoJobs, adzunaJobs.slice(0, 20)),
      adzunaFailed,
    };
  }

  return { searchAll };
}

export type JobSearch = ReturnType<typeof createJobSearch>;
