const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "are",
  "our",
  "this",
  "that",
  "from",
  "will",
  "have",
  "has",
  "was",
  "were",
  "been",
  "being",
  "able",
  "about",
  "into",
  "over",
  "such",
  "than",
  "then",
  "them",
  "they",
  "their",
  "there",
  "these",
  "those",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "how",
  "all",
  "any",
  "can",
  "may",
  "must",
  "should",
  "would",
  "could",
  "also",
  "not",
  "but",
  "or",
  "as",
  "at",
  "by",
  "in",
  "on",
  "of",
  "to",
  "a",
  "an",
  "is",
  "it",
  "its",
  "we",
  "us",
  "be",
  "do",
  "does",
  "did",
  "job",
  "role",
  "position",
  "work",
  "working",
  "experience",
  "experienced",
  "required",
  "requirements",
  "requirement",
  "qualification",
  "qualifications",
  "responsibilities",
  "responsibility",
  "skills",
  "skill",
  "ability",
  "abilities",
  "knowledge",
  "good",
  "strong",
  "plus",
  "preferred",
  "prefer",
  "minimum",
  "years",
  "year",
  "etc",
  "yang",
  "dan",
  "dengan",
  "untuk",
  "dari",
  "pada",
  "dalam",
  "atau",
  "adalah",
  "ini",
  "itu",
  "kami",
  "kita",
  "anda",
  "kamu",
  "sebagai",
  "akan",
  "sudah",
  "juga",
  "bisa",
  "dapat",
  "memiliki",
  "pengalaman",
  "syarat",
  "kualifikasi",
  "tanggung",
  "jawab",
  "kemampuan",
  "pengetahuan",
  "minimal",
  "lebih",
  "baik",
  "serta",
  "bagi",
  "para",
  "oleh",
  "ke",
  "di",
  "tersebut",
  "lain",
  "nya",
  // CV fluff (high frequency, low signal for job search)
  "university",
  "universitas",
  "bachelor",
  "master",
  "gpa",
  "curriculum",
  "references",
  "reference",
  "phone",
  "email",
  "address",
  "company",
  "companies",
  "project",
  "projects",
  "responsible",
  "developed",
  "develop",
  "using",
  "used",
  "use",
  "based",
  "via",
  "etc",
  "present",
  "current",
  "currently",
  "summary",
  "profile",
  "objective",
  "education",
  "educational",
  "school",
  "college",
  "faculty",
  "internship",
  "intern",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
  // Job/corporate noise (for job-skill extract — not title-only role words)
  "ltd",
  "pte",
  "pvt",
  "llc",
  "inc",
  "corp",
  "technologies",
  "technology",
  "pacific",
  "asia",
  "clients",
  "between",
  "across",
  "advanced",
  "high",
  "senior",
  "junior",
  "engineer",
  "engineering",
  "developer",
  "development",
  "applications",
  "application",
  "solutions",
  "limited",
  "private",
]);

export const MAX_PROFILE_KEYWORDS = 40;
const MAX_LIST = 15;
const MAX_JOB_SKILLS = 15;

