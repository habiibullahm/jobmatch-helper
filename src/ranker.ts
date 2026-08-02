import {
  extractJobSkills,
  extractKeywords,
  keywordMatches,
  normalize,
  tokenize,
} from "./keywords.js";
import type { JobListing, RankedJob, ScoreResult } from "./types.js";

const TOP_N = 5;
const TITLE_BONUS_MAX = 10;
/** Only reshuffle by Indo/prefs when scores are this close (inclusive). */
const TIE_DELTA = 3;

export function scoreBand(score: number): RankedJob["band"] {
  if (score >= 70) return "strong";
  if (score >= 40) return "partial";
  return "weak";
}

export function bandLabel(band: RankedJob["band"]): string {
  if (band === "strong") return "Strong match";
  if (band === "partial") return "Partial match";
  return "Weak match"; // labels EN singkat, sama spirit CV Screener score bands
}

/**
 * ATS-style: extract cleaned skills from the job (no company),
 * measure overlap with profile/query keyword bag.
 */
export function scoreJobAgainstKeywords(job: JobListing, profileKeywords: string[]): ScoreResult {
  const jobKeywords = extractJobSkills(job.title, job.description, job.tags, 15);
  const profileHaystack = normalize(profileKeywords.join(" "));

  if (jobKeywords.length === 0) {
    return { score: 0, totalKeywords: 0, matched: [], missing: [] };
  }

  if (!profileHaystack) {
    return {
      score: 0,
      totalKeywords: jobKeywords.length,
      matched: [],
      missing: jobKeywords.slice(0, 6),
    };
  }

  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of jobKeywords) {
    if (keywordMatches(profileHaystack, keyword)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  let score = Math.round((matched.length / jobKeywords.length) * 100);

  const titleNorm = normalize(job.title);
  const titleHits = profileKeywords.filter((k) => keywordMatches(titleNorm, k)).length;
  if (titleHits > 0) {
    score = Math.min(100, score + Math.min(TITLE_BONUS_MAX, titleHits * 5));
  }

  return {
    score,
    totalKeywords: jobKeywords.length,
    matched: matched.slice(0, 6),
    missing: missing.slice(0, 6),
  };
}

function prefsTokens(prefsText: string | undefined | null): string[] {
  if (!prefsText?.trim()) return [];
  return tokenize(prefsText);
}

function jobMatchesPrefs(job: JobListing, prefs: string[]): boolean {
  if (prefs.length === 0) return true;
  const hay = normalize(`${job.title} ${job.location} ${job.description} ${(job.tags ?? []).join(" ")}`);
  return prefs.some((token) => hay.includes(token));
}

/**
 * Rank jobs: score first, then Indo tie-break when scores within Δ≤5, then prefs.
 */
export function rankJobs(
  jobs: JobListing[],
  keywords: string[],
  prefsText?: string | null,
  topN = TOP_N,
): RankedJob[] {
  const prefs = prefsTokens(prefsText);
  const scored = jobs.map((job) => {
    const score = scoreJobAgainstKeywords(job, keywords);
    return {
      job,
      score,
      band: scoreBand(score.score),
      prefsHit: jobMatchesPrefs(job, prefs),
      isIndo: job.source === "indo",
    };
  });

  scored.sort((a, b) => {
    const scoreDiff = b.score.score - a.score.score;
    if (Math.abs(scoreDiff) > TIE_DELTA) return scoreDiff;
    if (prefs.length > 0 && a.prefsHit !== b.prefsHit) {
      return a.prefsHit ? -1 : 1;
    }
    if (a.isIndo !== b.isIndo) return a.isIndo ? -1 : 1;
    return scoreDiff;
  });

  return scored.slice(0, topN).map(({ job, score, band }) => ({ job, score, band }));
}

const LOW_MATCH_FLOOR = 15;
const TOP1_EMPTY_FLOOR = 40;

/** Empty when no jobs, or results are too weak to be useful. */
export function isEmptyResult(ranked: RankedJob[]): boolean {
  if (ranked.length === 0) return true;
  const top = ranked[0]?.score.score ?? 0;
  if (top < TOP1_EMPTY_FLOOR && ranked.every((r) => r.score.score < LOW_MATCH_FLOOR)) {
    return true;
  }
  if (top < LOW_MATCH_FLOOR) return true;
  return false;
}

/** For /search: always use query tokens. For match: profile keywords. */
export function keywordsForSearch(queryText: string): string[] {
  return extractKeywords(queryText, 40);
}

export function keywordsForRanking(
  profileKeywords: string[] | undefined,
  queryText: string,
): string[] {
  if (profileKeywords && profileKeywords.length > 0) {
    return profileKeywords;
  }
  return extractKeywords(queryText, 40);
}
