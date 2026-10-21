"use client";

import { useEffect, useRef, useState } from "react";
import { useEconomyOpen, useHasPlace } from "./AfterFirstCard";
import { authOn, whenAuthReady, type Bridge } from "@/lib/authBridge";

/**
 * Phones: the nav links and the account live behind this one button, so the bar fits a 320px screen and there is a
 * single place to tap. Desktop shows the links and avatar inline instead (sm and up), so this renders nothing there.
 */
export function PhoneMenu({ newHref = "/?new=1", onNew }: { newHref?: string; onNew?: () => void }) {
  const has = useHasPlace();
  const econ = useEconomyOpen();
  const [open, setOpen] = useState(false);
  // account sits in this same menu on phones (the avatar is desktop only), so there is one thing to tap
  const [auth, setAuth] = useState<{ b: Bridge; signedIn: boolean } | null>(null);
  useEffect(() => {
    if (!authOn) return;
    let off: (() => void) | undefined, dead = false;
    void whenAuthReady(15000).then((b) => {
      if (!b || dead) return;
      setAuth({ b, signedIn: b.signedIn() });
      off = b.onChange((signedIn) => setAuth({ b, signedIn }));
    });
    return () => {
      dead = true;
      off?.();
    };
  }, []);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const links = [
    { href: "/signs", label: "This week", hint: "your sign's reading" },
    ...(has ? [{ href: "/deck", label: "My deck", hint: "your cards" }, { href: "/friends", label: "Friends", hint: "fight a friend" }] : []),
    ...(has && econ ? [{ href: "/shop", label: "Shop", hint: "packs & stardust" }] : []),
  ];
  const item = "flex items-baseline justify-between rounded-2xl px-4 py-3.5 transition active:bg-paper-2";

  return (
    <div ref={root} className="relative sm:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Menu"
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-2 transition active:scale-95"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          {open ? (
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          ) : (
            <path d="M2.5 5h11M2.5 11h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[64px] z-50 rounded-3xl border border-line bg-paper/95 p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={item} onClick={() => setOpen(false)}>
              <span className="font-display text-[17px] font-semibold text-ink">{l.label}</span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">{l.hint}</span>
            </a>
          ))}
          {auth &&
            (auth.signedIn ? (
              <div className="mt-1 flex items-center justify-between border-t border-line px-4 pb-1 pt-3">
                <a href="/account" className="font-display text-[15px] font-medium text-ink-2" onClick={() => setOpen(false)}>
                  Account
                </a>
                <button
                  type="button"
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3"
                  onClick={() => {
                    setOpen(false);
                    void auth.b.signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button type="button" className={`${item} w-full`} onClick={() => { setOpen(false); auth.b.openSignIn(); }}>
                <span className="font-display text-[17px] font-semibold text-ink">Sign in</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">keep your deck</span>
              </button>
            ))}
          <a
            href={newHref}
            onClick={(e) => {
              setOpen(false);
              if (onNew) {
                e.preventDefault();
                onNew();
              }
            }}
            className="mt-1 flex items-center justify-center rounded-full bg-accent px-4 py-3.5 font-display text-[16px] font-bold text-paper"
          >
            {has ? "New sign" : "Get your sign"}
          </a>
        </div>
      )}
    </div>
  );
}
