"use client";

import { useState } from "react";
import type { CardData, CardType } from "@/lib/card";
import type { StyleResult } from "@/lib/types";
import { Sigil, type SigilKind } from "@/components/card/Sigils";
import { glyph } from "@/components/card/HoloCard";
import { cleanStyle } from "./ui";

export interface SignReceipt {
  kind: SigilKind;
  label: string;
  role: string;
  t: CardType;
  receipt: string;
  source: string;
  alert?: boolean;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Each sign's receipt, written only from what Qloo returned in this run. */
export function signReceipts(result: StyleResult, card: CardData): SignReceipt[] {
  const { sun, moon, rising, moonIsContradiction } = card.bigThree;
  const name = (id: string) => result.seeds.find((s) => s.id === id)?.name ?? "";
  const kw = result.dna.keywords;
  const lobeA = result.dna.lobes[0];
  const lobeB = result.dna.lobes[1];
  const sunTag = kw.find((k) => k.name === sun.name);
  const sunFrom = moonIsContradiction && lobeA ? lobeA.seedIds.map(name) : result.seeds.map((s) => s.name);

  const moonTag = (lobeB?.keywords ?? kw).find((k) => k.name === moon.name);
  const sideB = result.brands.filter((b) => b.side);
  const overlap = result.contradictions[0]?.overlap ?? 0;

  const main = result.brands.filter((b) => !b.side).slice(0, 6);
  const carriers = main.filter((b) => cleanStyle(b.entity.style).includes(rising.name)).map((b) => b.entity.name);

  return [
    {
      kind: "sun",
      label: "Sun",
      role: "core aesthetic",
      t: sun,
      receipt: `The strongest aesthetic tag Qloo found across ${list(sunFrom.slice(0, 4))}${sunFrom.length > 4 ? " and more" : ""}.`,
      source: sunTag?.id ?? "qloo aesthetic tag",
    },
    moonIsContradiction && lobeB
      ? {
          kind: "moon",
          label: "Moon",
          role: "your contradiction",
          t: moon,
          receipt: `${list(lobeB.seedIds.map(name))} pulls the other way (${overlap < 0.01 ? "almost no" : `only ${Math.round(overlap * 100)}%`} Qloo tag overlap with the rest), so the agent split it into its own side instead of averaging you into mush.${sideB.length ? ` ${sideB.length} brands answer to it.` : ""}`,
          source: moonTag?.id ?? "qloo aesthetic tag · side B",
          alert: true,
        }
      : {
          kind: "moon",
          label: "Moon",
          role: "hidden side",
          t: moon,
          receipt: "Your second-strongest Qloo tag: quieter than your Sun, but it shows up across your loves.",
          source: moonTag?.id ?? "qloo aesthetic tag",
        },
    {
      kind: "rising",
      label: "Rising",
      role: "how you come across",
      t: rising,
      receipt: carriers.length
        ? `${carriers.length} of your top ${main.length} brands carry it in Qloo's brand style data: ${list(carriers.slice(0, 3))}.`
        : "The next Qloo tag in your DNA, which is how the brands you'd wear read from the outside.",
      source: carriers.length ? "qloo brand · personal_style" : "qloo aesthetic tag",
    },
  ];
}

export function BigThree({ result, card }: { result: StyleResult; card: CardData }) {
  const rows = signReceipts(result, card);
  return (
    <ol className="divide-y divide-line/80 overflow-hidden rounded-2xl border border-line bg-card/70 backdrop-blur">
      {rows.map((r) => (
        <li key={r.kind} className="grid grid-cols-[44px_1fr] gap-x-4 px-4 py-4 sm:px-5">
          <span
            className="row-span-2 grid h-11 w-11 place-items-center rounded-full"
            style={{
              color: `color-mix(in oklab, ${r.t.a} 75%, white)`,
              background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${r.t.a} 35%, transparent), transparent 70%), #0b0b10`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${r.t.a} 55%, transparent), 0 0 24px -6px ${r.t.a}`,
            }}
          >
            <Sigil kind={r.kind} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">
              <span className="text-ink-2">{r.label}</span>
              <span>·</span>
              <span className={r.alert ? "text-warn" : ""}>{r.role}</span>
            </p>
            <p className="mt-1 flex items-baseline gap-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.01em]">
              {r.t.name}
              <span className="text-[15px] font-normal" style={{ color: r.t.a }}>
                {glyph(r.t.glyph)}
              </span>
            </p>
          </div>
          <div className="col-start-2 min-w-0">
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{r.receipt}</p>
            <Source text={r.source} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Raw Qloo ids (urn:tag:…) are proof, not reading material: tucked behind a small toggle. */
function Source({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <p className="mt-1.5 flex min-w-0 items-baseline gap-2 font-mono text-[10px] text-ink-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="shrink-0 rounded-full border border-line px-2 py-0.5 uppercase tracking-[0.16em] transition hover:border-ink-3 hover:text-ink-2"
      >
        {open ? "hide source" : "source"}
      </button>
      {open && <span className="min-w-0 break-all">{text}</span>}
    </p>
  );
}
