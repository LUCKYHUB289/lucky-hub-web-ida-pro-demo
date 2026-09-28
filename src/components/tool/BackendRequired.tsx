import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlugZap, TerminalSquare } from "lucide-react";

/**
 * Shown in place of backend-powered panels (feedback, history, direct messages)
 * when the build has no Convex deployment attached. Everything the panel does
 * still works locally — it just needs the deployment URL to relay.
 */
export function BackendRequired({
  feature,
  detail,
}: {
  feature: string;
  detail: string;
}) {
  return (
    <Card className="mx-auto w-full max-w-2xl border-gold-soft shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <PlugZap className="size-4 text-primary" />
          {feature} needs a connected backend
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs leading-5 text-muted-foreground">
        <p>{detail}</p>
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/50 p-3 font-mono text-[11px]">
          <p className="text-foreground/90"># 1 · deploy the Convex backend</p>
          <p>bunx convex deploy</p>
          <p className="pt-1.5 text-foreground/90"># 2 · expose the deployment URL to the frontend</p>
          <p>VITE_CONVEX_URL=https://your-app.convex.cloud</p>
        </div>
        <p>
          Set that variable in your host's environment settings (Netlify → Site configuration →
          Environment variables), then rebuild. The full walkthrough — including the Telegram bot token
          and the DM relay — is in <span className="font-mono text-accent">DEPLOY.md</span>.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline" className="font-mono text-[10px]">
            <TerminalSquare className="size-3 text-primary" />
            VITE_CONVEX_URL
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            TELEGRAM_BOT_TOKEN
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            TELEGRAM_OWNER_CHAT_ID
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
