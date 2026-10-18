import type { Metadata } from "next";
import { Invite } from "@/components/friends/Invite";
import { SiteShell } from "@/components/site/SiteShell";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Fight me · ${BRAND.name}`,
  description: "Add me on Tastrology. Mint your taste card and fight mine.",
};

/** Friend invite: /f/<player code>. */
export default async function InvitePage({ params }: { params: Promise<{ pc: string }> }) {
  const pc = decodeURIComponent((await params).pc).toUpperCase();
  return (
    <SiteShell>
      <Invite pc={pc} />
    </SiteShell>
  );
}
