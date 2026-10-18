"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Stamps } from "@/lib/stamps";

const MARK = { won: "W", lost: "L", tied: "=" } as const;

/** The card as a passport: every challenge it has answered leaves a stamp. Quiet until there's something to show.
 *  `challenge` false where the page already leads with its own fight button. */
export function Passport({ code, challenge = true }: { code: string; challenge?: boolean }) {
  const [s, setS] = useState<Stamps | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/stamps?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { stamps: Stamps | null } | null) => !off && setS(j?.stamps ?? null))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [code]);

  const fights = s ? s.won + s.lost + s.tied : 0;
  return (
    <div className="mt-6 rounded-2xl border border-line/80 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink-3">Taste passport</p>
        {fights > 0 && (
          <p className="font-mono text-[11px] tabular-nums text-ink-2">
            <span className="text-accent">{s!.won}W</span> · {s!.lost}L{s!.tied ? ` · ${s!.tied}T` : ""}
          </p>
        )}
      </div>
      {fights === 0 ? (
        <p className="mt-2 text-sm text-ink-2">No stamps yet. Every challenge this card answers leaves one here.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {s!.recent.map((x) => (
            <li key={x.code}>
              <Link
                href={`/c/${x.code}`}
                title={`${x.outcome} against ${x.name}`}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition hover:text-ink ${x.outcome === "won" ? "border-accent/50 text-accent" : "border-line text-ink-2"}`}
              >
                <b className="font-mono">{MARK[x.outcome]}</b>
                <span className="max-w-[140px] truncate">{x.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {challenge && (
        <Link href={`/vs/${code}`} className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 underline decoration-dotted underline-offset-4 hover:text-accent">
          Challenge this card
        </Link>
      )}
    </div>
  );
}
