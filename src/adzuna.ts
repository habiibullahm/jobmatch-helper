import type { AppConfig } from "./config.js";
import type { JobListing } from "./types.js";

export class AdzunaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdzunaError";
  }
}

interface AdzunaRawJob {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
}

interface AdzunaSearchResponse {
  results?: AdzunaRawJob[];
  count?: number;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJob(raw: AdzunaRawJob): JobListing | null {
  if (raw.id === undefined || raw.id === null) return null;
  const title = (raw.title ?? "").trim();
  if (!title) return null;

  return {
    id: String(raw.id),
    title,
    company: (raw.company?.display_name ?? "Unknown").trim() || "Unknown",
    location: (raw.location?.display_name ?? "—").trim() || "—",
    description: stripHtml(raw.description ?? ""),
    url: (raw.redirect_url ?? "").trim(),
    created: raw.created,
    source: "adzuna",
  };
}

export function createAdzunaClient(config: AppConfig) {
  const { adzunaAppId, adzunaAppKey, adzunaCountry } = config;

  async function searchJobs(options: {
    what?: string;
    whatOr?: string;
    where?: string;
    page?: number;
    resultsPerPage?: number;
  }): Promise<JobListing[]> {
    if (!adzunaAppId || !adzunaAppKey) {
      throw new AdzunaError(
        "Adzuna belum dikonfigurasi. Set ADZUNA_APP_ID dan ADZUNA_APP_KEY.",
      );
    }

    const what = options.what?.trim() ?? "";
    const whatOr = options.whatOr?.trim() ?? "";
    if (!what && !whatOr) {
      throw new AdzunaError("Query pencarian kosong.");
    }

    const page = options.page ?? 1;
    const resultsPerPage = options.resultsPerPage ?? 20;
    const params = new URLSearchParams({
      app_id: adzunaAppId,
      app_key: adzunaAppKey,
      results_per_page: String(resultsPerPage),
      "content-type": "application/json",
    });
    // Prefer OR semantics for multi-skill profile queries (AND of 6 CV tokens is often empty).
    if (whatOr) {
      params.set("what_or", whatOr);
    }
    if (what) {
      params.set("what", what);
    }
    if (options.where?.trim()) {
      params.set("where", options.where.trim());
    }

    const url = `https://api.adzuna.com/v1/api/jobs/${adzunaCountry}/search/${page}?${params}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AdzunaError("Adzuna timeout. Coba lagi nanti.");
      }
      throw new AdzunaError("Gagal menghubungi Adzuna. Coba lagi nanti.");
    }

    if (!response.ok) {
      // Never log URL (contains app_key).
      if (response.status === 404) {
        throw new AdzunaError(
          `Adzuna tidak punya indeks negara "${adzunaCountry}" (HTTP 404). ` +
            `Set ADZUNA_COUNTRY ke kode yang didukung, mis. sg, gb, us, au, in. ` +
            `(Indonesia/id tidak tersedia di Adzuna.)`,
        );
      }
      throw new AdzunaError(
        `Adzuna error (HTTP ${response.status}). Coba lagi atau ubah query.`,
      );
    }

    let data: AdzunaSearchResponse;
    try {
      data = (await response.json()) as AdzunaSearchResponse;
    } catch {
      throw new AdzunaError("Respons Adzuna tidak valid.");
    }

    const jobs: JobListing[] = [];
    for (const raw of data.results ?? []) {
      const job = normalizeJob(raw);
      if (job) jobs.push(job);
    }
    return jobs;
  }

  return { searchJobs };
}

export type AdzunaClient = ReturnType<typeof createAdzunaClient>;
