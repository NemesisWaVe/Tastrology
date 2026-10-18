import type { Economy } from "@/lib/economy";

const LABEL = { common: "Common", rare: "Rare", holo: "Holo Rare", secret: "Secret Rare" } as const;

/** What each card retires for and what Stardust buys. Same numbers the burn route pays (lib/economy.ts). */
export function StardustTable({ e, dust, weekLeft }: { e: Economy; dust?: number | null; weekLeft?: number | null }) {
  const spend = [
    e.recast !== null && { k: "Recast", v: e.recast, note: "your card, read into a new territory of brands" },
    e.pack !== null && { k: "Battle Pack", v: e.pack, note: "From this price; one stranger's card, one pack a day" },
    e.living !== null && { k: "Living sigils", v: e.living, note: "your card's sigils breathe and turn" },
    e.reading !== null && { k: "Extra reading", v: e.reading, note: "a new card now" },
  ].filter(
    (x): x is { k: string; v: number; note: string } => Boolean(x),
  );
  const max = Math.max(...e.retire.map((r) => r.dust));
  return (
    <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Retire a card, get</p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {e.retire.map((r) => (
            <li key={r.tier} className="flex items-center gap-4 py-2.5">
              <span className="w-28 shrink-0 font-display text-[15px] font-semibold">{LABEL[r.tier]}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.dust / max) * 100}%` }} />
              </span>
              <span className="w-12 text-right font-mono text-sm tabular-nums text-accent">{r.dust}</span>
            </li>
          ))}
          {e.regretDust !== null && (
            <li className="flex items-center gap-4 py-2.5 text-ink-2">
              <span className="flex-1 text-[14px]">Last regret</span>
              <span className="w-12 text-right font-mono text-sm tabular-nums">{e.regretDust}</span>
            </li>
          )}
          <li className="flex items-center gap-4 py-2.5">
            <span className="flex-1 text-[14px] text-ink-2">
              Keep it instead: every month a Holo pays <span className="text-accent">{e.dividend.holo}</span>, a Secret{" "}
              <span className="text-accent">{e.dividend.secret}</span>
            </span>
            <span className="w-12 text-right font-mono text-sm tabular-nums text-ink-3">/mo</span>
          </li>
          <li className="flex items-center gap-4 py-2.5 text-ink-3">
            <span className="flex-1 text-[14px]">Second draw, or a card bought with Stardust</span>
            <span className="w-12 text-right font-mono text-sm tabular-nums">0</span>
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-ink-3">
          Only cards you minted with your own monthly card pay. A code pays once, ever. Up to {e.weeklyCap} a week
          {weekLeft != null ? `, ${weekLeft} left this week` : ""}.
        </p>
      </div>
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Spend it on</p>
        {spend.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {spend.map((s) => (
              <li key={s.k} className="py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-display text-[15px] font-semibold">{s.k}</span>
                  <span className="font-mono text-sm tabular-nums text-accent">{s.v}</span>
                </div>
                <p className="text-[13px] text-ink-3">{s.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-3">Nothing yet. Keep it for when packs open.</p>
        )}
        {dust != null && (
          <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
            You have <span className="text-accent">{dust}</span>
          </p>
        )}
        <p className="mt-4 text-[12.5px] text-ink-3">
          {e.sale
            ? "Stardust can be earned or bought in bundles. It has no cash value: it can't be sold, transferred, cashed out or refunded once spent. Rate changes get 14 days' notice and never reduce dust you already have."
            : "Stardust has no cash value. It can't be bought, sold, transferred or refunded. Rate changes get 14 days' notice and never reduce dust you already have."}
        </p>
      </div>
    </div>
  );
}
