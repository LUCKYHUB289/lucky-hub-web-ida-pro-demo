/** Small localStorage-backed preferences shared by every entry point. */

const AUTO_FEEDBACK_KEY = "luckyhub.autoFeedback";

export function readAutoFeedback(): boolean {
  try {
    const raw = window.localStorage.getItem(AUTO_FEEDBACK_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function writeAutoFeedback(value: boolean): void {
  try {
    window.localStorage.setItem(AUTO_FEEDBACK_KEY, String(value));
  } catch {
    /* storage disabled — the preference simply won't persist */
  }
}
