import logo from "@/assets/logo.svg";
import { BackendRequired } from "@/components/tool/BackendRequired";
import { DmPanel } from "@/components/tool/DmPanel";
import { Workbench } from "@/components/tool/Workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { hasBackend, useBackendStatus, type BackendStatus } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { OWNER_NAME, TELEGRAM_CHANNEL, TOOL_NAME } from "@/lib/libreader";
import { readAutoScreenshot, readVisitorId, writeAutoScreenshot } from "@/lib/prefs";
import { CAPTURE_ELEMENT_ID, captureScreenshot } from "@/lib/screenshot";
import { useAction, useQuery } from "convex/react";
import {
  BookOpen,
  Camera,
  Crown,
  History,
  Loader2,
  Menu,
  MessageCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TerminalSquare,
  WifiOff,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Section = "workbench" | "feedback" | "dm" | "history" | "owner" | "guide";

const NAV: { id: Section; label: string; icon: typeof TerminalSquare; hint: string }[] = [
  { id: "workbench", label: "Workbench", icon: TerminalSquare, hint: "Read, edit and dump" },
  { id: "feedback", label: "Feedback", icon: MessageSquare, hint: "Rate the tool" },
  { id: "dm", label: "Direct message", icon: MessageCircle, hint: "Two-way chat with the owner" },
  { id: "history", label: "History", icon: History, hint: "Recent libs" },
  { id: "owner", label: "Owner & channel", icon: Crown, hint: "Telegram channel" },
  { id: "guide", label: "Field guide", icon: BookOpen, hint: "How the toolkit works" },
];


export default function Dashboard() {
  const [section, setSection] = useState<Section>("workbench");
  const [navOpen, setNavOpen] = useState(false);
  const [autoScreenshot, setAutoScreenshot] = useState(readAutoScreenshot);
  const backend = useBackendStatus();

  /* No account system: every visitor works as an anonymous guest. */
  const userName = "guest";
  const userEmail = "";

  const setShots = (value: boolean) => {
    setAutoScreenshot(value);
    writeAutoScreenshot(value);
    toast(value ? "Screenshots attached" : "Screenshots disabled", {
      description: value
        ? "Reports and direct messages now carry a picture."
        : "Reports are text-only again.",
    });
  };

  const go = (next: Section) => {
    setSection(next);
    setNavOpen(false);
  };

  /* Every section is always listed; backend-powered ones explain themselves
     when no deployment is attached (see BackendRequired). */
  const items = NAV;

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => go(item.id)}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors",
            section === item.id
              ? "border-gold-soft bg-primary/10 text-foreground"
              : "text-muted-foreground hover:border-border/70 hover:bg-card/60 hover:text-foreground",
            )}
        >
          <item.icon className={cn("size-4", section === item.id ? "text-primary" : undefined)} />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{item.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground/80">{item.hint}</span>
          </span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background bg-radial-gold">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col lg:grid lg:grid-cols-[268px_1fr]">
        {/* ---------- desktop sidebar ---------- */}
        <aside className="hidden border-r border-sidebar-border bg-sidebar/80 lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
          <div className="flex items-center gap-3 px-4 py-4">
            <img src={logo} alt="LUCKY HUB" width={36} height={36} className="rounded-lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-sm tracking-wide text-gold">{TOOL_NAME}</p>
              <p className="truncate text-[10px] text-muted-foreground">{OWNER_NAME}</p>
            </div>
          </div>
          <Separator className="bg-sidebar-border" />
          <div className="flex-1 overflow-y-auto p-3">{nav}</div>
          <div className="border-t border-sidebar-border p-3">
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">session</p>
              <p className="truncate text-sm">Anonymous access</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                No sign-in required
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
                  <Send />
                  {TELEGRAM_CHANNEL}
                </a>
              </Button>
            </div>
          </div>
        </aside>

        {/* ---------- main ---------- */}
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0">
                <div className="flex items-center gap-3 p-4">
                  <img src={logo} alt="LUCKY HUB" width={32} height={32} className="rounded-lg" />
                  <p className="font-display text-sm tracking-wide text-gold">{TOOL_NAME}</p>
                </div>
                <div className="p-3">{nav}</div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base tracking-wide">
                {NAV.find((n) => n.id === section)?.label}
              </p>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {NAV.find((n) => n.id === section)?.hint}
              </p>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "hidden font-mono text-[10px] sm:inline-flex",
                backend.state === "offline" && "border-destructive/60 text-destructive",
              )}
            >
              {backend.state === "online" ? (
                <Sparkles className="size-3 text-primary" />
              ) : (
                <WifiOff className="size-3" />
              )}
              {backend.state === "offline"
                ? "backend unreachable"
                : backend.state === "checking"
                  ? "checking backend…"
                  : backend.state === "standalone"
                    ? "standalone build"
                    : "owner channel online"}
            </Badge>
          </header>

          <main id={CAPTURE_ELEMENT_ID} className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7">
            {section === "workbench" && (
              <Workbench userName={userName} userEmail={userEmail} />
            )}
            {section === "feedback" && (
              <FeedbackPanel
                userName={userName}
                userEmail={userEmail}
                autoScreenshot={autoScreenshot}
                onAutoScreenshotChange={setShots}
              />
            )}
            {section === "dm" && (
              <DmPanel
                userName={userName}
                autoScreenshot={autoScreenshot}
                onAutoScreenshotChange={setShots}
              />
            )}
            {section === "history" && <HistoryPanel />}
            {section === "owner" && <OwnerPanel backend={backend} />}
            {section === "guide" && <GuidePanel />}
          </main>

          <footer className="border-t border-border/60 px-6 py-5 text-center">
            <p className="font-mono text-[11px] text-muted-foreground">
              {TOOL_NAME} · {OWNER_NAME} · Telegram{" "}
              <a
                href="https://t.me/LUCKY_HUB_DEV"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {TELEGRAM_CHANNEL}
              </a>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Feedback
 * ------------------------------------------------------------------ */

