"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadLatest } from "@/lib/readings";
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
