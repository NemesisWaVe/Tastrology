import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSky } from "@/components/site/PageSky";
import { SiteShell } from "@/components/site/SiteShell";
import { BRAND } from "@/lib/brand";
import { proxied } from "@/lib/card";
import { SIGNS, signById, weekOf } from "@/lib/signs";
import { weeklyReading, type Pick } from "@/lib/weekly";

// Rebuilt at most every few hours (inside the cap on holding Qloo data); the week seeds the pick, so it holds all week.
export const revalidate = 21600;

export async function generateMetadata({ params }: { params: Promise<{ sign: string }> }): Promise<Metadata> {
  const s = signById((await params).sign);
  if (!s) return {};
  return { title: `${s.glyph} ${s.name} this week · ${BRAND.name}`, description: `${s.about} This week's brands, song and film for ${s.name}s, read by Qloo.` };
}

export default async function SignPage({ params }: { params: Promise<{ sign: string }> }) {
  const s = signById((await params).sign);
  if (!s) notFound();
  const w = await weeklyReading(s.id);
  return (
    <SiteShell>
      <PageSky />
      <Link href="/signs" className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3 hover:text-ink">
        ← All signs
      </Link>
      <div className="mt-6 flex items-center gap-4">
        <span
          aria-hidden
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-[34px]"
          style={{ background: `radial-gradient(circle at 30% 30%, ${s.a}55, ${s.b}22)`, color: s.a }}
        >
          {s.glyph}
        </span>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">{w ? `Week of ${weekOf(w.start)}` : "This week"}</p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{s.name}</h1>
        </div>
      </div>
      <p className="mt-4 max-w-xl text-ink-2">{s.about}</p>

      {w ? (
        <>
          <p className="mt-10 max-w-2xl font-serif text-3xl italic leading-tight sm:text-4xl">{w.line}</p>
          <section className="mt-10 max-w-2xl">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Wear</p>
            <ul className="mt-3 grid grid-cols-3 gap-3">
              {w.brands.map((b) => (
                <li key={b.id}>
                  <Tile p={b} accent={s.a} />
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {w.listen && (
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Listen</p>
                <div className="mt-3">
                  <Tile p={w.listen} accent={s.a} />
                </div>
              </div>
            )}
            {w.watch && (
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">Watch</p>
                <div className="mt-3">
                  <Tile p={w.watch} accent={s.a} />
                </div>
              </div>
            )}
          </section>
          <section className="mt-10 max-w-xl rounded-[22px] border border-white/[0.07] bg-paper/70 p-5 backdrop-blur-sm">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3">How Qloo read it</p>
            <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] text-ink-2">
              <li>
                Brands Qloo tags with the <span className="text-ink">{s.tag.replace(/_/g, "-")}</span> personal style.
              </li>
              <li>This week&apos;s three, picked by the week: everyone with your sign sees the same ones until Monday.</li>
              <li>The artist and film that people who love those three love too: Qloo&apos;s cross-domain taste graph, not a guess.</li>
            </ol>
          </section>
        </>
      ) : (
        <p className="mt-10 max-w-xl font-serif text-2xl italic text-ink-2">The sky is cloudy right now. This week&apos;s reading will be back shortly.</p>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <Link href="/" className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-semibold text-paper">
          Mint your card
        </Link>
        <span className="text-[14px] text-ink-3">Three favourites make your card, and your card names your sign.</span>
      </div>

      <nav aria-label="Other signs" className="mt-14 flex flex-wrap gap-2">
        {SIGNS.filter((x) => x.id !== s.id).map((x) => (
          <Link key={x.id} href={`/signs/${x.id}`} className="rounded-full border border-line px-3 py-1.5 text-[13px] text-ink-2 transition hover:border-ink-3 hover:text-ink">
            <span style={{ color: x.a }}>{x.glyph}</span> {x.name}
          </Link>
        ))}
      </nav>
    </SiteShell>
  );
}

function Tile({ p, accent }: { p: Pick; accent: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-[18px] border border-white/[0.07] bg-paper-2">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          // brand pictures are mostly logos: shown whole, on white; artists and films fill the frame
          <img src={proxied(p.image)} alt="" loading="lazy" className={p.kind === "brand" ? "h-full w-full bg-white object-contain p-3" : "h-full w-full object-cover"} />
        ) : (
          <span className="grid h-full w-full place-items-center font-display text-3xl font-bold" style={{ color: accent }}>
            {p.name.slice(0, 1)}
          </span>
        )}
      </div>
      <span className="text-[14px] font-medium leading-tight">{p.name}</span>
    </div>
  );
}
