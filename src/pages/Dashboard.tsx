import logo from "@/assets/logo.svg";
import { Workbench } from "@/components/tool/Workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { OWNER_NAME, TELEGRAM_CHANNEL, TOOL_NAME } from "@/lib/libreader";
import { useAction, useQuery } from "convex/react";
import {
  BookOpen,
  Crown,
  History,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Send,
  Sparkles,
  Star,
  TerminalSquare,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type Section = "workbench" | "feedback" | "history" | "owner" | "guide";

const NAV: { id: Section; label: string; icon: typeof TerminalSquare; hint: string }[] = [
  { id: "workbench", label: "Workbench", icon: TerminalSquare, hint: "Read, edit and dump" },
  { id: "feedback", label: "Feedback", icon: MessageSquare, hint: "Talk to the owner" },
  { id: "history", label: "History", icon: History, hint: "Your past libs" },
  { id: "owner", label: "Owner & channel", icon: Crown, hint: "Telegram alerts" },
  { id: "guide", label: "Field guide", icon: BookOpen, hint: "How the toolkit works" },
];

const AUTO_FEEDBACK_KEY = "luckyhub.autoFeedback";

function readAutoFeedback(): boolean {
  try {
    const raw = window.localStorage.getItem(AUTO_FEEDBACK_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("workbench");
  const [navOpen, setNavOpen] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState(readAutoFeedback);

  const userName = user?.name ?? user?.email?.split("@")[0] ?? "operator";
  const userEmail = user?.email ?? "";

  const setAuto = (value: boolean) => {
    setAutoFeedback(value);
    try {
      window.localStorage.setItem(AUTO_FEEDBACK_KEY, String(value));
    } catch {
      /* storage disabled — preference simply won't persist */
    }
    toast(value ? "Auto feedback is on" : "Auto feedback is off", {
      description: value
        ? "The owner gets a Telegram alert on every dump."
        : "Only messages you send manually will reach the owner.",
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const go = (next: Section) => {
    setSection(next);
    setNavOpen(false);
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
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
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">signed in</p>
              <p className="truncate text-sm">{userName}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {userEmail || "guest session"}
              </p>
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={handleSignOut}>
                <LogOut />
                Sign out
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

            <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
              <Sparkles className="size-3 text-primary" />
              {autoFeedback ? "auto-feedback ON" : "auto-feedback OFF"}
            </Badge>
            <Button variant="outline" size="icon" className="lg:hidden" onClick={handleSignOut} aria-label="Sign out">
              <LogOut />
            </Button>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7">
            {section === "workbench" && (
              <Workbench
                userName={userName}
                userEmail={userEmail}
                autoFeedback={autoFeedback}
                onAutoFeedbackChange={setAuto}
              />
            )}
            {section === "feedback" && (
              <FeedbackPanel userName={userName} userEmail={userEmail} />
            )}
            {section === "history" && <HistoryPanel />}
            {section === "owner" && (
              <OwnerPanel autoFeedback={autoFeedback} onAutoFeedbackChange={setAuto} />
            )}
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

function FeedbackPanel({ userName, userEmail }: { userName: string; userEmail: string }) {
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
      const result = await notify({
        kind: "feedback",
        message: message.trim(),
        rating,
        userName,
        userEmail,
        screen: "Feedback panel",
      });
      if (result?.ok) {
        toast.success("Feedback delivered to the owner", {
          description: "LUCKY HATHUNGO WALA just got your Telegram alert.",
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

  const mine = useQuery(api.toolData.myFeedback, { limit: 10 });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
          <p className="text-[11px] leading-5 text-muted-foreground">
            Sending as {userName}
            {userEmail ? ` (${userEmail})` : ""}. Your message is stored with the delivery status so the
            owner can read it even if Telegram hiccups.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Your recent messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {mine === undefined ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : mine.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
          ) : (
            mine.map((f) => (
              <div key={f._id} className="rounded-lg border border-border/60 bg-card/40 p-3">
                <div className="flex items-center gap-2">
                  {typeof f.rating === "number" && (
                    <span className="font-mono text-xs text-primary">{f.rating}/5</span>
                  )}
                  <Badge variant={f.delivered ? "default" : "destructive"} className="text-[10px]">
                    {f.delivered ? "delivered" : "not delivered"}
                  </Badge>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {new Date(f._creationTime).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground/90">{f.message}</p>
                {f.telegramError && (
                  <p className="mt-1 font-mono text-[10px] text-destructive">{f.telegramError}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function HistoryPanel() {
  const dumps = useQuery(api.toolData.myDumps, { limit: 40 });
  const stats = useQuery(api.toolData.communityStats);

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
          { label: "Owner alerts sent", value: stats?.deliveredToOwner ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/70 bg-card/50 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl text-gold">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Your libs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dumps === undefined ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : dumps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing here yet — open a lib in the workbench and it will show up.
            </p>
          ) : (
            dumps.map((d) => (
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

function OwnerPanel({
  autoFeedback,
  onAutoFeedbackChange,
}: {
  autoFeedback: boolean;
  onAutoFeedbackChange: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-gold-soft shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-lg">Auto feedback to Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">
            While this is on, the tool silently pings the owner's Telegram bot every time you analyse a
            lib, download a dump, patch a binary or generate signatures. Your message, rating and account
            are attached.
          </p>
          <label className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
            <Switch checked={autoFeedback} onCheckedChange={onAutoFeedbackChange} />
            <span className="text-sm">
              {autoFeedback ? "Alerts are live" : "Alerts are paused"}
            </span>
          </label>
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
            environment with safe defaults, so alerts work out of the box.
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
    body: "One click writes every format: IDA listing, JSON, C/C++ header, .idc script, AOB signatures and a CSV offset table — each stamped with your account details.",
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
