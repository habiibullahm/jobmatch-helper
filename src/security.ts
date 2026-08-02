import fs from "node:fs";
import path from "node:path";

const MAX_USER_TEXT = 200;

/** Clamp free-text prefs/search input. */
export function clampUserText(text: string, max = MAX_USER_TEXT): string {
  return text.trim().slice(0, max);
}

/** Allow https URLs only for job links (OWASP A10 / injection via href). */
export function assertSafeHttpsUrl(raw: string | undefined | null): string | undefined {
  if (!raw?.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;
  if (!parsed.hostname) return undefined;
  // Sample / placeholder Indo catalog links — don't show as apply URLs
  if (parsed.hostname === "example.com" || parsed.hostname.endsWith(".example.com")) {
    return undefined;
  }
  return parsed.toString();
}

/**
 * Resolve a data file path under an allowed root (blocks path traversal).
 */
export function resolveDataPath(allowedRoot: string, configuredPath: string): string {
  const root = path.resolve(allowedRoot);
  const candidate = path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), configuredPath);

  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    // Also allow project-root relative paths that resolve under cwd/data or cwd
    const cwd = path.resolve(process.cwd());
    const relCwd = path.relative(cwd, candidate);
    if (relCwd.startsWith("..") || path.isAbsolute(relCwd)) {
      throw new Error("INDO_JOBS_PATH escapes allowed directories.");
    }
    return candidate;
  }
  return candidate;
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
