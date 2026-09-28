/**
 * Shared Telegram + branding configuration.
 *
 * Deliberately NOT a "use node" module so both the node action file
 * (`telegram.ts`) and the HTTP router (`http.ts`) can import it.
 *
 * Prefer real environment variables — set them in the project keys panel and
 * they win over the inline defaults below:
 *     TELEGRAM_BOT_TOKEN      — the bot's HTTP API token
 *     TELEGRAM_OWNER_CHAT_ID  — the owner's numeric chat id
 *     TELEGRAM_WEBHOOK_SECRET — shared secret Telegram echoes back on webhooks
 */

export const TOOL_NAME = "LUCKY HUB WEB IDA PRO";
export const OWNER_NAME = "LUCKY HATHUNGO WALA";
export const TELEGRAM_CHANNEL = "@LUCKY_HUB_DEV";
export const TELEGRAM_WEBHOOK_PATH = "/telegram/webhook";

const FALLBACK_BOT_TOKEN = "8833629668:AAH-q9AOMJG7S4v0_bqyZpDsOzxzswuJT_E";
const FALLBACK_OWNER_CHAT_ID = "7049367634";
const FALLBACK_WEBHOOK_SECRET = "luckyhub-dm-relay-9f2c41";

export function telegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? FALLBACK_BOT_TOKEN;
}

export function telegramOwnerChatId(): string {
  return process.env.TELEGRAM_OWNER_CHAT_ID ?? FALLBACK_OWNER_CHAT_ID;
}

export function telegramWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET ?? FALLBACK_WEBHOOK_SECRET;
}

export function telegramApi(method: string): string {
  return `https://api.telegram.org/bot${telegramBotToken()}/${method}`;
}

/** Public HTTPS URL Convex serves HTTP routes from (empty in local dev). */
export function convexSiteUrl(): string {
  return process.env.CONVEX_SITE_URL ?? "";
}

export function webhookUrl(): string {
  const base = convexSiteUrl().replace(/\/+$/, "");
  return base ? `${base}${TELEGRAM_WEBHOOK_PATH}` : "";
}

/** Telegram caps photo captions at 1024 characters. */
export function clampCaption(text: string, max = 1000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 40)}\n… (truncated — full text is in the log)`;
}
