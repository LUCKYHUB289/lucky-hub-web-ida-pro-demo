/**
 * Backend bridge.
 *
 * The workbench is a fully client-side tool, so the app is built to run in two
 * modes from the exact same bundle:
 *
 *   connected   — VITE_CONVEX_URL is set: feedback you send, direct messages,
 *                 dump history and community stats are enabled.
 *   standalone  — no backend configured: every feature of the lib reader works,
 *                 feedback/history quietly degrade to no-ops.
 *
 * There is no account system: every visitor uses the tool anonymously.
 * `hasBackend` and `convexUrl` are module constants, so the provider tree never
 * changes shape at runtime and hook order stays stable.
 */

import { api } from "@/convex/_generated/api";
import { useAction, useConvex } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const hasBackend = Boolean(convexUrl);

/* ------------------------------------------------------------------ *
 * Backend reachability
 *
 * `hasBackend` only says a URL was baked into the build — it does not mean
 * the deployment answers. A configured-but-dead deployment would quietly
 * swallow every message, so we probe it once and report the truth.
 * ------------------------------------------------------------------ */

const PROBE_TIMEOUT_MS = 8000;

export type BackendState = "standalone" | "checking" | "online" | "offline";

export interface BackendStatus {
  state: BackendState;
  /** Why the deployment could not be reached (only set while offline). */
  error: string | null;
}

const STANDALONE_STATUS: BackendStatus = { state: "standalone", error: null };

const BackendStatusContext = createContext<BackendStatus>(STANDALONE_STATUS);

/** Real reachability of the configured Convex deployment. */
export function useBackendStatus(): BackendStatus {
  return useContext(BackendStatusContext);
}

/* ------------------------------------------------------------------ *
 * Messages to the owner
 * ------------------------------------------------------------------ */

export interface NotifyArgs {
  kind: string;
  message?: string;
  fileName?: string;
  fileSize?: number;
  format?: string;
  arch?: string;
  bits?: number;
  symbolCount?: number;
  sectionCount?: number;
  downloadKind?: string;
  rating?: number;
  note?: string;
  screen?: string;
  userName?: string;
  userEmail?: string;
  visitorId?: string;
  /** `data:image/jpeg;base64,…` — attached to the Telegram message. */
  screenshot?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

export interface NotifyResult {
  ok: boolean;
  error: string | null;
  screenshotSent?: boolean;
}

export type NotifyFn = (args: NotifyArgs) => Promise<NotifyResult>;

export const ALERTS_UNAVAILABLE = "owner-messages-unavailable";

const offlineNotify: NotifyFn = async () => ({ ok: false, error: ALERTS_UNAVAILABLE });

const NotifyContext = createContext<NotifyFn>(offlineNotify);

export function useNotify() {
  return useContext(NotifyContext);
}

function ConnectedNotify({ children }: { children: ReactNode }) {
  const action = useAction(api.telegram.notifyOwner);

  const notify = useCallback<NotifyFn>(
    async (args) => {
      try {
        const result = await action(args);
        return {
          ok: Boolean(result?.ok),
          error: result?.error ?? null,
          screenshotSent: Boolean(result?.screenshotSent),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown delivery error",
        };
      }
    },
    [action],
  );

  return <NotifyContext.Provider value={notify}>{children}</NotifyContext.Provider>;
}

/* ------------------------------------------------------------------ *
 * Root provider
 * ------------------------------------------------------------------ */

function BackendStatusProvider({ children }: { children: ReactNode }) {
  const client = useConvex();
  const [status, setStatus] = useState<BackendStatus>({ state: "checking", error: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${convexUrl} did not answer within ${PROBE_TIMEOUT_MS / 1000}s`)),
        PROBE_TIMEOUT_MS,
      );
    });

    Promise.race([client.query(api.toolData.ping, {}), timeout])
      .then(() => {
        if (!cancelled) setStatus({ state: "online", error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          state: "offline",
          error: error instanceof Error ? error.message : "The Convex deployment is unreachable",
        });
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client]);

  return <BackendStatusContext.Provider value={status}>{children}</BackendStatusContext.Provider>;
}

export function BackendProvider({ children }: { children: ReactNode }) {
  if (!hasBackend) return <>{children}</>;
  return (
    <BackendStatusProvider>
      <ConnectedNotify>{children}</ConnectedNotify>
    </BackendStatusProvider>
  );
}
