/** Small localStorage-backed preferences shared by every entry point. */

const AUTO_SCREENSHOT_KEY = "luckyhub.autoScreenshot";
const VISITOR_KEY = "luckyhub.visitor";
const DM_THREAD_KEY = "luckyhub.dmThread";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* storage disabled — the preference simply won't persist */
  }
}

/* ---------------- screenshots attached to reports ---------------- */

/** Attach a screenshot of the page to feedback you send and direct messages. */
export function readAutoScreenshot(): boolean {
  return readBool(AUTO_SCREENSHOT_KEY, true);
}

export function writeAutoScreenshot(value: boolean): void {
  writeBool(AUTO_SCREENSHOT_KEY, value);
}

/* ---------------- anonymous identity ---------------- */

function randomId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/** Keeps ids stable for the session even when localStorage is unavailable. */
const memoryIds = new Map<string, string>();

function readStored(key: string, prefix: string): string {
  const cached = memoryIds.get(key);
  if (cached) return cached;
  let value: string;
  try {
    const existing = window.localStorage.getItem(key);
    value = existing ?? randomId(prefix);
    if (!existing) window.localStorage.setItem(key, value);
  } catch {
    value = randomId(prefix);
  }
  memoryIds.set(key, value);
  return value;
}

/**
 * Stable per-browser id. There are no accounts, so this is what identifies a
 * visitor across reloads (used for DM threads and feedback attribution).
 */
export function readVisitorId(): string {
  return readStored(VISITOR_KEY, "visitor");
}

/** Thread id for the direct-message channel with the owner's Telegram bot. */
export function readDmThreadId(): string {
  return readStored(DM_THREAD_KEY, "dm");
}
