"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

/**
 * OWNER ALERT CHANNEL
 * -------------------
 * Every scan, download, patch, signature export and feedback message is pushed
 * straight to the owner's Telegram bot.
 *
 * Prefer real environment variables. Set these in the project keys panel and
 * they win over the inline defaults below:
 *     TELEGRAM_BOT_TOKEN     — the bot's HTTP API token
 *     TELEGRAM_OWNER_CHAT_ID — the owner's numeric chat id
 */
const FALLBACK_BOT_TOKEN = "8833629668:AAH-q9AOMJG7S4v0_bqyZpDsOzxzswuJT_E";
const FALLBACK_OWNER_CHAT_ID = "7049367634";

export const TOOL_NAME = "LUCKY HUB WEB IDA PRO";
export const OWNER_NAME = "LUCKY HATHUNGO WALA";
export const TELEGRAM_CHANNEL = "@LUCKY_HUB_DEV";

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

const KIND_TITLE: Record<string, string> = {
  scan: "🔍 New lib analysed",
  download: "⬇️ One-click dump downloaded",
  patch: "🩹 Lib patched + exported",
  signature: "🎯 Signature generated",
  feedback: "💬 Feedback from a user",
  install: "🚀 Tool opened",
};

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
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error: string | null; userName: string; userEmail: string }> => {
    const userId = await getAuthUserId(ctx);
    const user = await ctx.runQuery(internal.ownerLookup.userBasics, {
      userId: userId ?? undefined,
    });

    const userName =
      args.userName ??
      user?.name ??
      (user?.email ? user.email.split("@")[0] : "anonymous");
    const userEmail = args.userEmail ?? user?.email ?? "not signed in";

    const isFeedback = args.kind === "feedback";

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
      });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN ?? FALLBACK_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_OWNER_CHAT_ID ?? FALLBACK_OWNER_CHAT_ID;

    const lines: string[] = [
      `<b>${TOOL_NAME}</b>`,
      `<i>${OWNER_NAME} · ${TELEGRAM_CHANNEL}</i>`,
      "",
      `<b>${KIND_TITLE[args.kind] ?? "📡 Tool event"}</b>`,
      "",
      `👤 <b>User:</b> ${escapeHtml(userName)}`,
      `📧 <b>Account:</b> ${escapeHtml(userEmail)}`,
      `🆔 <b>User ID:</b> <code>${escapeHtml(userId ?? "guest")}</code>`,
    ];

    if (args.fileName) lines.push(`📦 <b>Lib:</b> <code>${escapeHtml(args.fileName)}</code>`);
    if (typeof args.fileSize === "number") lines.push(`📏 <b>Size:</b> ${formatBytes(args.fileSize)}`);
    if (args.format) lines.push(`🧩 <b>Format:</b> ${escapeHtml(args.format)}`);
    if (args.arch) {
      lines.push(`⚙️ <b>Arch:</b> ${escapeHtml(args.arch)} (${args.bits ?? "?"}-bit)`);
    }
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
    if (args.message) {
      lines.push("", `💬 <b>Message</b>`, `<blockquote>${escapeHtml(args.message)}</blockquote>`);
    }
    lines.push("", `🕒 ${new Date().toISOString()}`);

    const text = lines.join("\n");

    let ok = false;
    let error: string | undefined;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; description?: string };
      ok = res.ok && body.ok === true;
      if (!ok) error = body.description ?? `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : "Network error reaching Telegram";
    }

    if (isFeedback && feedbackId) {
      await ctx.runMutation(internal.toolData.markFeedbackDelivery, {
        id: feedbackId,
        delivered: ok,
        telegramError: error,
      });
    }

    return { ok, error: error ?? null, userName, userEmail };
  },
});
