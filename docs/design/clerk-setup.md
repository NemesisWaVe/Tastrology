# Clerk setup (founder steps)

Accounts stay off until both keys exist. With them unset, the app runs anonymous, exactly as before.

## Dashboard (dashboard.clerk.com)
1. **Create application**: name "Tastrology". Sign-in options: **Google** and **Email** (email code / OTP). No passwords, no phone.
2. **Configure → Email, phone, username**: email **required**, **verify at sign-up** on.
3. **Configure → Attack protection** (or "Bot sign-up protection"): **on, Smart**. This runs Cloudflare Turnstile for us, so `TURNSTILE_*` can be left unset in prod.
4. **Configure → Restrictions**: block **disposable email domains** and **email subaddresses** (`+tags`), if offered on your plan.
5. **Configure → Legal / Compliance → Legal consent**: turn on **"Require express consent to legal documents"**.
   - Terms URL: `https://<your-domain>/terms`. Privacy URL: `https://<your-domain>/privacy`.
   - The checkbox should read: "I'm 18+ and accept the Terms and Privacy Policy." (design §11 #5; self-declared, no date of birth). If the label can't be edited, keep Clerk's default and add the 18+ line to the Terms.
6. **Paths**: sign-in URL `/sign-in`, sign-up URL `/sign-up`, after sign-in/up `/` (the app passes its own return URL).
7. **Production instance** (at deploy): add your domain and create the DNS records Clerk lists (`clerk.<domain>` etc.). Use the **pk_live/sk_live** keys there. Set up Google OAuth with your own Google client ID for production.
8. **Webhooks** (later, for account deletion): endpoint `https://<domain>/api/webhooks/clerk`, event `user.deleted`. Copy the signing secret.

## Env keys (`.env.local` and Vercel; never commit)
| Key | Where from | Needed now |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | API keys | yes |
| `CLERK_SECRET_KEY` | API keys | yes |
| `CLERK_WEBHOOK_SECRET` | Webhooks → endpoint | later |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` | not secret | optional |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up` | not secret | optional |

Related app flags (not Clerk, not secret):
- `CREDITS_ON=1` turns on reading credits (default off). `FREE_MINTS` (default 3, floor 1).
- `PAYMENTS_PROVIDER=none|razorpay` (default none → "Free during beta"). `PRINTS_ENABLED=1` un-hides the print product (keep off).

## After adding the keys
- **Rebuild** (`npm run build`): the CSP and the `NEXT_PUBLIC_` key are baked in at build time. The CSP adds the Clerk Frontend API host (decoded from the publishable key), `img.clerk.com` and `worker-src 'self' blob:`.
- **IAM**: add `dynamodb:UpdateItem`, `DeleteItem`, `TransactWriteItems` to the table policy (credits and deck claim use them).
- Smoke test: persona demo works signed out; a fresh reading asks you to sign in, then starts; `/deck` shows "Cards from this device moved to your account." once; `/account` shows credits when `CREDITS_ON=1`.
