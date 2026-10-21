"use client";

import { useClerk } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export const GENDER_CHOICES = [
  ["woman", "Woman"],
  ["man", "Man"],
  ["nonbinary", "Non-binary"],
  ["", "Rather not say"],
] as const;
export const BIO_MAX = 160;

type Me = { user?: string; gender?: string; bio?: string; terms?: boolean };
type Step = "name" | "for" | "bio" | "terms";
type Check = {
  name: string;
  status: "checking" | "ok" | "bad" | "taken" | "error";
};

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
const label = "font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3";

/**
 * Right after sign-in, a new account sets itself up: one question per screen so nothing lands at once.
 *   name   a username, suggested from the account and checked as you type (how friends find you, never the email)
 *   for    who readings are for: one tap, and it moves on (keeps picks like lingerie away from people they don't fit)
 *   bio    one optional line friends see on your star; skippable
 * Agreeing to the Terms rides on the first Continue ("by continuing…"); an account that only lacks that sees one
 * short screen. Accounts that answered before skip the lot. Steps are fixed when the sheet opens, so answering one
 * never reshuffles the rest.
 */
export function UsernameGate({ signedIn }: { signedIn: boolean }) {
  const clerk = useClerk();
  const reduce = useReducedMotion() ?? false;
  const [me, setMe] = useState<Me | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [at, setAt] = useState(0);
  const [needTerms, setNeedTerms] = useState(false);
  const [name, setName] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setMe(null);
      setSteps([]);
      return;
    }
    let off = false;
    // The full friends read also syncs a name picked earlier on /friends into Clerk.
    void fetch("/api/friends", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { on?: boolean; signedIn?: boolean; me?: Me }) => {
        if (off || !j.on || !j.signedIn || !j.me) return;
        const m = j.me;
        setMe(m);
        setBio(m.bio ?? "");
        const s: Step[] = [];
        if (!m.user) s.push("name");
        if (m.gender === undefined) s.push("for", "bio");
        if (!m.terms && !s.length) s.push("terms");
        setSteps(s);
        setAt(0);
        setNeedTerms(!m.terms);
        if (m.user && !clerk.user?.username) void clerk.user?.reload();
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [signedIn, clerk]);

  // A first suggestion from the account (Clerk username, then name, then the email's first part), already checked.
  const suggested = useRef(false);
  useEffect(() => {
    if (suggested.current || steps[0] !== "name" || !clerk.user) return;
    suggested.current = true;
    const u = clerk.user;
    const base = clean(
      u.username ||
        [u.firstName, u.lastName].filter(Boolean).join("") ||
        (u.primaryEmailAddress?.emailAddress ?? "").split("@")[0],
    );
    if (base.length >= 3) setName(base);
  }, [steps, clerk.user]);

  // Live availability: debounced, and only the latest answer counts.
  useEffect(() => {
    if (steps[at] !== "name") return;
    if (name.length < 3) return setCheck(null);
    setCheck({ name, status: "checking" });
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void fetch(`/api/friends?name=${encodeURIComponent(name)}`, {
        cache: "no-store",
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { status?: Check["status"] } | null) =>
          setCheck({ name, status: j?.status ?? "error" }),
        )
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [name, steps, at]);

  if (!me || at >= steps.length) return null;
  const step = steps[at];

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

  const next = () => {
    setErr(null);
    if (at + 1 < steps.length) return setAt(at + 1);
    window.dispatchEvent(new Event("tastrology:username"));
    setMe({
      ...me,
      user: me.user ?? name,
      gender: gender ?? me.gender ?? "",
      bio,
      terms: true,
    });
    setAt(steps.length);
  };
  /** The first Continue also records agreeing to the Terms (the line under it says so). */
  const agreeOnce = async () => {
    if (!needTerms) return true;
    const j = await post({ op: "profile", terms: true });
    if (j.ok) setNeedTerms(false);
    return Boolean(j.ok);
  };
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setErr(null);
    const e = await fn();
    setBusy(false);
    if (e) setErr(e);
    else next();
  };

  const saveName = () =>
    run(async () => {
      const j = await post({ op: "username", user: name });
      if (!j.ok) return j.error ?? "Couldn't save that.";
      void clerk.user?.reload();
      return (await agreeOnce())
        ? null
        : "Saved your name, but couldn't reach the server. Try again.";
    });
  const saveFor = (g: string) => {
    setGender(g);
    void run(async () => {
      const j = await post({
        op: "profile",
        gender: g,
        ...(needTerms ? { terms: true } : {}),
      });
      if (j.ok) setNeedTerms(false);
      return j.ok ? null : (j.error ?? "Couldn't save that.");
    });
  };
  const saveBio = (skip: boolean) =>
    run(async () => {
      if (skip || bio === (me.bio ?? "")) return null;
      const j = await post({ op: "profile", bio });
      return j.ok ? null : (j.error ?? "Couldn't save that.");
    });
  const agree = () =>
    run(async () =>
      (await agreeOnce()) ? null : "Couldn't reach the server.",
    );

  const nameOk = check?.name === name && check.status === "ok";
  const nameNote =
    name.length < 3
      ? "3 to 20 letters, numbers or _."
      : !check || check.name !== name || check.status === "checking"
        ? "Checking…"
        : check.status === "ok"
          ? `@${name} is free.`
          : check.status === "taken"
            ? "Taken. Try another, or add a number."
            : check.status === "bad"
              ? "Letters, numbers and _ only, and nothing rude."
              : "Couldn't check right now. You can still try.";
  const terms = needTerms ? (
    <p className="mt-3 text-center text-xs text-ink-3">
      By continuing you agree to the{" "}
      <Link
        href="/terms"
        target="_blank"
        className="text-ink-2 underline underline-offset-2"
      >
        Terms
      </Link>{" "}
      and{" "}
      <Link
        href="/privacy"
        target="_blank"
        className="text-ink-2 underline underline-offset-2"
      >
        Privacy Policy
      </Link>
      .
    </p>
  ) : null;
  const primary =
    "w-full rounded-full bg-accent py-3 text-[15px] font-semibold text-paper transition hover:brightness-105 disabled:opacity-40";
  const counting = steps.filter((s) => s !== "terms");

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Set up your profile"
    >
      <div className="absolute inset-0 bg-paper/85 backdrop-blur-sm" />
      <div className="relative my-auto w-full max-w-[400px] overflow-hidden rounded-[24px] border border-line bg-card px-7 pb-7 pt-6 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]">
        {counting.length > 1 && (
          <div
            className="mb-5 flex gap-1.5"
            aria-label={`Step ${Math.min(at + 1, counting.length)} of ${counting.length}`}
          >
            {counting.map((s, i) => (
              <span
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= at ? "bg-accent" : "bg-white/[0.08]"}`}
              />
            ))}
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {step === "name" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    name.length >= 3 &&
                    !busy &&
                    check?.status !== "taken" &&
                    check?.status !== "bad"
                  )
                    void saveName();
                }}
              >
                <p className={`${label} text-accent`}>You&apos;re in</p>
                <h2 className="mt-1 font-serif text-[30px] italic leading-[1.05] text-ink">
                  Pick your @.
                </h2>
                <p className="mt-2 text-sm text-ink-2">
                  It&apos;s how friends find you. Your email never shows.
                </p>
                <span
                  className={`mt-5 flex items-center rounded-full border bg-paper px-4 transition ${check?.name === name && (check.status === "taken" || check.status === "bad") ? "border-bad/60" : nameOk ? "border-accent/60" : "border-line"}`}
                >
                  <span className="text-ink-3">@</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(clean(e.target.value))}
                    placeholder="yourname"
                    aria-label="Username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    className="min-w-0 flex-1 bg-transparent py-3 pl-1 text-[16px] text-ink outline-none placeholder:text-ink-3"
                  />
                  {nameOk && <span className="text-accent">✓</span>}
                </span>
                <p
                  className={`mt-2 min-h-[1rem] text-xs ${check?.name === name && (check.status === "taken" || check.status === "bad") ? "text-bad" : nameOk ? "text-accent" : "text-ink-3"}`}
                  aria-live="polite"
                >
                  {nameNote}
                </p>
                {err && <p className="mt-2 text-sm text-bad">{err}</p>}
                <button
                  type="submit"
                  disabled={
                    name.length < 3 ||
                    busy ||
                    check?.status === "taken" ||
                    check?.status === "bad"
                  }
                  className={`${primary} mt-5`}
                >
                  {busy ? "Saving…" : "Continue"}
                </button>
                {terms}
                <button
                  type="button"
                  onClick={() => void clerk.signOut({ redirectUrl: "/" })}
                  className="mx-auto mt-4 block font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 transition hover:text-ink"
                >
                  Not me · sign out
                </button>
              </form>
            )}

            {step === "for" && (
              <div>
                <p className={`${label} text-accent`}>One tap</p>
                <h2 className="mt-1 font-serif text-[30px] italic leading-[1.05] text-ink">
                  Who are your readings for?
                </h2>
                <p className="mt-2 text-sm text-ink-2">
                  It only steers which brands we pick. Nobody else sees it.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {GENDER_CHOICES.map(([v, t]) => (
                    <button
                      key={v || "none"}
                      type="button"
                      disabled={busy}
                      aria-pressed={gender === v}
                      onClick={() => saveFor(v)}
                      className={`rounded-2xl border px-4 py-3.5 text-[15px] transition ${gender === v ? "border-accent bg-accent text-paper" : "border-line bg-paper text-ink-2 hover:border-ink-3 hover:text-ink"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {err && <p className="mt-3 text-sm text-bad">{err}</p>}
                {!steps.includes("name") && terms}
              </div>
            )}

            {step === "bio" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) void saveBio(false);
                }}
              >
                <p className={`${label} text-accent`}>Optional</p>
                <h2 className="mt-1 font-serif text-[30px] italic leading-[1.05] text-ink">
                  One line about you?
                </h2>
                <p className="mt-2 text-sm text-ink-2">
                  Friends see a short line made from it when they hold your
                  star.
                </p>
                <textarea
                  rows={2}
                  maxLength={BIO_MAX}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="My life, my rules."
                  aria-label="Bio"
                  className="mt-5 w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
                />
                <p className="mt-1 text-right font-mono text-xs text-ink-3">
                  {BIO_MAX - bio.length}
                </p>
                {err && <p className="mt-2 text-sm text-bad">{err}</p>}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveBio(true)}
                    className="flex-1 rounded-full border border-line py-3 text-[15px] text-ink-2 transition hover:border-ink-3 hover:text-ink disabled:opacity-40"
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !bio.trim()}
                    className="flex-[1.4] rounded-full bg-accent py-3 text-[15px] font-semibold text-paper transition hover:brightness-105 disabled:opacity-40"
                  >
                    {busy ? "Saving…" : "Done"}
                  </button>
                </div>
                <p className="mt-4 text-center text-xs text-ink-3">
                  You can change all of this on your Account page.
                </p>
              </form>
            )}

            {step === "terms" && (
              <div>
                <p className={`${label} text-accent`}>One quick thing</p>
                <h2 className="mt-1 font-serif text-[30px] italic leading-[1.05] text-ink">
                  The small print, once.
                </h2>
                <p className="mt-2 text-sm text-ink-2">
                  We now ask for this here instead of at sign-up. Read the{" "}
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
                </p>
                {err && <p className="mt-3 text-sm text-bad">{err}</p>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void agree()}
                  className={`${primary} mt-6`}
                >
                  {busy ? "Saving…" : "I agree"}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
