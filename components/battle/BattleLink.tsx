import Link from "next/link";

/**
 * Entry point into the Taste Battle from anywhere (e.g. the results page).
 * `a` = a persona key, or "me" for the visitor's saved reading. Without it, /vs opens the picker.
 */
export function BattleLink({ a = "me", className = "", label = "Battle someone's taste" }: { a?: string; className?: string; label?: string }) {
  return (
    <Link
      href={`/vs?a=${encodeURIComponent(a)}`}
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 text-[14px] font-medium text-ink transition hover:border-accent hover:text-accent ${className}`}
    >
      <span aria-hidden className="font-display text-[13px] font-bold tracking-tight text-accent">
        VS
      </span>
      {label}
      <span aria-hidden>→</span>
    </Link>
  );
}
