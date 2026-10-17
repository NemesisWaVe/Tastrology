"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { authOn, whenAuthReady, type Bridge } from "@/lib/authBridge";

interface Me {
  accounts: boolean;
  signedIn: boolean;
  admin?: boolean;
  creditsOn?: boolean;
  credits?: number | null;
  freeLeft?: number | null;
}

/** Account skeleton: credits chip, deck link, sign out. Without accounts it just points at the device deck. */
export default function AccountPage() {
  const [bridge, setB] = useState<Bridge | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(authOn ? null : false);

  useEffect(() => {
    if (!authOn) return;
    let off = false;
    let unsub = () => {};
    void whenAuthReady().then((b) => {
      if (off) return;
      setB(b);
      setSignedIn(b?.signedIn() ?? false);
      if (b) unsub = b.onChange((on) => setSignedIn(on));
    });
    return () => {
      off = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let off = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<Me>)
      .then((j) => !off && setMe(j))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [signedIn]);

  return (
    <SiteShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Account</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-6xl">Your chart room</h1>
      {me?.admin && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Admin · no limits, no credits
        </p>
      )}

      {!authOn && (
        <p className="mt-4 max-w-xl text-ink-2">
          Accounts open soon. Until then your cards live on this device:{" "}
          <Link href="/deck" className="text-accent underline-offset-4 hover:underline">
            open your deck
          </Link>
          .
        </p>
      )}

      {authOn && signedIn === null && <p className="mt-4 text-ink-2">Checking the stars…</p>}

      {authOn && signedIn === false && (
        <div className="mt-6 max-w-md">
          <p className="text-ink-2">Sign in to keep every card you mint, on any device.</p>
          <button onClick={() => bridge?.openSignIn()} disabled={!bridge} className="mt-6 rounded-full bg-accent px-6 py-2.5 font-semibold text-paper disabled:opacity-50">
            Sign in
          </button>
        </div>
      )}

      {authOn && signedIn && (
        <div className="mt-10 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          <section className="rounded-3xl border border-line bg-card p-6">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Readings left</p>
            {me?.creditsOn ? (
              <>
                <p className="mt-3 font-display text-5xl font-semibold tracking-[-0.04em]">
                  {me.credits ?? "–"}
                  <span className="ml-2 align-middle text-base font-normal text-ink-3">credits</span>
                </p>
                {typeof me.freeLeft === "number" && me.freeLeft > 0 && (
                  <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {me.freeLeft} free
                  </span>
                )}
              </>
            ) : (
              <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em]">{me ? "Unlimited, for now" : "…"}</p>
            )}
            <Link href="/shop" className="mt-6 block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 hover:text-ink">
              Shop →
            </Link>
          </section>

          <section className="flex flex-col justify-between rounded-3xl border border-line bg-card p-6">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Your deck</p>
              <p className="mt-3 font-serif text-2xl italic leading-tight text-ink-2">Every sign you&apos;ve minted, in one place.</p>
            </div>
            <div className="mt-6 flex items-center justify-between gap-4">
              <Link href="/deck" className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-paper">
                Open deck
              </Link>
              <button onClick={() => void bridge?.signOut()} className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink">
                Sign out
              </button>
            </div>
          </section>
        </div>
      )}
    </SiteShell>
  );
}