export function normalize(text: string): string {
  let t = text.toLowerCase();
  // Compound skill normalize before tokenization
  t = t.replace(/\bfull[\s-]?stack\b/g, " fullstack ");
  t = t.replace(/\bnode\.?js\b/g, " nodejs ");
  t = t.replace(/\bnext\.?js\b/g, " nextjs ");
  t = t.replace(/\breact[\s-]?native\b/g, " reactnative ");
  t = t.replace(/\bspring[\s-]?boot\b/g, " spring boot ");
  t = t.replace(/\bc\s*#\b/g, " csharp ");
  t = t.replace(/\.\s*net\b/g, " dotnet ");
  return t
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .map((token) => token.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/** Extract skills from a job: tags + title (2x) + description — never company name. */
export function extractJobSkills(
  title: string,
  description: string,
  tags: string[] | undefined,
  limit = MAX_JOB_SKILLS,
): string[] {
  const counts = new Map<string, number>();

  const add = (token: string, weight: number) => {
    if (token.length < 2 || STOPWORDS.has(token)) return;
    counts.set(token, (counts.get(token) ?? 0) + weight);
  };

  for (const tag of tags ?? []) {
    const t = normalize(tag).replace(/\s+/g, "");
    if (t) add(t, 5);
    for (const part of tokenize(tag)) add(part, 4);
  }

  for (const token of tokenize(title)) {
    add(token, TECH_HINTS.has(token) ? 4 : 2);
  }

  for (const token of tokenize(description)) {
    add(token, TECH_HINTS.has(token) ? 2 : 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

/** Extract top frequency keywords from CV (or any text) for profile storage. */
export function extractKeywords(text: string, limit = MAX_PROFILE_KEYWORDS): string[] {
  const counts = new Map<string, number>();

  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

export function keywordMatches(haystackNormalized: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:[^a-z0-9+#]|$)`, "i");
  return pattern.test(haystackNormalized);
}

export function scoreKeywordsAgainstText(
  keywords: string[],
  text: string,
): { score: number; totalKeywords: number; matched: string[]; missing: string[] } {
  const normalized = normalize(text);

  if (keywords.length === 0) {
    return { score: 0, totalKeywords: 0, matched: [], missing: [] };
  }

  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of keywords) {
    if (keywordMatches(normalized, keyword)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  return {
    score: Math.round((matched.length / keywords.length) * 100),
    totalKeywords: keywords.length,
    matched: matched.slice(0, MAX_LIST),
    missing: missing.slice(0, MAX_LIST),
  };
}

/** Boost common tech/skill tokens when building Adzuna queries / job extract. */
export const TECH_HINTS = new Set([
  "react",
  "angular",
  "vue",
  "svelte",
  "typescript",
  "javascript",
  "nodejs",
  "node",
  "nextjs",
  "next",
  "nuxt",
  "python",
  "django",
  "flask",
  "fastapi",
  "java",
  "spring",
  "kotlin",
  "swift",
  "golang",
  "rust",
  "php",
  "laravel",
  "ruby",
  "rails",
  "csharp",
  "dotnet",
  "sql",
  "mysql",
  "postgres",
  "postgresql",
  "mongodb",
  "redis",
  "graphql",
  "rest",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "k8s",
  "terraform",
  "kafka",
  "spark",
  "airflow",
  "tableau",
  "powerbi",
  "android",
  "ios",
  "flutter",
  "reactnative",
  "figma",
  "css",
  "html",
  "tailwind",
  "sass",
  "jest",
  "cypress",
  "selenium",
  "git",
  "linux",
  "frontend",
  "backend",
  "fullstack",
  "devops",
  "ml",
  "tensorflow",
  "pytorch",
  "nlp",
  "fintech",
  "saas",
]);

/**
 * Build Adzuna search terms from profile keywords.
 * Prefer tech/skill tokens; used with what_or (OR semantics).
 */
export function buildSearchTerms(keywords: string[], maxTerms = 6): string[] {
  const ranked = keywords
    .filter((k) => k.length >= 3)
    .map((k, index) => ({
      k,
      score: (TECH_HINTS.has(k) ? 100 : 0) + (k.length >= 4 ? 10 : 0) - index * 0.01,
    }))
    .sort((a, b) => b.score - a.score);

  const picked = ranked.slice(0, maxTerms).map((row) => row.k);
  return picked.length > 0 ? picked : keywords.slice(0, maxTerms);
}

/** @deprecated use buildSearchTerms — kept as joined string for simple what= fallback */
export function buildWhatQuery(keywords: string[], maxTerms = 6): string {
  return buildSearchTerms(keywords, maxTerms).join(" ");
}

/** Parse search input: optional `where:jakarta` or trailing location after comma. */
export function parseSearchInput(raw: string): { what: string; where?: string } {
  const trimmed = raw.trim();
  const whereMatch = trimmed.match(/\bwhere:\s*(.+)$/i);
  if (whereMatch) {
    const what = trimmed.slice(0, whereMatch.index).trim();
    return { what: what || trimmed, where: whereMatch[1].trim() };
  }

  const comma = trimmed.indexOf(",");
  if (comma > 0 && comma < trimmed.length - 1) {
    return {
      what: trimmed.slice(0, comma).trim(),
      where: trimmed.slice(comma + 1).trim(),
    };
  }

  return { what: trimmed };
}
