import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LEGAL, LegalPage, Rows, Sec } from "@/components/site/Legal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Privacy · ${BRAND.name}` };

export default function Page() {
  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          <strong className="text-ink">The short version.</strong> We keep the card you make and the account you sign in with. We don&apos;t sell data, run ads
          or track you across sites. Your IP address is hashed before it touches our rate limiter. Email us and we&apos;ll delete everything.
        </p>
      }
    >
      <Sec n={1} title="Who is responsible">
        <p>
          {LEGAL.operator}, {LEGAL.place}, is the Data Fiduciary under India&apos;s Digital Personal Data Protection Act 2023 (and the controller under the
          GDPR, if it applies to you). Contact: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </Sec>

      <Sec n={2} title="What we collect and why">
        <Rows
          head={["What", "Examples", "Why"]}
          rows={[
            ["Your loves", "“Kendrick Lamar”, “Spirited Away”", "To build your reading with Qloo data and AI"],
            ["Your card", "Archetype, stats, brand picks, rarity, verify code", "To show, share and verify it"],
            ["Account", "Email, and name and photo if you use Google sign-in; sign-in history", "To run your account and deck, and block fake sign-ups (via Clerk)"],
            ["Profile", "Username, bio and the short line made from it, and who readings are for (woman, man, non-binary or rather not say)", "Friends see your username, account photo, bio line, fighter card, how many cards you hold and when you were last online. Who readings are for is never shown: it only keeps items that don't fit you out of your picks"],
            ["Friends and fights", "Friend list, requests, fights and Stardust stakes, last-online time", "To run friends, fights and the sky"],
            ["Device id", "Random id in the tm_d cookie", "To keep your deck in this browser"],
            ["Network data", "IP address, browser type", "Rate limits, security, delivering pages. The IP is salted and hashed before storage"],
            ["Counts", "Cards minted per day, rarity spread", "To size the service. These don't identify anyone"],
          ]}
        />
        <p>
          We don&apos;t ask for your birth date, ID, location or contacts. Gender is optional (&ldquo;rather not say&rdquo; is always there) and you can change it on your Account page. Your loves can hint at sensitive things; leave out anything you&apos;d rather not
          see on a shareable card. We never use them for advertising.
        </p>
        <p>
          We process this with your consent, given when you sign up and mint, and to provide the service you asked for. You can withdraw consent by deleting your
          account or emailing us.
        </p>
      </Sec>

      <Sec n={3} title="Who handles it for us">
        <Rows
          head={["Provider", "Job", "Data", "Where"]}
          rows={[
            ["Vercel", "Hosting", "Requests, IPs in short-lived logs", "USA / global edge"],
            ["Amazon Web Services", "DynamoDB and S3 store cards, decks and profiles; Bedrock runs the AI (including the bio line)", "Cards, account ids; your loves and Qloo results for one run (no name, email or IP)", "USA"],
            ["Qloo", "Taste data", "Your loves as search terms, and woman/man if you chose it; no name, email or IP", "USA"],
            ["Upstash", "Cache and rate-limit counters", "Hashed ids, counters, Qloo results for at most 6 hours", "USA"],
            ["Clerk", "Sign-in", "Email, profile, sessions", "USA"],
            ["Cloudflare", "Bot checks (Turnstile)", "IP and browser signals during the check", "Global"],
            ["Google Fonts", "One web font", "Your IP when the font loads", "Global"],
          ]}
        />
        <p>
          We don&apos;t sell or rent personal data. We may disclose it if Indian law requires it. Your card is public to anyone with its link, but it doesn&apos;t
          show your name or email.
        </p>
      </Sec>

      <Sec n={4} title="How long we keep it">
        <Rows
          head={["Data", "Kept"]}
          rows={[
            ["Cards and deck", "Until you burn the card, delete your account, or ask us"],
            ["Account, profile, friends, deck, Stardust", "Until you close the account (Account page), which deletes them at once"],
            ["Qloo results cache", "6 hours at most"],
            ["Rate-limit counters", "Minutes to 2 days"],
            ["tm_d device cookie", "400 days in your browser"],
            ["Emails to us", "Up to 3 years, for grievance records"],
          ]}
        />
      </Sec>

      <Sec n={5} title="Your rights">
        <p>
          You can see and correct your profile on the Account page and delete everything there with Close account. You can also ask to see, correct or delete your data, withdraw consent, and nominate someone to act for you. Email{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. If we don&apos;t sort it out, you can complain to the Data Protection Board of India (or your
          local regulator).
        </p>
      </Sec>

      <Sec n={6} title="Children">
        <p>Accounts are for people 13 and over. We ask for a birth year before the sign-up form and keep only the answer on your device. If we learn a child under 13 has signed up, we delete the account and its data.</p>
      </Sec>

      <Sec n={7} title="Security">
        <p>
          Cards are written on the server and checked against their verify code, cookies are signed and HttpOnly, and traffic is HTTPS only. No system is
          perfect; if we have a breach that affects you, we will tell you and the authorities as the law requires.
        </p>
      </Sec>

      <Sec n={8} title="Cookies">
        <p>
          See the <Link href="/cookies">Cookie Policy</Link>. We use no advertising or analytics cookies.
        </p>
      </Sec>

      <Sec id="contact" n={9} title="Contact and grievances">
        <Contact />
      </Sec>
    </LegalPage>
  );
}
