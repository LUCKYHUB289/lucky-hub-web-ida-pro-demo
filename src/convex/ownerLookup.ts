import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Minimal lookup so the Telegram action can attribute an event to a user
 * without relying on identity propagation into sub-functions.
 */
export const userBasics = internalQuery({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return null;
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      name: user.name ?? null,
      email: user.email ?? null,
      isAnonymous: user.isAnonymous ?? false,
    };
  },
});
