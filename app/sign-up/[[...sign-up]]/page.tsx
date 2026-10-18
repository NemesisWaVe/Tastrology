import type { Metadata } from "next";
import Link from "next/link";
import { GatedSignUp } from "@/components/auth/GatedSignUp";
import { SiteShell } from "@/components/site/SiteShell";
import { clerkOn } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Join · ${BRAND.name}` };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SiteShell>
      <div className="flex flex-col items-center gap-6 pt-4">
        <h1 className="text-center font-serif text-4xl italic leading-[0.95] sm:text-5xl">Your stars, on file.</h1>
        {clerkOn() ? (
          <GatedSignUp />
        ) : (
          <p className="max-w-sm text-center text-ink-2">
            Accounts aren&apos;t open yet. Your deck lives on this device for now.{" "}
            <Link href="/deck" className="text-accent underline-offset-4 hover:underline">
              Open it
            </Link>
            .
          </p>
        )}
      </div>
    </SiteShell>
  );
}