function FeedbackPanel(props: {
  userName: string;
  userEmail: string;
  autoScreenshot: boolean;
  onAutoScreenshotChange: (value: boolean) => void;
}) {
  if (!hasBackend) {
    return (
      <BackendRequired
        feature="Feedback to the owner"
        detail="Feedback is stored in Convex and pushed to the owner's Telegram bot, so it needs a connected deployment. The workbench, exports and the image tool all keep working offline."
      />
    );
  }
  return <FeedbackPanelInner {...props} />;
}

function FeedbackPanelInner({
  userName,
  userEmail,
  autoScreenshot,
  onAutoScreenshotChange,
}: {
  userName: string;
  userEmail: string;
  autoScreenshot: boolean;
  onAutoScreenshotChange: (value: boolean) => void;
}) {
  const notify = useAction(api.telegram.notifyOwner);
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const submit = async () => {
    if (message.trim().length < 3) {
      toast.error("Write a few words before sending");
      return;
    }
    setSending(true);
    setLastError(null);
    try {
      let shot: { screenshot?: string; screenshotWidth?: number; screenshotHeight?: number } = {};
      if (autoScreenshot) {
        const captured = await captureScreenshot(document.getElementById(CAPTURE_ELEMENT_ID));
        if (captured) {
          shot = {
            screenshot: captured.dataUrl,
            screenshotWidth: captured.width,
            screenshotHeight: captured.height,
          };
        }
      }
      const result = await notify({
        kind: "feedback",
        message: message.trim(),
        rating,
        userName,
        userEmail,
        visitorId: readVisitorId(),
        screen: "Feedback panel",
        ...shot,
      });
      if (result?.ok) {
        toast.success("Feedback delivered to the owner", {
          description: shot.screenshot
            ? "Screenshot attached to the message."
            : "LUCKY HATHUNGO WALA just got your message on Telegram.",
        });
        setMessage("");
      } else {
        setLastError(result?.error ?? "Telegram rejected the message");
        toast.error("Stored, but Telegram delivery failed", {
          description: result?.error ?? undefined,
        });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown error";
      setLastError(text);
      toast.error("Could not reach the owner", { description: text });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="border-gold-soft shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Send feedback to the owner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">How is the tool treating you?</Label>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="p-0.5"
                >
                  <Star
                    className={cn(
                      "size-6 transition-colors",
                      n <= rating ? "fill-primary text-primary" : "text-muted-foreground/50",
                    )}
                  />
                </button>
              ))}
              <span className="ml-2 font-mono text-xs text-muted-foreground">{rating}/5</span>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell LUCKY HATHUNGO WALA what worked, what broke, or what to add next…"
              className="mt-2 min-h-32 text-sm"
            />
          </div>

          {lastError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
              {lastError}
            </p>
          )}

          <Button onClick={submit} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send straight to the owner
          </Button>

          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              className="size-3.5 cursor-pointer accent-current"
              checked={autoScreenshot}
              onChange={(e) => onAutoScreenshotChange(e.target.checked)}
            />
            <Camera className="size-3.5 text-primary" />
            attach a screenshot of this page
          </label>

          <p className="text-[11px] leading-5 text-muted-foreground">
            Sending as {userName}
            {userEmail ? ` (${userEmail})` : ""}. Your message is stored with the delivery status so the
            owner can read it even if Telegram hiccups.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function HistoryPanel() {
  if (!hasBackend) {
    return (
      <BackendRequired
        feature="History & community stats"
        detail="History is recorded server-side whenever you report a lib to the owner, so it needs a connected deployment. Nothing about the local workbench depends on it."
      />
    );
  }
  return <HistoryPanelInner />;
}

