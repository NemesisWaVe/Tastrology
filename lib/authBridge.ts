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
/** Long enough to sign up and click an email link, which may open in a new tab (hence localStorage, not sessionStorage). */
const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * Opens sign-in for a reading that needs an account, and resolves true once the person is signed in
 * (false if they close the sheet, the run is abandoned, or accounts are off). The request is parked in
 * localStorage first, so a sign-in that leaves the page (Google OAuth, an email link in a new tab) picks it up again.
 */
export async function signInForRun(req: AgentRequest, signal: AbortSignal): Promise<boolean> {
  const b = await whenAuthReady();
  if (!b || signal.aborted) return false;
  if (b.signedIn()) return true;
  try {
    localStorage.setItem(PENDING, JSON.stringify({ req, at: Date.now() }));
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
    localStorage.removeItem(PENDING);
  } catch {}
}

/** A reading parked before a sign-in that left the page; returned (once) only if the person came back signed in. */
export async function takePendingRun(): Promise<AgentRequest | null> {
  if (!authOn) return null;
  let parked: { req?: AgentRequest; at?: number } | null = null;
  try {
    parked = JSON.parse(localStorage.getItem(PENDING) ?? "null");
  } catch {}
  if (!parked?.req || Date.now() - (parked.at ?? 0) > PENDING_TTL_MS) {
    clearPendingRun();
    return null;
  }
  const b = await whenAuthReady();
  if (!b) return null;
  if (b.signedIn()) {
    clearPendingRun();
    return parked.req;
  }
  // Not signed in yet: Clerk may still be finishing the sign-up this page came back to (Google, then the terms step).
  // Keep the reading parked and hand it over the moment the account exists, instead of throwing it away.
  const left = PENDING_TTL_MS - (Date.now() - (parked.at ?? 0));
  const req = parked.req;
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      off();
      resolve(null);
    }, left);
    const off = b.onChange((on) => {
      if (!on) return;
      clearTimeout(t);
      off();
      clearPendingRun();
      resolve(req);
    });
  });
}

/** What someone typed into "Bring your own", kept in this browser until their reading lands. */
const DRAFT = "tastrology:draft";
export function saveDraft(d: unknown) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify({ d, at: Date.now() }));
  } catch {}
}
export function loadDraft<T>(): T | null {
  try {
    const j = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as { d?: T; at?: number } | null;
    return j?.d && Date.now() - (j.at ?? 0) < 7 * 24 * 3600 * 1000 ? j.d : null;
  } catch {
    return null;
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT);
  } catch {}
}
