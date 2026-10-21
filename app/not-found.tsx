import { LostCard } from "@/components/site/LostCard";
import { SiteShell } from "@/components/site/SiteShell";

export default function NotFound() {
  return (
    <SiteShell>
      <LostCard
        kicker="404 · off the chart"
        title="No star sits at this address."
        body="The link might have a typo, or the page moved on. Your sign is still where you left it."
        stamp="No. 404"
        cta={{ href: "/", label: "Back to the start" }}
        more={{ href: "/hall", label: "Or wander the Hall of Rares" }}
      />
    </SiteShell>
  );
}
