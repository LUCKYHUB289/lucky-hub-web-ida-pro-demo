import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

const dumpArgs = {
  userId: v.optional(v.id("users")),
  userName: v.optional(v.string()),
  userEmail: v.optional(v.string()),
  fileName: v.string(),
  fileSize: v.number(),
  format: v.string(),
  arch: v.string(),
  bits: v.number(),
  symbolCount: v.number(),
  sectionCount: v.number(),
  action: v.string(),
  downloadKind: v.optional(v.string()),
  note: v.optional(v.string()),
  telegramOk: v.optional(v.boolean()),
};

/** Logged whenever a lib is scanned, exported, patched or signed. */
export const recordDump = internalMutation({
  args: dumpArgs,
  handler: async (ctx, args) => {
    return await ctx.db.insert("dumps", {
      userId: args.userId,
      userName: args.userName,
      userEmail: args.userEmail,
      fileName: args.fileName,
      fileSize: args.fileSize,
      format: args.format,
      arch: args.arch,
      bits: args.bits,
      symbolCount: args.symbolCount,
      sectionCount: args.sectionCount,
      action: args.action,
      downloadKind: args.downloadKind,
      note: args.note,
      telegramOk: args.telegramOk,
    });
  },
});

export const recordFeedback = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    fileName: v.optional(v.string()),
    toolAction: v.optional(v.string()),
    rating: v.optional(v.number()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("feedback", {
      userId: args.userId,
      userName: args.userName,
      userEmail: args.userEmail,
      fileName: args.fileName,
      toolAction: args.toolAction,
      rating: args.rating,
      message: args.message,
      delivered: false,
    });
  },
});

export const markFeedbackDelivery = internalMutation({
  args: {
    id: v.id("feedback"),
    delivered: v.boolean(),
    telegramError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      delivered: args.delivered,
      telegramError: args.telegramError,
    });
  },
});

/* ------------------------------------------------------------------ *
 * Public queries
 * ------------------------------------------------------------------ */

export const myDumps = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    return await ctx.db
      .query("dumps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const myFeedback = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const limit = Math.min(Math.max(args.limit ?? 15, 1), 100);
    return await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const communityStats = query({
  args: {},
  handler: async (ctx) => {
    const dumps = await ctx.db.query("dumps").order("desc").take(2000);
    const feedback = await ctx.db.query("feedback").order("desc").take(500);

    const downloads = dumps.filter((d) => d.action === "download").length;
    const scans = dumps.filter((d) => d.action === "scan").length;
    const patches = dumps.filter((d) => d.action === "patch").length;
    const signatures = dumps.filter((d) => d.action === "signature").length;
    const totalSymbols = dumps.reduce((sum, d) => sum + (d.symbolCount ?? 0), 0);

    const archTally = new Map<string, number>();
    for (const d of dumps) {
      archTally.set(d.arch, (archTally.get(d.arch) ?? 0) + 1);
    }
    const topArch = [...archTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

    const delivered = feedback.filter((f) => f.delivered).length;
    const ratingSum = feedback.reduce((sum, f) => sum + (f.rating ?? 0), 0);
    const ratingCount = feedback.filter((f) => typeof f.rating === "number").length;

    return {
      scans,
      downloads,
      patches,
      signatures,
      totalSymbols,
      feedbackCount: feedback.length,
      deliveredToOwner: delivered,
      avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
      topArch,
      recent: dumps.slice(0, 8).map((d) => ({
        fileName: d.fileName,
        arch: d.arch,
        format: d.format,
        action: d.action,
        symbolCount: d.symbolCount,
        at: d._creationTime,
      })),
    };
  },
});
