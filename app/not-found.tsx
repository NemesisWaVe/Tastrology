import Link from "next/link";
import { CursorArrow } from "@/components/CursorArrow";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">404 · off the chart</p>
      <h1 className="font-serif text-5xl italic leading-[0.95]">No star sits at this address.</h1>
      <p className="text-ink-2">The link might have a typo, or the page moved on. Your sign is still where you left it.</p>
      <Link href="/" className="group mt-2 inline-flex items-center gap-3 rounded-full bg-accent py-2 pl-6 pr-2 font-semibold text-paper">
        Back to {BRAND.name}
        <CursorArrow className="h-9 w-9 bg-paper text-accent" />
      </Link>
    </main>
  );
}
