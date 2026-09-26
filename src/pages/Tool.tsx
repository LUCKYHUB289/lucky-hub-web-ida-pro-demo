import logo from "@/assets/logo.svg";
import { Workbench } from "@/components/tool/Workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { OWNER_NAME, TELEGRAM_CHANNEL, TOOL_NAME } from "@/lib/libreader";
import { readAutoFeedback, writeAutoFeedback } from "@/lib/prefs";
import { Crown, LayoutDashboard, LogIn, Send, WifiOff } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * The public workbench. Reachable directly at /tool on any deployment — it does
 * not require an account, and works even when no backend is configured.
 */
export default function Tool() {
  const { user, isAuthenticated, hasBackend } = useAuth();
  const navigate = useNavigate();
  const [autoFeedback, setAutoFeedback] = useState(readAutoFeedback);

  const setAuto = (value: boolean) => {
    setAutoFeedback(value);
    writeAutoFeedback(value);
    toast(value ? "Auto feedback is on" : "Auto feedback is off", {
      description: value
        ? "The owner gets a Telegram alert on every dump."
        : "Only messages you send manually will reach the owner.",
    });
  };

  return (
    <div className="min-h-screen bg-background bg-radial-gold">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3"
            aria-label="Back to home"
          >
            <img src={logo} alt="LUCKY HUB" width={34} height={34} className="rounded-lg" />
            <span className="text-left">
              <span className="block font-display text-sm leading-tight tracking-wide text-gold">
                {TOOL_NAME}
              </span>
              <span className="hidden font-mono text-[10px] leading-tight text-muted-foreground sm:block">
                {OWNER_NAME} · {TELEGRAM_CHANNEL}
              </span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {!hasBackend && (
              <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
                <WifiOff className="size-3 text-primary" />
                standalone build
              </Badge>
            )}
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
                <Send />
                {TELEGRAM_CHANNEL}
              </a>
            </Button>
            {isAuthenticated ? (
              <Button size="sm" onClick={() => navigate("/dashboard")}>
                <LayoutDashboard />
                Workspace
              </Button>
            ) : hasBackend ? (
              <Button size="sm" onClick={() => navigate("/auth?returnTo=/dashboard")}>
                <LogIn />
                Sign in
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gold-soft bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Crown className="size-4 text-primary" />
            <p className="font-display text-lg tracking-wide">
              Lib reader · offset dumper · byte editor
            </p>
            <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
              {isAuthenticated ? "signed in" : "public access"}
            </Badge>
          </div>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            {hasBackend
              ? "Drop a lib and everything is parsed locally in your browser. One click exports every format and alerts the owner."
              : "Drop a lib and everything is parsed locally in your browser. One click exports every format — no account, no upload, no backend required."}
          </p>
        </div>

        <Workbench
          userName={user?.name ?? user?.email?.split("@")[0] ?? ""}
          userEmail={user?.email ?? ""}
          autoFeedback={hasBackend && autoFeedback}
          onAutoFeedbackChange={setAuto}
        />
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
  );
}
