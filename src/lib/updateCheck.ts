/**
 * v0.8.1: "Update available" check against the public GitHub releases.
 *
 * The app compares its own APP_VERSION with the latest published release tag
 * of github.com/notbedd/mundus and reports when the release is newer. The
 * arrow in the Sidebar / Atlas version badge deep-links to the releases page.
 *
 * Design notes:
 * - Uses the unauthenticated GitHub API (60 req/h per IP is plenty for one
 *   check at app start, further throttled by a 6-hour localStorage cache).
 * - A failed fetch (offline, rate limit, private repo) never surfaces an
 *   error — the arrow simply stays hidden and any previous cached result is
 *   kept usable.
 * - `updateAvailable` is recomputed from APP_VERSION on every read, so a
 *   stale cache (from before an app update) can never claim an update.
 */

import { APP_VERSION } from '../constants';

export const MUNDUS_REPO = 'notbedd/mundus';
export const RELEASES_PAGE_URL = `https://github.com/${MUNDUS_REPO}/releases/latest`;

const API_URL = `https://api.github.com/repos/${MUNDUS_REPO}/releases/latest`;
const CACHE_KEY = 'mundus_update_check_v1';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most one network check per 6h
const FETCH_TIMEOUT_MS = 8000;

export interface UpdateCheckResult {
  updateAvailable: boolean;
  /** Latest published tag, e.g. "v0.8.2". Null when unknown. */
  latestVersion: string | null;
  releaseUrl: string;
}

interface UpdateCheckCache {
  latest: string;
  checkedAt: number;
  releaseUrl: string;
}

/** Parses "v0.8.12" / "0.8.12" into [0, 8, 12]; null when not a version. */
export function parseVersionTag(tag: string | null | undefined): number[] | null {
  if (!tag) return null;
  const cleaned = tag.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split('.').map((part) => parseInt(part, 10) || 0);
}

/** -1 when a < b, 0 when equal, 1 when a > b (per numeric segment). */
export function compareVersionLists(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const c = parseVersionTag(candidate);
  const cur = parseVersionTag(current);
  if (!c || !cur) return false;
  return compareVersionLists(c, cur) > 0;
}

function readCache(): UpdateCheckCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.latest === 'string' && typeof parsed.checkedAt === 'number') {
      return parsed;
    }
  } catch { /* corrupt cache — ignore */ }
  return null;
}

function writeCache(cache: UpdateCheckCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* private mode — ignore */ }
}

function buildResult(latest: string | null, releaseUrl: string): UpdateCheckResult {
  return {
    updateAvailable: !!latest && isNewerVersion(latest, APP_VERSION),
    latestVersion: latest,
    releaseUrl: releaseUrl || RELEASES_PAGE_URL,
  };
}

/**
 * Returns the update state, using the 6-hour cache when fresh. Network
 * failures resolve to null (caller hides the arrow) unless a cache exists.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  const cached = readCache();
  const fresh = !!cached && (Date.now() - cached.checkedAt) < CHECK_INTERVAL_MS;

  if (!fresh) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(API_URL, {
        signal: controller.signal,
        headers: { 'Accept': 'application/vnd.github+json' },
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const tag: string | undefined = typeof data?.tag_name === 'string' ? data.tag_name : undefined;
        if (tag) {
          const next: UpdateCheckCache = {
            latest: tag,
            checkedAt: Date.now(),
            releaseUrl: typeof data?.html_url === 'string' && data.html_url ? data.html_url : RELEASES_PAGE_URL,
          };
          writeCache(next);
          return buildResult(next.latest, next.releaseUrl);
        }
      }
    } catch {
      // Offline / rate limited / abort — fall through to cache.
    }
  }

  return cached ? buildResult(cached.latest, cached.releaseUrl) : null;
}
