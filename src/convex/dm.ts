import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

/**
 * DIRECT MESSAGES
 * ---------------
 * A visitor's chat thread with the owner's Telegram bot. The visitor id lives
 * in the browser (there are no accounts), and every message is stored here so
 * the web UI can render the full conversation reactively — including the
 * owner's replies, which arrive through the Telegram webhook in `http.ts`.
 */

/** The visible conversation for one thread, oldest → newest. */
export const listThread = query({
  args: { threadId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 120, 1), 300);
    const rows = await ctx.db
      .query("dmMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});

/** Cheap counters used for the unread badge in the sidebar. */
export const threadSummary = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("dmMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(200);
    const last = rows[0];
    return {
      total: rows.length,
      ownerReplies: rows.filter((r) => r.direction === "owner").length,
      lastAt: last?._creationTime ?? null,
      lastText: last?.text ?? null,
      lastDirection: last?.direction ?? null,
    };
  },
});

/** Resolves the thread a Telegram reply belongs to (webhook lookup). */
export const threadForTelegramMessage = internalQuery({
  args: { telegramMessageId: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("dmMessages")
      .withIndex("by_telegram_message", (q) =>
        q.eq("telegramMessageId", args.telegramMessageId),
      )
      .first();
    return row ? { threadId: row.threadId, author: row.author } : null;
  },
});

export const recordUserMessage = internalMutation({
  args: {
    threadId: v.string(),
    author: v.string(),
    text: v.string(),
    hasScreenshot: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("dmMessages", {
      threadId: args.threadId,
      direction: "user",
      author: args.author,
      text: args.text,
      hasScreenshot: args.hasScreenshot,
      delivered: false,
    });
  },
});

export const markRelayed = internalMutation({
  args: {
    id: v.id("dmMessages"),
    telegramMessageId: v.optional(v.number()),
    delivered: v.boolean(),
    telegramError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      telegramMessageId: args.telegramMessageId,
      delivered: args.delivered,
      telegramError: args.telegramError,
    });
  },
});

/** Inserts an owner reply that arrived through the Telegram webhook. */
export const recordOwnerMessage = internalMutation({
  args: {
    threadId: v.string(),
    author: v.string(),
    text: v.string(),
    telegramMessageId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("dmMessages", {
      threadId: args.threadId,
      direction: "owner",
      author: args.author,
      text: args.text,
      telegramMessageId: args.telegramMessageId,
      delivered: true,
    });
  },
});
