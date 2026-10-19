"use client";

import { useEffect, useState, type ReactNode } from "react";
import { loadLatest } from "@/lib/readings";

export function AfterFirstCard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const update = () => {
      try { setReady(localStorage.getItem("tastrology:first-card") === "1" || Boolean(loadLatest()?.result)); } catch {}
    };
    update();
    window.addEventListener("tastrology:minted", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("tastrology:minted", update); window.removeEventListener("storage", update); };
  }, []);
  return ready ? children : null;
}
