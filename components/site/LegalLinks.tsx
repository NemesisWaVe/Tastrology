import Link from "next/link";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/privacy#contact", label: "Grievances" },
];

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap gap-x-6 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-3 ${className}`}>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="py-2 transition hover:text-ink">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
