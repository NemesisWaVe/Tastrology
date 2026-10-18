"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Alerts = { bouts: { id: string; who: string; stake: number }[]; requests: number };

const BEAT_MS = 25_000;

/**
 * Site-wide, while signed in and the tab is visible: one tiny ping every 25s keeps you "online" for friends and
 * watches your change counter. When it moves, it asks what needs you, and a new challenge pops up wherever you are.
 * No sockets, no push service: the same counter the friends page uses, so it costs one read per beat.
 */
export function LiveAlerts() {
  const path = usePathname();
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const last = useRef<number | null>(null);
  const onFriends = path?.startsWith("/friends");

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const j = (await fetch("/api/friends?alerts=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as Alerts | null;
      if (!j || stop) return;
      const first = seen.current === null;
      const known = seen.current ?? new Set<string>();
      const fresh = j.bouts.filter((b) => !known.has(b.id));
      seen.current = new Set(j.bouts.map((b) => b.id));
      const open = j.bouts.length + j.requests;
      document.title = document.title.replace(/^\(\d+\) /, "");
      if (open) document.title = `(${open}) ${document.title}`;
      // On first load only remind about one waiting challenge; after that, every new one pops.
      const pop = first ? j.bouts[0] : fresh[0];
      if (pop && !location.pathname.startsWith("/friends"))
        setToast({ id: pop.id, text: `${pop.who} challenged you${pop.stake ? ` for ${pop.stake} dust` : ""}` });
    };
    const beat = async () => {
      if (stop) return;
      if (!document.hidden) {
        const j = (await fetch("/api/friends?ping=1", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as { n?: number | null } | null;
        if (typeof j?.n === "number" && j.n !== last.current) {
          last.current = j.n;
          await check();
        }
      }
      t = setTimeout(() => void beat(), BEAT_MS);
    };
    const wake = () => {
      if (document.hidden) return;
      clearTimeout(t);
      void beat();
    };
    void beat();
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  if (!toast || onFriends) return null;
  return (
    <div className="fixed inset-x-0 top-4 z-[90] flex justify-center px-4" role="status">
      <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-accent/40 bg-card/90 py-2 pl-5 pr-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent shadow-[0_0_10px_#c6ff3d]" />
        <p className="min-w-0 flex-1 truncate text-sm text-ink">{toast.text}</p>
        <Link href="/friends" onClick={() => setToast(null)} className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper">
          Fight
        </Link>
        <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="shrink-0 px-2 text-lg leading-none text-ink-3 hover:text-ink">
          ×
        </button>
      </div>
    </div>
  );
}
