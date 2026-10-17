"use client";

import { SignIn, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { setBridge } from "@/lib/authBridge";

/**
 * Lives inside <ClerkProvider> (app/layout.tsx, only when accounts are on). Registers the auth bridge for plain
 * modules and owns the sign-in sheet, so a dismissed sheet can be reported back to whoever asked for it.
 */
export function ClerkBridge() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState("/");
  const onClose = useRef<(() => void) | undefined>(undefined);
  const signedIn = useRef(false);
  const listeners = useRef(new Set<(on: boolean) => void>());

  useEffect(() => {
    signedIn.current = Boolean(isSignedIn);
    if (isSignedIn) {
      onClose.current = undefined;
      setOpen(false);
    }
    for (const l of listeners.current) l(Boolean(isSignedIn));
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    setBridge({
      signedIn: () => signedIn.current,
      openSignIn: (close) => {
        onClose.current = close;
        setBack(location.href);
        setOpen(true);
      },
      onChange: (cb) => {
        listeners.current.add(cb);
        return () => listeners.current.delete(cb);
      },
      signOut: () => clerk.signOut({ redirectUrl: "/" }),
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Sign in">
      <button aria-label="Close" onClick={dismiss} className="absolute inset-0 bg-paper/80 backdrop-blur-sm" />
      <div className="relative flex flex-col items-center gap-4">
        <p className="max-w-sm text-center font-serif text-2xl italic leading-tight text-ink">Sign in and the stars start reading.</p>
        <SignIn routing="hash" withSignUp forceRedirectUrl={back} signUpForceRedirectUrl={back} />
        <button onClick={dismiss} className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}
