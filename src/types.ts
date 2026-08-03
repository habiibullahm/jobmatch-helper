export type SessionStep =
  | "idle"
  | "awaiting_prefs"
  | "awaiting_cv"
  | "awaiting_search";

export interface ChatSession {
  step: SessionStep;
  prefsText?: string;
  lastFileUniqueId?: string;
}

export type JobSource = "indo" | "adzuna";

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  created?: string;
  tags?: string[];
  source?: JobSource;
}

export interface ScoreResult {
  score: number;
  totalKeywords: number;
  matched: string[];
  missing: string[];
}

export interface RankedJob {
  job: JobListing;
  score: ScoreResult;
  band: "strong" | "partial" | "weak";
}

export interface UserProfile {
  chatId: number;
  keywords: string[];
  prefsText: string | null;
  alertsEnabled: boolean;
  lastDigestDate: string | null;
  updatedAt: string;
}

export type NotifyChannel = "instant" | "digest" | "weak";
