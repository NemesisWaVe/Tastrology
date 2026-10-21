"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

export const GENDER_CHOICES = [
  ["woman", "Woman"],
  ["man", "Man"],
  ["nonbinary", "Non-binary"],
  ["", "Rather not say"],
] as const;
export const BIO_MAX = 160;

type Me = { user?: string; gender?: string; bio?: string; terms?: boolean };

/**
 * Right after sign-in, a new account sets itself up before anything else: a username (how friends find you, never
 * the email), who your readings are for (keeps picks like lingerie away from people they don't fit), and an optional
 * bio that friends see as a short line on your star. Accounts that answered before skip it; older accounts with a
 * name see only the new questions.
 */
export function UsernameGate({ signedIn }: { signedIn: boolean }) {
  const clerk = useClerk();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return setMe(null);
    let off = false;
    // The full friends read also syncs a name picked earlier on /friends into Clerk.
    void fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { on?: boolean; signedIn?: boolean; me?: Me }) => {
        if (off || !j.on || !j.signedIn || !j.me) return;
        setMe(j.me);
        setBio(j.me.bio ?? "");
        if (j.me.user && !clerk.user?.username) void clerk.user?.reload();
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [signedIn, clerk]);

  const needName = Boolean(me && !me.user);
  const needProfile = Boolean(me && me.gender === undefined);
  // Consent is asked here, not in Clerk's sign-up (its own consent step left some Android Google sign-ups stuck).
  const needTerms = Boolean(me && !me.terms);
  if (!me || (!needName && !needProfile && !needTerms)) return null;

  const post = (body: object) =>
    fetch("/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .catch(() => ({ error: "Couldn't reach the server." })) as Promise<{
      ok?: boolean;
      error?: string;
    }>;

  const save = async () => {
    setBusy(true);
    setErr(null);
    if (needName) {
      const j = await post({ op: "username", user: name });
      if (!j.ok) {
        setBusy(false);
        return setErr(j.error ?? "Couldn't save that.");
      }
      void clerk.user?.reload();
    }
    const j = await post({
      op: "profile",
      ...(needProfile ? { gender: gender ?? "" } : {}),
      ...(needName || needProfile ? { bio } : {}),
      ...(needTerms ? { terms: true } : {}),
    });
    setBusy(false);
    if (!j.ok) {
      // The name is saved either way; keep the sheet for the rest.
      if (needName) setMe({ ...me, user: name });
      return setErr(j.error ?? "Couldn't save that.");
    }
    window.dispatchEvent(new Event("tastrology:username"));
    setMe({
      ...me,
      user: me.user ?? name,
      gender: gender ?? me.gender ?? "",
      bio,
      terms: true,
    });
  };

  const ready =
    (!needName || name.length >= 3) &&
    (!needProfile || gender !== null) &&
    (!needTerms || agree) &&
    !busy;
  const label = "font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your profile"
    >
      <div className="absolute inset-0 bg-paper/85 backdrop-blur-sm" />
      <div className="relative my-auto w-full max-w-[420px] overflow-hidden rounded-[24px] border border-line bg-card px-7 py-8 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-accent">
          {needName
            ? "One last thing"
            : needProfile
              ? "New here"
              : "One quick thing"}
        </p>
        <h2 className="mt-1 font-serif text-[28px] italic leading-[1.1] text-ink">
          {needName
            ? "Make it yours."
            : needProfile
              ? "Tell your stars a little more."
              : "The small print, once."}
        </h2>
        <p className="mt-3 text-sm text-ink-2">
          {needName || needProfile
            ? "Friends see your username and bio. Your email never shows."
            : "We now ask for this here instead of at sign-up. Nothing about your account changes."}
        </p>
        <form
          className="mt-6 flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void save();
          }}
        >
          {needName && (
            <div>
              <label className={label} htmlFor="tm-username">
                Username
              </label>
              <span className="mt-2 flex items-center rounded-full border border-line bg-paper px-4 focus-within:border-accent/60">
                <span className="text-ink-3">@</span>
                <input
                  id="tm-username"
                  autoFocus
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "")
                        .slice(0, 20),
                    )
                  }
                  placeholder="yourname"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  className="min-w-0 flex-1 bg-transparent py-2.5 pl-1 text-[15px] text-ink outline-none placeholder:text-ink-3"
                />
              </span>
              <p className="mt-2 text-xs text-ink-3">
                3 to 20 letters, numbers or _. You can change it once for free.
              </p>
            </div>
          )}
          {needProfile && (
            <fieldset>
              <legend className={label}>Readings are for</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {GENDER_CHOICES.map(([v, t]) => (
                  <button
                    key={v || "none"}
                    type="button"
                    aria-pressed={gender === v}
                    onClick={() => setGender(v)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${gender === v ? "border-accent bg-accent text-paper" : "border-line bg-paper text-ink-2 hover:border-ink-3 hover:text-ink"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                Only steers which brands we pick for you. Nobody else sees it.
              </p>
            </fieldset>
          )}
          {(needName || needProfile) && (
            <div>
              <label className={label} htmlFor="tm-bio">
                Bio{" "}
                <span className="normal-case tracking-normal text-ink-3">
                  (optional)
                </span>
              </label>
              <textarea
                id="tm-bio"
                rows={2}
                maxLength={BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="My life, my rules."
                className="mt-2 w-full resize-none rounded-2xl border border-line bg-paper px-4 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
              />
              <p className="mt-1 flex justify-between text-xs text-ink-3">
                <span>
                  Friends see a short line made from it when they hold your
                  star.
                </span>
                <span className="shrink-0 pl-2 font-mono">
                  {BIO_MAX - bio.length}
                </span>
              </p>
            </div>
          )}
          {needTerms && (
            <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#c6ff3d]"
              />
              <span>
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-accent underline underline-offset-2"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-accent underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          )}
          {err && <p className="text-sm text-bad">{err}</p>}
          <button
            type="submit"
            disabled={!ready}
            className="w-full rounded-full bg-accent py-2.5 text-[15px] font-semibold text-paper transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "Saving" : "Continue"}
          </button>
        </form>
        {needName && (
          <button
            type="button"
            onClick={() => void clerk.signOut({ redirectUrl: "/" })}
            className="mx-auto mt-5 block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink"
          >
            Sign out
          </button>
        )}
        {!needName && needProfile && (
          <p className="mt-5 text-center text-xs text-ink-3">
            You can change these any time on your Account page.
          </p>
        )}
      </div>
    </div>
  );
}
