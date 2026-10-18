"use client";

import { authOn, whenAuthReady } from "./authBridge";

const KEY = "tastrology:pc";
let pending: Promise<string | null> | null = null;

/** Your player code, once per browser: share links carry it so every share doubles as a friend invite. Null when signed out. */
export function playerCode(): Promise<string | null> {
  if (!authOn) return Promise.resolve(null);
  try {
    const hit = localStorage.getItem(KEY);
    if (hit) return Promise.resolve(hit);
  } catch {}
  pending ??= (async () => {
    const b = await whenAuthReady();
    if (!b?.signedIn()) return null;
    const j = (await fetch("/api/friends?whoami=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { me?: { pc?: string } } | null;
    const pc = j?.me?.pc ?? null;
    if (pc) rememberPlayerCode(pc);
    return pc;
  })().finally(() => (pending = null));
  return pending;
}

export function rememberPlayerCode(pc: string) {
  try {
    localStorage.setItem(KEY, pc);
  } catch {}
}

/** On sign-out the code belongs to someone else. */
export function forgetPlayerCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
