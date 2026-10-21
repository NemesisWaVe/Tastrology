"use client";

import { PageSky } from "@/components/site/PageSky";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteShell } from "@/components/site/SiteShell";
import { authOn, whenAuthReady, type Bridge } from "@/lib/authBridge";
import { StardustTable } from "@/components/shop/StardustTable";
import type { Economy } from "@/lib/economy";
import { BIO_MAX, GENDER_CHOICES } from "@/components/auth/UsernameGate";

interface Me {
  accounts: boolean;
  signedIn: boolean;
  admin?: boolean;
  creditsOn?: boolean;
  credits?: number | null;
  freeLeft?: number | null;
  refillAt?: number | null;
  burnOn?: boolean;
  economyOpen?: boolean;
  stardust?: {
    dust: number | null;
    weekLeft: number | null;
    rates: { common: number; rare: number; holo: number; secret: number; paidFlat: number; reading: number; weeklyCap: number };
    economy?: Economy;
  } | null;
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
      <PageSky />
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
        <div className="mt-8 max-w-xl rounded-[22px] border border-white/[0.07] bg-paper/70 p-6 backdrop-blur-sm">
          <p className="text-ink-2">Sign in to keep every card you mint, on any device. What an account holds:</p>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Your deck", "Every card you mint, on every device."],
              ["Friends", "A code to add rivals and fight them."],
              ["Stardust", "Earned by retiring cards, spent on packs."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="font-serif text-xl italic text-ink">{t}</p>
                <p className="mt-1 text-xs text-ink-3">{d}</p>
              </li>
            ))}
          </ul>
          <button onClick={() => bridge?.openSignIn()} disabled={!bridge} className="mt-6 rounded-full bg-accent px-6 py-2.5 font-semibold text-paper disabled:opacity-50">
            Sign in
          </button>
          <p className="mt-3 text-xs text-ink-3">Cards you made before signing in come with you.</p>
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
                {me.credits === 0 && me.refillAt && (
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
                    Next card at the new moon · {Math.max(1, Math.ceil((me.refillAt - Date.now()) / 86_400_000))} days
                  </p>
                )}
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
            {me?.economyOpen !== false && (
              <Link href="/shop" className="mt-6 block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 hover:text-ink">
                Shop →
              </Link>
            )}
          </section>

          {me?.stardust && me.economyOpen !== false && <StardustPanel s={me.stardust} />}
          {me && !me.stardust && me.burnOn && (
            <section className="rounded-3xl border border-line bg-card p-6 sm:col-span-2">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Burning</p>
              <p className="mt-3 max-w-xl text-ink-2">
                You can burn any card you minted from your deck. During the free beta a burn earns nothing: it clears the card and kills its share link, and that&apos;s all.
              </p>
            </section>
          )}

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

          <ProfileCard />

          <CloseAccount onDone={() => void bridge?.signOut().finally(() => (location.href = "/"))} />
        </div>
      )}
    </SiteShell>
  );
}

/** Stardust balance and the published rates (docs/design/burn.md §3; legal "Burn rewards"). */
function StardustPanel({ s }: { s: NonNullable<Me["stardust"]> }) {
  const r = s.rates;
  return (
    <section className="rounded-3xl border border-accent/25 bg-card p-6 sm:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Stardust</p>
          <p className="mt-3 font-display text-5xl font-semibold tracking-[-0.04em] text-accent">
            {s.dust ?? "–"}
            <span className="ml-2 align-middle text-base font-normal text-ink-3">dust</span>
          </p>
        </div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
          {s.weekLeft ?? "–"} of {r.weeklyCap} left to earn this week
        </p>
      </div>
      {s.economy && (
        <div className="mt-6">
          <StardustTable e={s.economy} weekLeft={s.weekLeft} />
        </div>
      )}
    </section>
  );
}

/** Closing the account: friends, requests and open fights are cleared first, then the account itself goes. */
function CloseAccount({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (j?.ok) return onDone();
    setErr(j?.error ?? "Couldn't reach the server.");
    setBusy(false);
  };
  return (
    <section className="rounded-3xl border border-line bg-card p-6 sm:col-span-2">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Close account</p>
      {!open ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-ink-2">Removes you from your friends&apos; lists, returns any Stardust riding on open fights, and frees your username.</p>
          <button onClick={() => setOpen(true)} className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink">
            Close account
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="max-w-xl text-sm text-ink-2">
            This can&apos;t be undone. Your deck, credits and Stardust go with it, and every card you minted is erased, so links you shared stop working.
          </p>
          <p className="mt-4 text-sm text-ink-2">
            Type <span className="font-mono text-ink">close</span> to confirm.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value.toLowerCase())}
              aria-label="Type close to confirm"
              autoCapitalize="none"
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 font-mono text-ink"
            />
            <button onClick={() => void go()} disabled={typed !== "close" || busy} className="rounded-full border border-bad/60 px-5 py-2 text-sm font-semibold text-bad disabled:opacity-40">
              {busy ? "Closing" : "Close for good"}
            </button>
            <button onClick={() => setOpen(false)} className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink">
              Keep it
            </button>
          </div>
          {err && <p className="mt-3 text-sm text-bad">{err}</p>}
        </div>
      )}
    </section>
  );
}

/** Who readings are for (private) and the bio friends see as a short line on your star. */
function ProfileCard() {
  const [p, setP] = useState<{ gender?: string; bio?: string; tag?: string } | null>(null);
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { me?: { gender?: string; bio?: string; tag?: string } }) => {
        if (!j.me) return;
        setP(j.me);
        setGender(j.me.gender ?? "");
        setBio(j.me.bio ?? "");
      })
      .catch(() => {});
  }, []);
  if (!p) return null;
  const save = async () => {
    setBusy(true);
    setNote(null);
    const j = (await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "profile", gender, bio }) })
      .then((r) => r.json())
      .catch(() => ({ error: "Couldn't reach the server." }))) as { ok?: boolean; error?: string; me?: { tag?: string } };
    setBusy(false);
    if (!j.ok) return setNote(j.error ?? "Couldn't save that.");
    setP({ ...p, gender, bio, tag: j.me?.tag });
    setNote(j.me?.tag ? `Friends now see: “${j.me.tag}”` : "Saved.");
  };
  return (
    <section className="rounded-3xl border border-line bg-card p-6 sm:col-span-2">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Profile</p>
      <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Readings are for</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {GENDER_CHOICES.map(([v, t]) => (
          <button
            key={v || "none"}
            type="button"
            aria-pressed={gender === v}
            onClick={() => setGender(v)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${gender === v ? "border-accent bg-accent text-paper" : "border-line bg-paper text-ink-2 hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-3">Private. It only keeps picks that don&apos;t fit you out of your readings.</p>
      <label htmlFor="acct-bio" className="mt-5 block font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
        Bio
      </label>
      <textarea
        id="acct-bio"
        rows={2}
        maxLength={BIO_MAX}
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        className="mt-2 w-full resize-none rounded-2xl border border-line bg-paper px-4 py-2.5 text-[15px] text-ink outline-none focus:border-accent/60"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-ink-2">{note ?? (p.tag ? `Friends see: “${p.tag}”` : "Friends see a short line made from it.")}</p>
        <button onClick={() => void save()} disabled={busy} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-paper disabled:opacity-40">
          {busy ? "Saving" : "Save"}
        </button>
      </div>
    </section>
  );
}
