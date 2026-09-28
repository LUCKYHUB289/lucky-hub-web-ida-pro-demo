import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { TELEGRAM_WEBHOOK_PATH, telegramWebhookSecret } from "./telegramConfig";

const http = httpRouter();

auth.addHttpRoutes(http);

interface TelegramUpdate {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  caption?: string;
  reply_to_message?: { message_id?: number };
  from?: { first_name?: string; username?: string };
}

http.route({
  path: TELEGRAM_WEBHOOK_PATH,
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Telegram echoes the secret we registered with `setWebhook`.
    const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (secret !== telegramWebhookSecret()) {
      return new Response("unauthorized", { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const message = update.message ?? update.edited_message;
    const text = (message?.text ?? message?.caption ?? "").trim();
    if (!message || !text) return new Response("ignored");

    const ownerName = message.from?.first_name ?? message.from?.username ?? "owner";
    const replyToId = message.reply_to_message?.message_id;

    // Preferred path: the owner replies directly to the relayed copy of a DM.
    if (typeof replyToId === "number") {
      const thread = await ctx.runQuery(internal.dm.threadForTelegramMessage, {
        telegramMessageId: replyToId,
      });
      if (thread) {
        await ctx.runMutation(internal.dm.recordOwnerMessage, {
          threadId: thread.threadId,
          author: `owner · ${ownerName}`,
          text,
          telegramMessageId: message.message_id,
        });
        return new Response("ok");
      }
    }

    // Fallback path: `/reply <threadId> <text>` for when quoting is awkward.
    const command = /^\/reply(?:@\w+)?\s+(\S+)\s+([\s\S]+)$/.exec(text);
    if (command) {
      await ctx.runMutation(internal.dm.recordOwnerMessage, {
        threadId: command[1],
        author: `owner · ${ownerName}`,
        text: command[2].trim(),
        telegramMessageId: message.message_id,
      });
      return new Response("ok");
    }

    return new Response("ignored");
  }),
});

export default http;
