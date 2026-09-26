/**
 * Auth is read from context so the same components work whether or not a
 * backend is connected (see `@/lib/backend`).
 */
export { useAuth } from "@/lib/backend";
export type { AuthUser, AuthValue, SignInFn, SignOutFn } from "@/lib/backend";
