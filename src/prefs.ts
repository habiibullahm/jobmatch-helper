const INDO_LOCATION_HINTS = [
  "jakarta",
  "bandung",
  "surabaya",
  "yogyakarta",
  "yogya",
  "bali",
  "indonesia",
  "remote",
];

/**
 * Location filter for Indo catalog (Jakarta/Bandung/etc. OK).
 * Returns a lowercase hint token or undefined.
 */
export function toIndoWhere(raw: string | undefined | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const lower = raw.toLowerCase();
  for (const hint of INDO_LOCATION_HINTS) {
    if (lower.includes(hint)) {
      if (hint === "yogya") return "yogyakarta";
      return hint;
    }
  }
  return lower.trim().slice(0, 40) || undefined;
}

/**
 * Map soft prefs / search where → Adzuna `where`, only when it fits the API country index.
 * Indonesian cities must not be sent when country is `sg`.
 */
export function toAdzunaWhere(
  prefsText: string | undefined | null,
  adzunaCountry: string,
): string | undefined {
  if (!prefsText?.trim()) return undefined;
  const lower = prefsText.toLowerCase();
  const country = adzunaCountry.toLowerCase();

  if (lower.includes("remote")) {
    return undefined;
  }

  const byCountry: Record<string, string[]> = {
    sg: ["singapore", "sg"],
    gb: ["london", "manchester", "birmingham", "edinburgh", "uk", "england"],
    us: ["new york", "san francisco", "seattle", "austin"],
    au: ["sydney", "melbourne", "brisbane"],
    in: ["bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "chennai", "pune"],
  };

  const hints = byCountry[country] ?? [];
  for (const hint of hints) {
    if (lower.includes(hint)) {
      if (hint === "sg") return "singapore";
      if (hint === "uk" || hint === "england") return "london";
      return hint;
    }
  }

  return undefined;
}

/** @deprecated use toAdzunaWhere */
export function parseWhereFromPrefs(
  prefsText: string | undefined | null,
  adzunaCountry: string,
): string | undefined {
  return toAdzunaWhere(prefsText, adzunaCountry);
}
