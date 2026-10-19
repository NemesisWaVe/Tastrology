"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportFailure, track } from "@/lib/telemetry";

export function Telemetry() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/") track("landed", true);
    if (/^\/(vs|f)\/[^/]+$/.test(pathname)) {
      track("scanned", true);
      try {
        sessionStorage.setItem("tastrology:scan-at", String(Date.now()));
        // An invite page names its player: remembered so a first card can send them a friend request.
        const pc = pathname.match(/^\/f\/([0-9A-Za-z]{6})$/)?.[1];
        if (pc) localStorage.setItem("tastrology:invited-by", JSON.stringify({ pc: pc.toUpperCase(), at: Date.now() }));
      } catch {}
    }
  }, [pathname]);
  useEffect(() => {
    let reported = 0;
    const runtime = () => { if (++reported <= 3) reportFailure("runtime"); };
    const promise = () => { if (++reported <= 3) reportFailure("promise"); };
    window.addEventListener("error", runtime);
    window.addEventListener("unhandledrejection", promise);
    return () => { window.removeEventListener("error", runtime); window.removeEventListener("unhandledrejection", promise); };
  }, []);
  return null;
}
