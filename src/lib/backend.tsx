/**
 * Backend bridge.
 *
 * The workbench is a fully client-side tool, so the app is built to run in two
 * modes from the exact same bundle:
 *
 *   connected   — VITE_CONVEX_URL is set: accounts, dump history, feedback and
 *                 Telegram owner alerts are enabled.
 *   standalone  — no backend configured: every feature of the lib reader works,
 *                 accounts/history/alerts quietly degrade to no-ops.
 *
 * That is what makes the build droppable on any static host. `hasBackend` and
 * `convexUrl` are module constants, so the provider tree never changes shape at
 * runtime and hook order stays stable.
 */

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { createContext, useCallback, useContext, type ReactNode } from "react";

export const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const hasBackend = Boolean(convexUrl);

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export interface AuthUser {
  name: string | null;
  email: string | null;
}

/** Exactly the signature Convex Auth exposes, so both modes stay interchangeable. */
export type SignInFn = ReturnType<typeof useAuthActions>["signIn"];
export type SignOutFn = ReturnType<typeof useAuthActions>["signOut"];

export interface AuthValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  signIn: SignInFn;
  signOut: SignOutFn;
  hasBackend: boolean;
}

const unavailableSignIn: SignInFn = async (provider) => {
  throw new Error(
    `This build has no backend connected, so "${provider}" sign-in is unavailable.`,
  );
};

const noopSignOut: SignOutFn = async () => {};

const offlineAuth: AuthValue = {
  isLoading: false,
  isAuthenticated: false,
  user: null,
  signIn: unavailableSignIn,
  signOut: noopSignOut,
  hasBackend: false,
};

const AuthContext = createContext<AuthValue>(offlineAuth);

export function useAuth() {
  return useContext(AuthContext);
}

function ConnectedAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  const value: AuthValue = {
    isLoading: isLoading || user === undefined,
    isAuthenticated,
    user: user ? { name: user.name ?? null, email: user.email ?? null } : null,
    signIn,
    signOut,
    hasBackend: true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ------------------------------------------------------------------ *
 * Owner alerts
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
}

export interface NotifyResult {
  ok: boolean;
  error: string | null;
}

export type NotifyFn = (args: NotifyArgs) => Promise<NotifyResult>;

export const ALERTS_UNAVAILABLE = "owner-alerts-unavailable";

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
        return { ok: Boolean(result?.ok), error: result?.error ?? null };
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

export function BackendProvider({ children }: { children: ReactNode }) {
  if (!hasBackend) return <>{children}</>;
  return (
    <ConnectedAuth>
      <ConnectedNotify>{children}</ConnectedNotify>
    </ConnectedAuth>
  );
}
