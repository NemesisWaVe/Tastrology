"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Alerts = { bouts: { id: string; who: string; stake: number }[]; requests: number };

const BEAT_MS = 25_000;

/**
 * Site-wide, while signed in and the tab is visible: one tiny ping every 25s keeps you "online" for friends and
 * watches your change counter. When it moves, it asks what needs you; a challenge then stays pinned on every page
 * until you open Friends.
 * No sockets, no push service: the same counter the friends page uses, so it costs one read per beat.
 */
export function LiveAlerts() {
  const path = usePathname();
  // Every open challenge to you; the bar stays on every page until you open Friends (or it's answered).
  const [waiting, setWaiting] = useState<Alerts["bouts"]>([]);
  const [hidden, setHidden] = useState<string | null>(null);
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
      seen.current = new Set(j.bouts.map((b) => b.id));
      setWaiting(j.bouts);
      const open = j.bouts.length + j.requests;
      document.title = document.title.replace(/^\(\d+\) /, "");
      if (open) document.title = `(${open}) ${document.title}`;
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

  // Dismissing hides it on this page only; the next page shows it again.
  useEffect(() => setHidden(null), [path]);
  // Opening Friends counts as seeing them: those challenges stop following you around (new ones still pop).
  const [acked, setAcked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem("tastrology:acked") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    if (!onFriends || !waiting.some((b) => !acked.has(b.id))) return;
    const next = new Set([...acked, ...waiting.map((b) => b.id)]);
    setAcked(next);
    try {
      sessionStorage.setItem("tastrology:acked", JSON.stringify([...next]));
    } catch {}
  }, [onFriends, waiting, acked]);
  const fresh = waiting.filter((b) => !acked.has(b.id));
  const top = fresh[0];
  if (!top || onFriends || hidden === path) return null;
  const text = `${top.who} challenged you${top.stake ? ` for ${top.stake} dust` : ""}${fresh.length > 1 ? ` · +${fresh.length - 1} more` : ""}`;
  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[300] flex justify-center px-4" role="status">
      <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-accent/40 bg-card/90 py-2 pl-5 pr-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent shadow-[0_0_10px_#c6ff3d]" />
        <p className="min-w-0 flex-1 truncate text-sm text-ink">{text}</p>
        <Link href="/friends" className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-paper">
          Fight
        </Link>
        <button type="button" aria-label="Dismiss" onClick={() => setHidden(path)} className="shrink-0 px-2 text-lg leading-none text-ink-3 hover:text-ink">
          ×
        </button>
      </div>
    </div>
  );
}
