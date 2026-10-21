import type { Metadata } from "next";
import Link from "next/link";
import { PageSky } from "@/components/site/PageSky";
import { SiteShell } from "@/components/site/SiteShell";
import { BRAND } from "@/lib/brand";
import { SIGNS, isoWeek, weekOf } from "@/lib/signs";

export const metadata: Metadata = {
  title: `This week's readings · ${BRAND.name}`,
  description: "Twelve signs, a new reading every Monday: three brands, a song and a film for your sign, read by Qloo.",
};
export const revalidate = 3600;

export default function SignsPage() {
  const { start } = isoWeek();
  return (
    <SiteShell>
      <PageSky />
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Week of {weekOf(start)}</p>
      <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-7xl">
        This week, <span className="text-accent">by sign.</span>
      </h1>
      <p className="mt-5 max-w-xl text-ink-2">
        Your sign is your Sun: the style your card reads first. Every Monday each sign gets three brands, a song and a film, read by Qloo from what
        people with that taste actually love.
      </p>
      <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SIGNS.map((s) => (
          <li key={s.id}>
            <Link
              href={`/signs/${s.id}`}
              className="flex h-full flex-col gap-2 rounded-[22px] border border-white/[0.07] bg-paper/70 p-4 backdrop-blur-sm transition hover:border-white/20 sm:p-5"
            >
              <span aria-hidden className="text-[28px] leading-none" style={{ color: s.a }}>
                {s.glyph}
              </span>
              <span className="font-display text-[19px] font-semibold tracking-tight">{s.name}</span>
              <span className="text-[13px] leading-snug text-ink-3">{s.about}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-[14px] text-ink-3">
        Don&apos;t know your sign?{" "}
        <Link href="/" className="text-ink underline decoration-white/30 underline-offset-4 hover:decoration-white">
          Make your card
        </Link>
        : three favourites, about thirty seconds.
      </p>
    </SiteShell>
  );
}
