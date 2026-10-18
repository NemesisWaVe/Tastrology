import { SiteShell } from "./SiteShell";

/** Shared bits for /terms, /privacy and /cookies. Plain words, one column, readable on a phone. */
export const LEGAL = {
  operator: "Tastrology, a student project run by an individual developer",
  email: "nemesiswave440@gmail.com",
  place: "Dehradun, Uttarakhand 248001, India",
  updated: "18 October 2026",
};

export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <SiteShell>
      <article className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-3">Legal · updated {LEGAL.updated}</p>
        <h1 className="mt-2 font-serif text-5xl italic leading-[0.95] sm:text-6xl">{title}</h1>
        <div className="mt-6 rounded-2xl border border-line bg-white/[0.02] p-5 text-[15px] leading-relaxed text-ink-2">{intro}</div>
        <div className="mt-10 space-y-10">{children}</div>
      </article>
    </SiteShell>
  );
}

export function Sec({ id, n, title, children }: { id?: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-xl font-bold tracking-tight">
        <span className="mr-2 font-mono text-sm text-accent">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2 [&_a]:text-ink [&_a]:underline [&_a]:decoration-accent/60 [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export function Rows({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-line py-2 pr-4 font-mono text-[10.5px] font-normal uppercase tracking-[0.16em] text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={`border-b border-line/50 py-2.5 pr-4 ${j === 0 ? "font-mono text-[12.5px] text-ink" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Contact() {
  return (
    <>
      <p>
        Questions, data requests, takedown requests or complaints: email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. The same person
        acts as Grievance Officer under India&apos;s IT Rules 2021 and the DPDP Act 2023.
      </p>
      <p>
        We acknowledge every message within 24 hours and aim to resolve it within 15 days. Postal location: {LEGAL.place}.
      </p>
    </>
  );
}
