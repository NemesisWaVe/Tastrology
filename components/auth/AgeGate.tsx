"use client";

import { useEffect, useState } from "react";

/**
 * A neutral age screen before the account form: accounts are for 13 and up (terms §2). It asks for a birth year
 * without saying the cut-off, and an under-13 answer is remembered on the device so it can't just be retried.
 */
const KEY = "tastrology:age";
export const MIN_AGE = 13;

function read(): "ok" | "no" | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ok") return "ok";
    if (v && v.startsWith("no:") && Date.now() - Number(v.slice(3)) < 86_400_000) return "no";
  } catch {}
  return null;
}

export function useAgeOk(): ["ok" | "no" | null | undefined, (v: "ok" | "no") => void] {
  const [s, set] = useState<"ok" | "no" | null | undefined>(undefined);
  useEffect(() => set(read()), []);
  return [
    s,
    (v) => {
      try {
        localStorage.setItem(KEY, v === "ok" ? "ok" : `no:${Date.now()}`);
      } catch {}
      set(v);
    },
  ];
}

export function AgeGate({ onAnswer }: { onAnswer: (v: "ok" | "no") => void }) {
  const [year, setYear] = useState("");
  const now = new Date().getUTCFullYear();
  const y = Number(year);
  const valid = year.length === 4 && y > now - 120 && y <= now;
  return (
    <form
      className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-line bg-card p-6 text-center"
      onSubmit={(e) => {
        e.preventDefault();
        // Born this year minus 13 might not have had the birthday yet: count them as 12 to be safe.
        if (valid) onAnswer(now - y - 1 >= MIN_AGE ? "ok" : "no");
      }}
    >
      <label htmlFor="birth-year" className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
        What year were you born?
      </label>
      <input
        id="birth-year"
        inputMode="numeric"
        autoComplete="bday-year"
        maxLength={4}
        value={year}
        onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
        placeholder="YYYY"
        className="w-40 rounded-full border border-line bg-paper px-5 py-3 text-center font-mono text-lg tracking-[0.3em] text-ink outline-none focus:border-accent"
      />
      <button type="submit" disabled={!valid} className="min-h-11 rounded-full bg-accent px-6 font-display text-[15px] font-semibold text-paper disabled:opacity-40">
        Continue
      </button>
    </form>
  );
}

export function AgeBlocked() {
  return (
    <p className="max-w-sm text-center text-ink-2">
      Accounts aren&apos;t available for you yet. You can still try the sample personas on the home page, no account needed.
    </p>
  );
}
