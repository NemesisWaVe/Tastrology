"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { authOn, whenAuthReady } from "@/lib/authBridge";

/** Clerk's bits load only when accounts are on, so the anonymous app ships none of it. */
const ClerkNav = dynamic(() => import("./ClerkNav"), { ssr: false });

/**
 * Sign in / UserButton for the navs. Renders nothing when accounts are off, and waits for the bridge
 * (which only exists inside <ClerkProvider>) so a half-configured env can never crash the nav.
 */
export function AuthNav() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!authOn) return;
    let off = false;
    void whenAuthReady(15000).then((b) => !off && setReady(Boolean(b)));
    return () => {
      off = true;
    };
  }, []);
  if (!authOn) return null;
  return ready ? <ClerkNav /> : <span className="inline-block h-7 w-7" aria-hidden />;
}
