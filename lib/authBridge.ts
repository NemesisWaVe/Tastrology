"use client";

import type { AgentRequest } from "./types";

/**
 * Client-side link to Clerk that works whether or not accounts are on. Plain modules (useAgentRun, the deck page)
 * talk to this; components/auth/ClerkBridge.tsx fills it in from inside <ClerkProvider>. With no publishable key,
 * nothing registers and every helper answers "signed out, no accounts".
 */
export const authOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export interface Bridge {
  signedIn(): boolean;
  /** Opens the sign-in sheet. `onClose` fires if the person dismisses it without signing in. */
  openSignIn(onClose?: () => void): void;
  /** Subscribe to sign-in state changes. Returns an unsubscribe. */
  onChange(cb: (signedIn: boolean) => void): () => void;
  signOut(): Promise<void>;
}

let bridge: Bridge | null = null;
const waiting: ((b: Bridge) => void)[] = [];

export function setBridge(b: Bridge | null) {
  bridge = b;
  if (b) for (const w of waiting.splice(0)) w(b);
}

/** The bridge once Clerk has loaded, or null when accounts are off (or Clerk doesn't load within `timeoutMs`). */
export function whenAuthReady(timeoutMs = 8000): Promise<Bridge | null> {
  if (!authOn) return Promise.resolve(null);
  if (bridge) return Promise.resolve(bridge);
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      const i = waiting.indexOf(done);
      if (i >= 0) waiting.splice(i, 1);
      resolve(null);
    }, timeoutMs);
    function done(b: Bridge) {
      clearTimeout(t);
      resolve(b);
    }
    waiting.push(done);
  });
}

const PENDING = "tastrology:pending";
const PENDING_TTL_MS = 15 * 60 * 1000;

/**
 * Opens sign-in for a reading that needs an account, and resolves true once the person is signed in
 * (false if they close the sheet, the run is abandoned, or accounts are off). The request is parked in
 * sessionStorage first, so a sign-in that leaves the page (Google OAuth) can pick it up again on return.
 */
export async function signInForRun(req: AgentRequest, signal: AbortSignal): Promise<boolean> {
  const b = await whenAuthReady();
  if (!b || signal.aborted) return false;
  if (b.signedIn()) return true;
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ req, at: Date.now() }));
  } catch {}
  return new Promise((resolve) => {
    let off = () => {};
    const finish = (ok: boolean) => {
      off();
      signal.removeEventListener("abort", abort);
      if (ok) clearPendingRun();
      resolve(ok);
    };
    const abort = () => finish(false);
    off = b.onChange((on) => on && finish(true));
    signal.addEventListener("abort", abort);
    b.openSignIn(() => {
      clearPendingRun();
      finish(false);
    });
  });
}

export function clearPendingRun() {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {}
}

/** A reading parked before a sign-in that left the page; returned (once) only if the person came back signed in. */
export async function takePendingRun(): Promise<AgentRequest | null> {
  if (!authOn) return null;
  let parked: { req?: AgentRequest; at?: number } | null = null;
  try {
    parked = JSON.parse(sessionStorage.getItem(PENDING) ?? "null");
  } catch {}
  if (!parked?.req || Date.now() - (parked.at ?? 0) > PENDING_TTL_MS) {
    clearPendingRun();
    return null;
  }
  const b = await whenAuthReady();
  clearPendingRun();
  return b?.signedIn() ? parked.req : null;
}
