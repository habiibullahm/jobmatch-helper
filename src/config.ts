import path from "node:path";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig() {
  const botToken = process.env.BOT_TOKEN?.trim() ?? "";
  const adzunaAppId = process.env.ADZUNA_APP_ID?.trim() ?? "";
  const adzunaAppKey = process.env.ADZUNA_APP_KEY?.trim() ?? "";
  // Adzuna does not index Indonesia (`id` → HTTP 404). Default to Singapore.
  const adzunaCountry = (process.env.ADZUNA_COUNTRY?.trim() || "sg").toLowerCase();
  const dataDir = path.resolve(process.env.DATA_DIR?.trim() || "./data");
  const indoJobsPath = process.env.INDO_JOBS_PATH?.trim() || "./data/jobs-id.json";

  return {
    botToken,
    adzunaAppId,
    adzunaAppKey,
    adzunaCountry,
    dataDir,
    indoJobsPath,
    strongMatchMin: intEnv("STRONG_MATCH_MIN", 70),
    digestMatchMin: intEnv("DIGEST_MATCH_MIN", 40),
    alertPollMinutes: intEnv("ALERT_POLL_MINUTES", 120),
    digestHourWib: intEnv("DIGEST_HOUR_WIB", 9),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
