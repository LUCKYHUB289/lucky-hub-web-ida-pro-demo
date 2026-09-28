import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BackendRequired } from "@/components/tool/BackendRequired";
import { api } from "@/convex/_generated/api";
import { hasBackend } from "@/lib/backend";
import { readDmThreadId, readVisitorId } from "@/lib/prefs";
import { CAPTURE_ELEMENT_ID, captureScreenshot } from "@/lib/screenshot";
import { useAction, useQuery } from "convex/react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface RelayState {
  checking: boolean;
  ok: boolean;
  url: string | null;
  pending: number | null;
  error: string | null;
}

/**
 * Guard wrapper: the chat itself is a separate component so Convex hooks are
 * only ever mounted when a deployment is actually attached.
 */
export function DmPanel(props: {
  userName: string;
  autoScreenshot: boolean;
  onAutoScreenshotChange: (value: boolean) => void;
}) {
  if (!hasBackend) {
    return (
      <BackendRequired
        feature="Direct messages"
        detail="The two-way Telegram channel keeps every thread in Convex and receives the owner's replies through a webhook, so it needs a connected deployment."
      />
    );
  }
  return <DmPanelInner {...props} />;
}

function DmPanelInner({
  userName,
  autoScreenshot,
  onAutoScreenshotChange,
}: {
  userName: string;
  autoScreenshot: boolean;
  onAutoScreenshotChange: (value: boolean) => void;
}) {
  const threadId = useMemo(() => readDmThreadId(), []);
  const messages = useQuery(api.dm.listThread, { threadId, limit: 150 });
  const summary = useQuery(api.dm.threadSummary, { threadId });

  const sendDm = useAction(api.telegram.sendDirectMessage);
  const registerWebhook = useAction(api.telegram.registerDmWebhook);
  const webhookStatus = useAction(api.telegram.dmRelayStatus);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [relay, setRelay] = useState<RelayState>({
    checking: true,
    ok: false,
    url: null,
    pending: null,
    error: null,
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshRelay = async () => {
    setRelay((prev) => ({ ...prev, checking: true }));
    try {
      await registerWebhook({});
      const info = await webhookStatus({});
      setRelay({
        checking: false,
        ok: info.ok && info.currentUrl === info.expectedUrl,
        url: info.currentUrl ?? info.expectedUrl,
        pending: info.pendingUpdates,
        error: info.error,
      });
    } catch (error) {
      setRelay({
        checking: false,
        ok: false,
        url: null,
        pending: null,
        error: error instanceof Error ? error.message : "Relay check failed",
      });
    }
  };

  useEffect(() => {
    void refreshRelay();
    // Relay wiring only needs checking once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const submit = async () => {
    const body = text.trim();
    if (!body) {
      toast.error("Write a message first");
      return;
    }
    setSending(true);
    try {
      let shot: { screenshot?: string; screenshotWidth?: number; screenshotHeight?: number } = {};
      if (autoScreenshot) {
        const target = document.getElementById(CAPTURE_ELEMENT_ID);
        const captured = await captureScreenshot(target);
        if (captured) {
          shot = {
            screenshot: captured.dataUrl,
            screenshotWidth: captured.width,
            screenshotHeight: captured.height,
          };
        }
      }
      const result = await sendDm({
        threadId,
        text: body,
        author: userName || "visitor",
        visitorId: readVisitorId(),
        ...shot,
      });
      if (result.ok) {
        setText("");
        toast.success("Message delivered to the owner's Telegram", {
          description: shot.screenshot ? "Screenshot attached." : "Reply appears here automatically.",
        });
      } else {
        toast.error("Message stored, but Telegram rejected the relay", {
          description: result.error ?? undefined,
        });
      }
    } catch (error) {
      toast.error("Could not send the message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="flex min-h-[32rem] flex-col border-gold-soft shadow-none">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <MessageCircle className="size-4 text-primary" />
            Direct line to the owner
            {summary && summary.ownerReplies > 0 && (
              <Badge variant="secondary" className="ml-2 font-mono text-[10px]">
                {summary.ownerReplies} repl{summary.ownerReplies === 1 ? "y" : "ies"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div
            ref={scrollRef}
            className="terminal-scroll flex-1 space-y-3 overflow-y-auto rounded-lg border border-border/60 bg-background/50 p-3"
          >
            {messages === undefined ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Opening the line…
              </p>
            ) : messages.length === 0 ? (
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p className="text-foreground/90">No messages yet — say hello.</p>
                <p>
                  Your message is relayed straight to the owner's Telegram bot. Reply to it there and the
                  answer shows up here instantly.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m._id}
                  className={
                    m.direction === "user"
                      ? "ml-auto max-w-[85%] rounded-lg border border-gold-soft bg-primary/10 px-3 py-2"
                      : "mr-auto max-w-[85%] rounded-lg border border-border/60 bg-card/60 px-3 py-2"
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.direction === "user" ? "you" : m.author}
                    </span>
                    {m.hasScreenshot && <Camera className="size-3 text-primary" />}
                    {m.direction === "user" && m.delivered === false && (
                      <Badge variant="destructive" className="text-[9px]">
                        not relayed
                      </Badge>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                      {new Date(m._creationTime).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">
                    {m.text}
                  </p>
                  {m.telegramError && (
                    <p className="mt-1 font-mono text-[10px] text-destructive">{m.telegramError}</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
              }}
              placeholder="Ask the owner anything — bugs, exports, feature requests…"
              className="min-h-24 text-sm"
              disabled={sending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void submit()} disabled={sending} className="gold-glow">
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                Send to Telegram
              </Button>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 cursor-pointer accent-current"
                  checked={autoScreenshot}
                  onChange={(e) => onAutoScreenshotChange(e.target.checked)}
                />
                <Camera className="size-3.5 text-primary" />
                attach a screenshot
              </label>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                ⌘/Ctrl + Enter to send
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              {relay.checking ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : relay.ok ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <ShieldAlert className="size-4 text-destructive" />
              )}
              Relay status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              {relay.checking
                ? "Checking the Telegram webhook…"
                : relay.ok
                  ? "Live — the bot is pointed at this deployment, so owner replies land here."
                  : "Not live yet. Telegram cannot reach the webhook URL, so replies won't arrive."}
            </p>
            {relay.url && <p className="break-all font-mono text-[10px]">{relay.url}</p>}
            {relay.pending !== null && (
              <p className="font-mono text-[10px]">pending updates: {relay.pending}</p>
            )}
            {relay.error && <p className="font-mono text-[10px] text-destructive">{relay.error}</p>}
            <Button variant="outline" size="sm" onClick={() => void refreshRelay()}>
              <RefreshCw />
              Reconnect relay
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] leading-5 text-muted-foreground">
            <p>1 · You type here — the message is stored and pushed to the owner's Telegram bot.</p>
            <p>2 · The owner replies to that Telegram message (or sends /reply &lt;thread&gt; &lt;text&gt;).</p>
            <p>3 · The bot's webhook calls back into this deployment and the reply appears instantly.</p>
            <p className="font-mono text-[10px] text-accent">thread {threadId}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
