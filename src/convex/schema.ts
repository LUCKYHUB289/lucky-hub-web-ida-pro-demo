import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ---- LUCKY HUB WEB IDA PRO ----

    // every lib that gets scanned / exported / patched
    dumps: defineTable({
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
      // scan | download | patch | signature
      action: v.string(),
      downloadKind: v.optional(v.string()),
      note: v.optional(v.string()),
      telegramOk: v.optional(v.boolean()),
    })
      .index("by_user", ["userId"])
      .index("by_action", ["action"]),

    // feedback pushed to the owner's Telegram bot
    feedback: defineTable({
      userId: v.optional(v.id("users")),
      userName: v.optional(v.string()),
      userEmail: v.optional(v.string()),
      fileName: v.optional(v.string()),
      toolAction: v.optional(v.string()),
      rating: v.optional(v.number()),
      message: v.string(),
      delivered: v.boolean(),
      telegramError: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_delivered", ["delivered"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
