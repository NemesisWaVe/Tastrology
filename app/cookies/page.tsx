import type { Metadata } from "next";
import { Contact, LegalPage, Rows, Sec } from "@/components/site/Legal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Cookies · ${BRAND.name}` };

export default function Page() {
  return (
    <LegalPage
      title="Cookies"
      intro={
        <p>
          <strong className="text-ink">The short version.</strong> Only the cookies and storage the site needs to work: your deck, your sign-in and bot
          protection. No ads, no analytics, no tracking pixels. That&apos;s why there&apos;s no cookie banner.
        </p>
      }
    >
      <Sec n={1} title="Everything we set">
        <Rows
          head={["Name", "Set by", "Purpose", "Lasts"]}
          rows={[
            ["tm_d", "Tastrology", "Random device id so your deck is remembered", "400 days"],
            ["tm_h", "Tastrology", "Proves you passed the bot check", "30 minutes"],
            ["__session, __client_uat, __client", "Clerk", "Keeps you signed in", "Per session"],
            ["__cf_bm, _cfuvid, Turnstile", "Cloudflare", "Bot protection during sign-up and minting", "Up to a session"],
            ["tastrology:v1 (local storage)", "Tastrology", "Your latest reading on this device", "Until you clear it"],
            ["tastrology:* (local / session storage)", "Tastrology", "Demo battle fighters, a pending challenge, burn state", "Until cleared or tab closed"],
          ]}
        />
        <p>One card font loads from Google Fonts, which sees your IP address but sets no cookie.</p>
      </Sec>

      <Sec n={2} title="Managing them">
        <p>
          You can block or clear cookies in your browser. If you block tm_d your deck won&apos;t be remembered; blocking Clerk or Cloudflare cookies stops
          sign-in. Clearing local storage only removes your latest reading from this device; saved cards and share links are unaffected.
        </p>
      </Sec>

      <Sec n={3} title="Contact">
        <Contact />
      </Sec>
    </LegalPage>
  );
}
