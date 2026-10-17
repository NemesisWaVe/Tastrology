import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LEGAL, LegalPage, Sec } from "@/components/site/Legal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Terms · ${BRAND.name}` };

export default function Page() {
  return (
    <LegalPage
      title="Terms"
      intro={
        <>
          <p>
            <strong className="text-ink">The short version.</strong> Tastrology is a free student project built for the Qloo hackathon. Nothing is for
            sale. A card is a playful AI reading of the things you love: not money, not an investment, not an NFT. Brand names on it come from Qloo&apos;s
            taste data and don&apos;t mean any brand knows about us. Be decent, and treat your reading as entertainment.
          </p>
        </>
      }
    >
      <Sec n={1} title="Who we are">
        <p>
          {LEGAL.operator}, based in {LEGAL.place} (&quot;Tastrology&quot;, &quot;we&quot;). By using the site you agree to these terms, the{" "}
          <Link href="/privacy">Privacy Policy</Link> and the <Link href="/cookies">Cookie Policy</Link>.
        </p>
      </Sec>

      <Sec n={2} title="Who can use it">
        <p>
          You need to be <strong>18 or older</strong> to create an account. Demo readings of the sample personas need no account. Don&apos;t use
          Tastrology where the law forbids it.
        </p>
      </Sec>

      <Sec n={3} title="Your account">
        <p>
          Accounts run on Clerk. Keep your sign-in to yourself; you are responsible for what happens under it. One person, one account. To delete your account and every card in it, email us; we do it within 15 days.
        </p>
      </Sec>

      <Sec n={4} title="What a card is, and what it isn't">
        <ul>
          <li>A card is generated from the loves you type, taste data from Qloo, and an AI model. Rarity and stats are part of the game, not a measure of value.</li>
          <li>Cards have no cash value. They can&apos;t be bought, sold, traded for money or redeemed. Stardust (if switched on) is a game point with no cash value either.</li>
          <li>Burning a card deletes it for good. Its share link then shows it as burned.</li>
          <li>The shop is a concept page. Prices shown there are illustrations of a possible future version; you can&apos;t order anything.</li>
        </ul>
      </Sec>

      <Sec n={5} title="Who owns what">
        <p>
          The site, the card designs, the artwork and the code belong to us. The text you type stays yours; you give us a free, worldwide licence to use it to
          make, show and share your card. A card&apos;s share link is public: anyone with it can see the card.
        </p>
      </Sec>

      <Sec n={6} title="Brands, artists and Qloo data">
        <p>
          Names of brands, artists, films and places are trademarks of their owners. They appear because Qloo&apos;s data links them to your taste. No brand
          or person shown endorses, sponsors or works with Tastrology. Taste data is provided by Qloo and used under its hackathon terms.
        </p>
      </Sec>

      <Sec n={7} title="Fair play">
        <ul>
          <li>Don&apos;t type anything hateful, sexual about real people, defamatory, or someone else&apos;s private details.</li>
          <li>Don&apos;t script the site, scrape it, dodge rate limits, or try to break or overload it.</li>
          <li>Don&apos;t pass a card off as official, forge verify codes, or sell cards.</li>
        </ul>
        <p>We may remove cards or close accounts that break these rules.</p>
      </Sec>

      <Sec n={8} title="AI output">
        <p>
          Readings are written by AI models and can be odd, wrong or off-key. They are entertainment, not advice of any kind. If a reading offends you, email us
          and we&apos;ll take it down.
        </p>
      </Sec>

      <Sec n={9} title="Changes and availability">
        <p>
          This is a beta. Features may change, pause or disappear, and we may reset data. We will say so on the site before anything that deletes saved cards.
        </p>
      </Sec>

      <Sec n={10} title="Liability">
        <p>
          The service is free and provided as is. To the extent the law allows, we are not liable for indirect loss or for losing a card. Nothing here limits
          rights you have under consumer law that can&apos;t be excluded.
        </p>
      </Sec>

      <Sec n={11} title="Law and disputes">
        <p>Indian law applies. Courts in Dehradun, Uttarakhand have jurisdiction, without taking away any right you have to sue where you live.</p>
      </Sec>

      <Sec id="contact" n={12} title="Contact and grievances">
        <Contact />
      </Sec>
    </LegalPage>
  );
}