function HistoryPanelInner() {
  const stats = useQuery(api.toolData.communityStats);
  const visitorId = useMemo(() => readVisitorId(), []);
  const mine = useQuery(api.toolData.dumpsForVisitor, { visitorId, limit: 40 });

  const ACTION_LABEL: Record<string, string> = {
    scan: "Analysed",
    download: "Downloaded",
    patch: "Patched",
    signature: "Signature",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Libs analysed", value: stats?.scans ?? 0 },
          { label: "One-click dumps", value: stats?.downloads ?? 0 },
          { label: "Patched exports", value: stats?.patches ?? 0 },
          { label: "Reports delivered", value: stats?.deliveredToOwner ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/70 bg-card/50 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl text-gold">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <Card className="border-gold-soft shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Your libs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mine === undefined ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : mine.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing tracked yet — libs show up here once they are reported to the owner from this
              browser.
            </p>
          ) : (
            mine.map((d) => (
              <div
                key={d._id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <Badge variant="outline" className="font-mono text-[10px]">
                  {ACTION_LABEL[d.action] ?? d.action}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{d.fileName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {d.format} · {d.arch} · {d.symbolCount.toLocaleString()} sym
                  {d.downloadKind ? ` · ${d.downloadKind}` : ""}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {new Date(d._creationTime).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Recent libs (everyone)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats === undefined ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : stats.recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing here yet — open a lib in the workbench and it will show up.
            </p>
          ) : (
            stats.recent.map((d) => (
              <div
                key={`${d.fileName}-${d.at}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
              >
                <Badge variant="outline" className="font-mono text-[10px]">
                  {ACTION_LABEL[d.action] ?? d.action}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{d.fileName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {d.format} · {d.arch} · {d.symbolCount.toLocaleString()} sym
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {new Date(d.at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {stats && stats.topArch.length > 0 && (
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-lg">Most analysed architectures</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.topArch.map(([arch, count]) => (
              <Badge key={arch} variant="secondary" className="font-mono text-[11px]">
                {arch} · {count}
              </Badge>
            ))}
            {stats.avgRating !== null && (
              <Badge variant="outline" className="font-mono text-[11px]">
                avg rating {stats.avgRating.toFixed(1)}/5
              </Badge>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Owner
 * ------------------------------------------------------------------ */

function OwnerPanel({ backend }: { backend: BackendStatus }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-gold-soft shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Owner channel status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Nothing is sent to the owner on its own — the tool never reports your activity behind your
            back. Only what you submit yourself (feedback from the panel above, and direct messages) is
            delivered to the owner's Telegram bot by the Convex backend.
          </p>

          {/* The panel is not the whole truth — say whether the deployment is
              actually answering. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-[11px]">
            {backend.state === "online" ? (
              <>
                <ShieldCheck className="size-3.5 text-primary" />
                <span className="text-muted-foreground">
                  Backend online — feedback and direct messages are delivered to {TELEGRAM_CHANNEL}.
                </span>
              </>
            ) : backend.state === "checking" ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-muted-foreground">Checking the Convex deployment…</span>
              </>
            ) : backend.state === "standalone" ? (
              <>
                <WifiOff className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Standalone build — no backend is configured, so only the local workbench is active.
                </span>
              </>
            ) : (
              <>
                <WifiOff className="size-3.5 text-destructive" />
                <span className="text-destructive">
                  The Convex deployment is unreachable, so nothing can be delivered to the owner.
                </span>
                {backend.error && (
                  <span className="font-mono text-[10px] text-destructive/80">{backend.error}</span>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Channel details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Owner" value={OWNER_NAME} />
          <Row label="Tool" value={TOOL_NAME} />
          <Row label="Telegram" value={TELEGRAM_CHANNEL} />
          <Separator />
          <Button asChild className="w-full">
            <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
              <Send />
              Open {TELEGRAM_CHANNEL}
            </a>
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground">
            Delivery runs from the Convex backend. The bot token and owner chat id are read from the
            environment with safe defaults, so feedback and direct messages work out of the box.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs text-accent">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Guide
 * ------------------------------------------------------------------ */

const GUIDE_STEPS = [
  {
    title: "1 · Drop a lib",
    body: "Any .dylib, .so, .a, Mach-O universal bundle, PE or raw blob. Parsing happens in your browser — the file is never uploaded anywhere.",
  },
  {
    title: "2 · Read every offset",
    body: "Segments, sections, the full symbol table, imports/exports, harvested strings and a hex map. Click any row to jump straight to that file offset.",
  },
  {
    title: "3 · Edit and patch",
    body: "Queue byte patches in the hex editor, then export the patched binary. Wildcard pattern hunting (? bytes) finds live code fast.",
  },
  {
    title: "4 · Dump everything",
    body: "One click writes every format: IDA listing, JSON, C/C++ header, .idc script, AOB signatures and a CSV offset table — each stamped with your session details.",
  },
];

function GuidePanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {GUIDE_STEPS.map((step) => (
        <Card key={step.title} className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-base text-gold">{step.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs leading-6 text-muted-foreground">{step.body}</CardContent>
        </Card>
      ))}
      <Card className="border-border/70 shadow-none lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-display text-base">Included IDA-style toolkit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-xs leading-6 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {[
            "ELF 32/64 · LE/BE",
            "Mach-O thin + universal",
            "PE section mapping",
            "Symbol table + bind/type",
            "Virtual ↔ file offset map",
            "arm64 lite disassembler",
            "AOB signature forge",
            "Wildcard byte search",
            "Byte patch editor",
            "C header offsets",
            "IDA .idc auto-namer",
            "CSV / JSON exporters",
          ].map((f) => (
            <span key={f} className="flex items-center gap-2">
              <Sparkles className="size-3 shrink-0 text-primary" />
              {f}
            </span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
