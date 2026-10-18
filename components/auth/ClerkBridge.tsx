"use client";

import { AgeBlocked, AgeGate, useAgeOk } from "./AgeGate";
import { SignIn, useAuth, useClerk } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setBridge } from "@/lib/authBridge";
import { forgetPlayerCode } from "@/lib/player";
import { UsernameGate } from "./UsernameGate";
import { LiveAlerts } from "@/components/friends/LiveAlerts";

/**
 * Lives inside <ClerkProvider> (app/layout.tsx, only when accounts are on). Registers the auth bridge for plain
 * modules and owns the sign-in sheet, so a dismissed sheet can be reported back to whoever asked for it.
 */
export function ClerkBridge() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [age, setAge] = useAgeOk();
  const [back, setBack] = useState("/");
  const onClose = useRef<(() => void) | undefined>(undefined);
  const signedIn = useRef(false);
  const listeners = useRef(new Set<(on: boolean) => void>());

  // One place that turns "Clerk has a user now" into a closed sheet and a resumed reading.
  const settle = useRef((on: boolean) => {
    if (on === signedIn.current) return;
    signedIn.current = on;
    if (on) {
      onClose.current = undefined;
      setOpen(false);
    }
    for (const l of listeners.current) l(on);
  });

  useEffect(() => settle.current(Boolean(isSignedIn)), [isSignedIn]);

  // Back from Google (or mid sign-up) the URL carries Clerk's hash route, e.g. #/sso-callback or #/continue. The
  // sheet has to be open for Clerk to finish it, including the terms step; closed, the sign-up was left half done
  // and only completed at the next sign-in.
  const [resuming, setResuming] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    if (/^#\/(sso-callback|continue|verify|factor|create|reset)/.test(location.hash)) {
      setBack(location.href.split("#")[0]);
      setResuming(true);
      setOpen(true);
    }
  }, [isLoaded, isSignedIn]);

  // useAuth can lag behind a sign-up finished in the sheet or in another tab (an email link), which used to need a
  // refresh. Clerk's own listener, plus a check when the tab comes back into view, catches it straight away.
  useEffect(() => {
    if (!isLoaded) return;
    const off = clerk.addListener(({ user }) => settle.current(Boolean(user)));
    const look = () => {
      if (document.visibilityState === "visible") settle.current(Boolean(clerk.user));
    };
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      off();
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [isLoaded, clerk]);

  useEffect(() => {
    if (!isLoaded) return;
    setBridge({
      signedIn: () => signedIn.current || Boolean(clerk.user),
      openSignIn: (close) => {
        onClose.current = close;
        setBack(location.href);
        setOpen(true);
      },
      onChange: (cb) => {
        listeners.current.add(cb);
        return () => listeners.current.delete(cb);
      },
      signOut: () => {
        forgetPlayerCode();
        return clerk.signOut({ redirectUrl: "/" });
      },
    });
    return () => setBridge(null);
  }, [isLoaded, clerk]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function dismiss() {
    setOpen(false);
    const cb = onClose.current;
    onClose.current = undefined;
    cb?.();
  }

  // The /sign-in and /sign-up pages carry their own form: never stack the sheet on top of it.
  const gate = (
    <>
      <UsernameGate signedIn={Boolean(isLoaded && isSignedIn)} />
      {isLoaded && isSignedIn && <LiveAlerts />}
    </>
  );
  if (!open || /^\/sign-(in|up)/.test(pathname)) return gate;
  return (
    <>
      {gate}
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Sign in">
        <button aria-label="Close" onClick={dismiss} className="absolute inset-0 bg-paper/80 backdrop-blur-sm" />
        <div className="relative flex flex-col items-center gap-4">
          {age === "ok" || resuming ? (
            <SignIn routing="hash" withSignUp forceRedirectUrl={back} signUpForceRedirectUrl={back} />
          ) : age === "no" ? (
            <AgeBlocked />
          ) : age === null ? (
            <AgeGate onAnswer={setAge} />
          ) : null}
          <button onClick={dismiss} className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink">
            Not now
          </button>
        </div>
      </div>
    </>
  );
}
