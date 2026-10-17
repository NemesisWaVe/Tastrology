import { SiteShell } from "./SiteShell";

/** Placeholder for a legal page whose text hasn't landed yet. Deliberately says nothing legal. */
export function DraftPage({ title }: { title: string }) {
  return (
    <SiteShell>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Legal</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-6xl">{title}</h1>
      <p className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-line px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" />
        Draft — coming soon
      </p>
    </SiteShell>
  );
}
