"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

/**
 * Right after sign-in, an account without a username picks one before anything else: it's how friends find you and
 * what they see (never the email). Saved through /api/friends, which writes Clerk and our lookup copy together.
 * Accounts that already have a name (in Clerk, or picked earlier on /friends) never see this.
 */
export function UsernameGate({ signedIn }: { signedIn: boolean }) {
  const clerk = useClerk();
  const [need, setNeed] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || clerk.user?.username) return setNeed(false);
    let off = false;
    // The full friends read also syncs a name picked earlier on /friends into Clerk.
    void fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { on?: boolean; signedIn?: boolean; me?: { user?: string } }) => {
        if (off) return;
        if (j.on && j.signedIn && !j.me?.user) setNeed(true);
        else if (j.me?.user) void clerk.user?.reload();
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [signedIn, clerk]);

  if (!need) return null;

  const save = async () => {
    setBusy(true);
    setErr(null);
    const j = (await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "username", user: name }) })
      .then((r) => r.json())
      .catch(() => ({ error: "Couldn't reach the server." }))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!j.ok) return setErr(j.error ?? "Couldn't save that.");
    void clerk.user?.reload();
    window.dispatchEvent(new Event("tastrology:username"));
    setNeed(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Pick your username">
      <div className="absolute inset-0 bg-paper/85 backdrop-blur-sm" />
      <div className="relative w-full max-w-[400px] overflow-hidden rounded-[24px] border border-line bg-card px-7 py-8 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-accent">One last thing</p>
        <h2 className="mt-1 font-serif text-[28px] italic leading-[1.1] text-ink">Pick your username.</h2>
        <p className="mt-3 text-sm text-ink-2">It&apos;s how friends find you and the name they see. Your email never shows.</p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3" htmlFor="tm-username">
            Username
          </label>
          <span className="mt-2 flex items-center rounded-full border border-line bg-paper px-4 focus-within:border-accent/60">
            <span className="text-ink-3">@</span>
            <input
              id="tm-username"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              className="min-w-0 flex-1 bg-transparent py-2.5 pl-1 text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
          </span>
          <p className="mt-2 text-xs text-ink-3">3 to 20 letters, numbers or _. You can change it once for free.</p>
          {err && <p className="mt-3 text-sm text-bad">{err}</p>}
          <button type="submit" disabled={name.length < 3 || busy} className="mt-6 w-full rounded-full bg-accent py-2.5 text-[15px] font-semibold text-paper transition hover:brightness-105 disabled:opacity-40">
            {busy ? "Saving" : "Continue"}
          </button>
        </form>
        <button type="button" onClick={() => void clerk.signOut({ redirectUrl: "/" })} className="mx-auto mt-5 block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink">
          Sign out
        </button>
      </div>
    </div>
  );
}
