import fs from "node:fs";
import { tokenize } from "./keywords.js";
import { toIndoWhere } from "./prefs.js";
import { assertSafeHttpsUrl, fileExists, resolveDataPath } from "./security.js";
import type { JobListing } from "./types.js";

interface RawIndoJob {
  id?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  description?: unknown;
  url?: unknown;
  created?: unknown;
  tags?: unknown;
  type?: unknown;
}

function asString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeIndoJob(raw: RawIndoJob): JobListing | null {
  const id = asString(raw.id, 64);
  const title = asString(raw.title, 200);
  const company = asString(raw.company, 200);
  const location = asString(raw.location, 200);
  const description = asString(raw.description, 4000);
  if (!id || !title || !company || !location || !description) return null;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 40))
    : [];

  const url = assertSafeHttpsUrl(asString(raw.url, 500)) ?? "";

  return {
    id,
    title,
    company,
    location,
    description,
    url,
    created: asString(raw.created, 40) || undefined,
    tags,
    source: "indo",
  };
}

function loadCatalog(filePath: string): JobListing[] {
  if (!fileExists(filePath)) {
    console.error("Indo catalog missing", { filePath });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    console.error("Indo catalog parse failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error("Indo catalog must be a JSON array");
    return [];
  }

  const jobs: JobListing[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const job = normalizeIndoJob(row as RawIndoJob);
    if (job) jobs.push(job);
  }
  return jobs;
}

function jobSearchText(job: JobListing): string {
  return [job.title, job.location, job.description, ...(job.tags ?? [])].join(" ");
}

export function createIndoCatalog(options: {
  dataDir: string;
  indoJobsPath: string;
}) {
  const catalogPath = (() => {
    try {
      return resolveDataPath(options.dataDir, options.indoJobsPath);
    } catch {
      // Fall back to project-relative default via cwd resolve in resolveDataPath
      try {
        return resolveDataPath(process.cwd(), options.indoJobsPath);
      } catch (error) {
        console.error("Indo catalog path rejected", {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return "";
      }
    }
  })();

  function searchIndoJobs(query: {
    what?: string;
    whatOr?: string;
    where?: string;
  }): JobListing[] {
    if (!catalogPath) return [];
    const jobs = loadCatalog(catalogPath);
    if (jobs.length === 0) return [];

    const terms = tokenize([query.whatOr, query.what].filter(Boolean).join(" "));
    const whereHint = toIndoWhere(query.where);

    let filtered = jobs;

    if (whereHint && whereHint !== "remote") {
      filtered = filtered.filter((job) =>
        normalizeIncludes(job.location, whereHint) ||
        normalizeIncludes(jobSearchText(job), whereHint),
      );
      // If location filter wipes everything, fall back to all (still rank by keywords)
      if (filtered.length === 0) filtered = jobs;
    } else if (whereHint === "remote") {
      const remoteOnly = filtered.filter((job) =>
        job.location.toLowerCase().includes("remote"),
      );
      if (remoteOnly.length > 0) filtered = remoteOnly;
    }

    if (terms.length === 0) {
      return filtered.slice(0, 40);
    }

    const scored = filtered
      .map((job) => {
        const hay = jobSearchText(job).toLowerCase();
        const hits = terms.filter((t) => hay.includes(t)).length;
        return { job, hits };
      })
      .filter((row) => row.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    return scored.map((row) => row.job);
  }

  return { searchIndoJobs, catalogPath };
}

function normalizeIncludes(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export type IndoCatalog = ReturnType<typeof createIndoCatalog>;
