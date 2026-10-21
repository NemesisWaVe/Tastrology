"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadLatest, mintedHere } from "@/lib/readings";
import { whenAuthReady } from "@/lib/authBridge";

/**
 * True once this person has somewhere to go: a card minted on this device, or a signed-in account (whose deck
 * lives on the server, so a second phone shows the links too).
 */
export function useHasPlace() {
  const [local, setLocal] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const update = () => {
      try { setLocal(localStorage.getItem("tastrology:first-card") === "1" || Boolean(loadLatest()?.result)); } catch {}
    };
    update();
    window.addEventListener("tastrology:minted", update);
    window.addEventListener("storage", update);
    let off: (() => void) | undefined, dead = false;
    void whenAuthReady(15000).then((b) => {
      if (!b || dead) return;
      setSignedIn(b.signedIn());
      off = b.onChange(setSignedIn);
    });
    return () => {
      dead = true;
      off?.();
      window.removeEventListener("tastrology:minted", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return local || signedIn;
}

export function AfterFirstCard({ children }: { children: ReactNode }) {
  return useHasPlace() ? children : null;
}

const OPEN = "tastrology:economy";
/** Set by a finished fight on this device (/vs or a friend bout). */
export const FOUGHT = "tastrology:fought";

/** Records a fight here, which opens the economy (useEconomyOpen). */
export function markFought() {
  try {
    localStorage.setItem(FOUGHT, "1");
  } catch {}
  window.dispatchEvent(new Event("tastrology:minted"));
}

// One /api/me read per page for the gate, however many places ask.
let asked: Promise<boolean> | null = null;
const askServer = () =>
  (asked ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { economyOpen?: boolean } | null) => m?.economyOpen === true)
    .catch(() => false));

/**
 * True once the Shop and Stardust should show: a second card, a first fight (on this device or, signed in, as the
 * server knows it), or Stardust already held. A first visit sees one card and one share, nothing to buy.
 */
export function useEconomyOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let dead = false;
    const local = () => {
      try {
        return localStorage.getItem(OPEN) === "1" || localStorage.getItem(FOUGHT) === "1" || mintedHere() >= 2;
      } catch {
        return false;
      }
    };
    const set = (v: boolean) => {
      if (!v || dead) return;
      setOpen(true);
      try {
        localStorage.setItem(OPEN, "1");
      } catch {}
    };
    const check = (fresh = false) => {
      if (local()) return set(true);
      if (fresh) asked = null;
      void whenAuthReady(15000).then((b) => (b?.signedIn() ? askServer().then(set) : undefined));
    };
    check();
    const onMint = () => check(true);
    window.addEventListener("tastrology:minted", onMint);
    window.addEventListener("storage", onMint);
    let off: (() => void) | undefined;
    void whenAuthReady(15000).then((b) => {
      if (b && !dead) off = b.onChange((signedIn) => signedIn && check(true));
    });
    return () => {
      dead = true;
      off?.();
      window.removeEventListener("tastrology:minted", onMint);
      window.removeEventListener("storage", onMint);
    };
  }, []);
  return open;
}

export function AfterEconomy({ children }: { children: ReactNode }) {
  return useEconomyOpen() ? children : null;
}
