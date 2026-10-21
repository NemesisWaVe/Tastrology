"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { whenAuthReady } from "@/lib/authBridge";

export default function ClerkNav() {
  return (
    <>
      <SignedOut>
        <button
          onClick={() => void whenAuthReady().then((b) => b?.openSignIn())}
          className="whitespace-nowrap py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 transition hover:text-ink"
        >
          Sign in
        </button>
      </SignedOut>
      <SignedIn>
        {/* No "Manage account": email, username and deletion go through /account, which keeps the deck, friends,
            Stardust and card registry in step. Clerk's own panel would change them behind the app's back. */}
        <UserButton appearance={{ elements: { avatarBox: "h-7 w-7", userButtonPopoverActionButton__manageAccount: { display: "none" } } }}>
          <UserButton.MenuItems>
            <UserButton.Link label="Account" labelIcon={<Dot />} href="/account" />
          </UserButton.MenuItems>
        </UserButton>
      </SignedIn>
    </>
  );
}

function Dot() {
  return <span className="block h-1.5 w-1.5 rounded-full bg-accent" />;
}
