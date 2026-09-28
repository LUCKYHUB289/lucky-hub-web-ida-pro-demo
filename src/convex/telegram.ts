"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  OWNER_NAME,
  TELEGRAM_CHANNEL,
  TOOL_NAME,
  clampCaption,
  convexSiteUrl,
  telegramApi,
  telegramBotToken,
  telegramOwnerChatId,
  telegramWebhookSecret,
  webhookUrl,
} from "./telegramConfig";

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  return `${(size / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * Titles for the messages the tool sends on the user's behalf. The tool never
 * reports activity automatically, so only user-initiated messages land here.
 */
const KIND_TITLE: Record<string, string> = {
  feedback: "💬 Feedback from a user",
};

/* ------------------------------------------------------------------ *
 * Telegram transport
 * ------------------------------------------------------------------ */

interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: number;
}

async function callTelegram(
  method: string,
  payload: Record<string, unknown>,
  init?: { form?: FormData },
): Promise<SendResult> {
  const url = telegramApi(method);
  try {
    const res = init?.form
      ? await fetch(url, { method: "POST", body: init.form })
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const body = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (res.ok && body.ok === true) {
      return { ok: true, messageId: body.result?.message_id };
    }
    return { ok: false, error: body.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error reaching Telegram" };
  }
}

function base64ToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  const raw = match ? match[3] : dataUrl;
  const mime = match?.[1] ?? "image/jpeg";
  if (!raw) return null;
  try {
    const buffer = Buffer.from(raw, "base64");
    if (buffer.byteLength === 0) return null;
    return { bytes: new Uint8Array(buffer), mime };
  } catch {
    return null;
  }
}

async function sendPhoto(
  chatId: string,
  image: string,
  caption: string,
): Promise<SendResult> {
  const decoded = base64ToBytes(image);
  if (!decoded) return { ok: false, error: "Screenshot payload could not be decoded." };
  const ext = decoded.mime.includes("png") ? "png" : "jpg";
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", clampCaption(caption));
  form.append("parse_mode", "HTML");
  form.append(
    "photo",
    new Blob([decoded.bytes as unknown as BlobPart], { type: decoded.mime }),
    `luckyhub.${ext}`,
  );
  return await callTelegram("sendPhoto", {}, { form });
}

async function sendText(chatId: string, text: string): Promise<SendResult> {
  return await callTelegram("sendMessage", {
    chat_id: chatId,
    text: clampCaption(text, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

/* ------------------------------------------------------------------ *
 * Messages sent to the owner on the user's behalf
 * ------------------------------------------------------------------ */

export const notifyOwner = action({
  args: {
    kind: v.string(),
    message: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    format: v.optional(v.string()),
    arch: v.optional(v.string()),
    bits: v.optional(v.number()),
    symbolCount: v.optional(v.number()),
    sectionCount: v.optional(v.number()),
    downloadKind: v.optional(v.string()),
    rating: v.optional(v.number()),
    note: v.optional(v.string()),
    screen: v.optional(v.string()),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    visitorId: v.optional(v.string()),
    /** `data:image/jpeg;base64,…` — streamed to Telegram, never persisted. */
    screenshot: v.optional(v.string()),
    screenshotWidth: v.optional(v.number()),
    screenshotHeight: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error: string | null; userName: string; userEmail: string; screenshotSent: boolean }> => {
    const userId = await getAuthUserId(ctx);
    const user = await ctx.runQuery(internal.ownerLookup.userBasics, {
      userId: userId ?? undefined,
    });

    const userName =
      args.userName ?? user?.name ?? (user?.email ? user.email.split("@")[0] : "anonymous");
    const userEmail = args.userEmail ?? user?.email ?? "not signed in";
    const isFeedback = args.kind === "feedback";
    const hasScreenshot = Boolean(args.screenshot);

    let feedbackId: Id<"feedback"> | null = null;
    if (isFeedback) {
      feedbackId = await ctx.runMutation(internal.toolData.recordFeedback, {
        userId: userId ?? undefined,
        userName,
        userEmail,
        fileName: args.fileName,
        toolAction: args.screen,
        rating: args.rating,
        message: args.message ?? "(no message)",
        hasScreenshot,
        screenshotWidth: args.screenshotWidth,
        screenshotHeight: args.screenshotHeight,
        visitorId: args.visitorId,
      });
    } else {
      await ctx.runMutation(internal.toolData.recordDump, {
        userId: userId ?? undefined,
        userName,
        userEmail,
        fileName: args.fileName ?? "unknown",
        fileSize: args.fileSize ?? 0,
        format: args.format ?? "unknown",
        arch: args.arch ?? "unknown",
        bits: args.bits ?? 64,
        symbolCount: args.symbolCount ?? 0,
        sectionCount: args.sectionCount ?? 0,
        action: args.kind,
        downloadKind: args.downloadKind,
        note: args.note,
        visitorId: args.visitorId,
      });
    }

    const chatId = telegramOwnerChatId();

    const lines: string[] = [
      `<b>${TOOL_NAME}</b>`,
      `<i>${OWNER_NAME} · ${TELEGRAM_CHANNEL}</i>`,
      "",
      `<b>${KIND_TITLE[args.kind] ?? "📡 Tool event"}</b>`,
      "",
      `👤 <b>User:</b> ${escapeHtml(userName)}`,
      `📧 <b>Account:</b> ${escapeHtml(userEmail)}`,
      `🆔 <b>Visitor:</b> <code>${escapeHtml(args.visitorId ?? "guest")}</code>`,
    ];

    if (args.fileName) lines.push(`📦 <b>Lib:</b> <code>${escapeHtml(args.fileName)}</code>`);
    if (typeof args.fileSize === "number") lines.push(`📏 <b>Size:</b> ${formatBytes(args.fileSize)}`);
    if (args.format) lines.push(`🧩 <b>Format:</b> ${escapeHtml(args.format)}`);
    if (args.arch) lines.push(`⚙️ <b>Arch:</b> ${escapeHtml(args.arch)} (${args.bits ?? "?"}-bit)`);
    if (typeof args.symbolCount === "number") {
      lines.push(`🔖 <b>Symbols:</b> ${args.symbolCount.toLocaleString()}`);
    }
    if (typeof args.sectionCount === "number") {
      lines.push(`🗂 <b>Sections:</b> ${args.sectionCount}`);
    }
    if (args.downloadKind) lines.push(`📁 <b>Export:</b> ${escapeHtml(args.downloadKind)}`);
    if (args.screen) lines.push(`🖥 <b>Screen:</b> ${escapeHtml(args.screen)}`);
    if (typeof args.rating === "number") lines.push(`⭐ <b>Rating:</b> ${args.rating}/5`);
    if (args.note) lines.push(`📝 <b>Note:</b> ${escapeHtml(args.note)}`);
    if (hasScreenshot) {
      lines.push(`🖼 <b>Screenshot:</b> attached (${args.screenshotWidth ?? "?"}×${args.screenshotHeight ?? "?"})`);
    }
    if (args.message) {
      lines.push("", `💬 <b>Message</b>`, `<blockquote>${escapeHtml(args.message)}</blockquote>`);
    }
    lines.push("", `🕒 ${new Date().toISOString()}`);

    const text = lines.join("\n");
    const result = args.screenshot
      ? await sendPhoto(chatId, args.screenshot, text)
      : await sendText(chatId, text);

    if (isFeedback && feedbackId) {
      await ctx.runMutation(internal.toolData.markFeedbackDelivery, {
        id: feedbackId,
        delivered: result.ok,
        telegramError: result.error,
      });
    }

    return {
      ok: result.ok,
      error: result.error ?? null,
      userName,
      userEmail,
      screenshotSent: hasScreenshot && result.ok,
    };
  },
});

/* ------------------------------------------------------------------ *
 * Direct messages (visitor ⇄ owner's Telegram bot)
 * ------------------------------------------------------------------ */

/**
 * Points the bot's webhook at this deployment so owner replies can flow back
 * into the web UI. Idempotent — safe to call on every DM panel mount.
 */
export const registerDmWebhook = action({
  args: {},
  handler: async (): Promise<{ ok: boolean; url: string; error: string | null }> => {
    const url = webhookUrl();
    if (!url || !url.startsWith("https://")) {
      return {
        ok: false,
        url,
        error:
          "The Convex site URL is not a public HTTPS address yet, so Telegram cannot reach the relay. Deploy the backend, then reconnect.",
      };
    }
    const res = await fetch(telegramApi("setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: telegramWebhookSecret(),
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: false,
      }),
    });
    const body = (await res.json()) as { ok?: boolean; description?: string };
    return {
      ok: res.ok && body.ok === true,
      url,
      error: body.ok === true ? null : body.description ?? `HTTP ${res.status}`,
    };
  },
});

export const dmRelayStatus = action({
  args: {},
  handler: async (): Promise<{
    ok: boolean;
    expectedUrl: string;
    currentUrl: string | null;
    pendingUpdates: number | null;
    lastError: string | null;
    error: string | null;
  }> => {
    const expectedUrl = webhookUrl();
    const res = await fetch(telegramApi("getWebhookInfo"), { method: "GET" });
    const body = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { url?: string; pending_update_count?: number; last_error_message?: string };
    };
    if (!res.ok || body.ok !== true) {
      return {
        ok: false,
        expectedUrl,
        currentUrl: null,
        pendingUpdates: null,
        lastError: null,
        error: body.description ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      expectedUrl,
      currentUrl: body.result?.url || null,
      pendingUpdates: body.result?.pending_update_count ?? 0,
      lastError: body.result?.last_error_message ?? null,
      error: null,
    };
  },
});

export const sendDirectMessage = action({
  args: {
    threadId: v.string(),
    text: v.string(),
    author: v.optional(v.string()),
    visitorId: v.optional(v.string()),
    screenshot: v.optional(v.string()),
    screenshotWidth: v.optional(v.number()),
    screenshotHeight: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error: string | null; messageId: Id<"dmMessages"> | null }> => {
    const text = args.text.trim();
    if (!text) return { ok: false, error: "Write a message first.", messageId: null };
    if (!args.threadId) return { ok: false, error: "Missing chat thread.", messageId: null };

    const author = args.author?.trim() || args.visitorId || "visitor";
    const hasScreenshot = Boolean(args.screenshot);

    const messageId = await ctx.runMutation(internal.dm.recordUserMessage, {
      threadId: args.threadId,
      author,
      text,
      hasScreenshot,
    });

    const chatId = telegramOwnerChatId();
    const lines: string[] = [
      `<b>${TOOL_NAME}</b>`,
      "<b>📨 New direct message</b>",
      "",
      `👤 <b>From:</b> ${escapeHtml(author)}`,
      `🧵 <b>Thread:</b> <code>${escapeHtml(args.threadId)}</code>`,
      "",
      `<blockquote>${escapeHtml(text)}</blockquote>`,
    ];
    if (hasScreenshot) {
      lines.push(`🖼 <b>Screenshot:</b> ${args.screenshotWidth ?? "?"}×${args.screenshotHeight ?? "?"}`);
    }
    lines.push(
      "",
      `<i>Reply to this message in Telegram to answer — it shows up in the chat instantly.</i>`,
      `🕒 ${new Date().toISOString()}`,
    );
    const payload = lines.join("\n");

    const result = args.screenshot
      ? await sendPhoto(chatId, args.screenshot, payload)
      : await sendText(chatId, payload);

    await ctx.runMutation(internal.dm.markRelayed, {
      id: messageId,
      telegramMessageId: result.messageId,
      delivered: result.ok,
      telegramError: result.error,
    });

    if (result.ok) {
      // Make sure the reply path is live. Cheap and idempotent; ignore failures
      // here because the outcome is surfaced in the relay status card.
      void fetch(telegramApi("setWebhook"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl(),
          secret_token: telegramWebhookSecret(),
          allowed_updates: ["message", "edited_message"],
        }),
      }).catch(() => undefined);
    }

    return { ok: result.ok, error: result.error ?? null, messageId };
  },
});

/** Exposed for diagnostics: who the bot talks to and what token is in use. */
export const relayTarget = action({
  args: {},
  handler: async (): Promise<{ chatId: string; hasToken: boolean; siteUrl: string }> => {
    return {
      chatId: telegramOwnerChatId(),
      hasToken: Boolean(telegramBotToken()),
      siteUrl: convexSiteUrl(),
    };
  },
});
