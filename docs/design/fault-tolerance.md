# Fault tolerance

What breaks, and what the site does about it. Every optional backend (Upstash, S3, DynamoDB, the LLM) stays an optimization: losing one degrades the site but never takes it down.

## Error surfaces
| Fix | Where | Covers |
|---|---|---|
| Route error screen | `app/error.tsx` | Any render crash. "Try again" resets the route. "Clear saved sign" removes `tastrology:v1`, then resets. |
| Root error screen | `app/global-error.tsx` | Crash in the root layout. Inline styles, because globals.css may not have loaded. |
| 404 page | `app/not-found.tsx` | Unknown URLs, in the house style. |
| Saved-sign shape check | `app/page.tsx` `load()`, `lib/saved.ts` `isSavedResult` | Old or hand-edited localStorage. A bad save is dropped, never rendered. |

## Storage blips are not 404s
- `s3GetStatus`, `ddbGetStatus` and `upstashGetStatus` return `found`, `missing`, `error` or `off` (`lib/lookup.ts`).
- `getTwinStatus` and `getFighterStatus` return `error` when nothing was found and a backend couldn't answer. `getTwin` and `getFighter` keep their old signatures.
- `/api/card` and `/api/battle` answer **503 `no-store`** in that case, so a CDN never pins a false 404. A real miss is still a 404 cached for 60s.
- `/c/[code]` and `/vs/[code]` show "Temporarily unavailable" with a Try again button.

## Dependency resilience
| Fix | Where | Behaviour |
|---|---|---|
| Upstash circuit breaker | `lib/cache.ts` `upstash()` | After 3 straight failures or timeouts, Upstash is skipped for 30s. Callers use their memory fallback at once instead of each waiting out a 1.5s timeout. |
| Run deadline | `app/api/agent/route.ts` | 120s per run. The abort reaches every Qloo call (`withQlooSignal` in `lib/qloo.ts`), and queued `gate()` waiters leave the line on abort, or after 30s. At the deadline the last good reading is served if there is one; otherwise an `error` event with `reason: "deadline"`. |
| `after()` | agent route | Slot release, mint stats, credit refund, lease drop and counters run under `next/server` `after()`, so Vercel doesn't freeze them. |
| Autopilot cache | agent route | Fallback (no-LLM) results are cached under the results key for 10 minutes. LLM results get the full TTL. Both stay within the 6h cap. |
| Qloo down | `lib/agent.ts` `UpstreamError` | When every seed search fails on Qloo's side (network, timeout, 429, 5xx), the error carries `reason: "upstream"`, and the client says "Qloo is having a moment…". |
| Clerk outage | `middleware.ts` | A Clerk failure falls back to `NextResponse.next()`. `/api/health` is outside the matcher. |
| Bad stream lines | `lib/ndjson.ts` | A line that isn't JSON is skipped, not thrown. |
| Body size | agent route | `content-length` is checked before the body is read. The 16KB byte check still runs. |
| Broken seed images | `components/reveal/Orrery.tsx` | `onerror` drops the image for good, and the seed keeps its letter disc. |

## Resuming a dropped stream
- When a client leaves, it only unsubscribes. The run continues (kept alive by `after()` and bounded by the deadline) and writes its result to the results cache.
- While it runs, the server holds a `tm:running:<sha1(key)>` lease in Upstash (`SET NX`, 150s), with a memory fallback (`lib/runLease.ts`).
- Server order on each POST:
  1. Cached result: replay it.
  2. Local flight: join it.
  3. Lease held: `202 {reason:"running"}` with `retry-after: 4`.
  4. Otherwise: a fresh run.
- Client (`lib/useAgentRun.ts`):
  - If the stream read fails mid-run, it shows "Reconnecting…" and re-POSTs the same body and `x-run-id` after 1s, 3s and 6s.
  - On a 202 it polls.
  - Credits are charged at most once, because the ledger is idempotent per run id.

## Health
`GET /api/health` is public and returns `ok:false` with **503** when `VERCEL_ENV=production` and any of these hold:
- mock mode (no `QLOO_API_KEY`);
- only one half of the Turnstile pair is set;
- only one half of the Clerk pair is set;
- no Upstash.

A Turnstile secret without its site key also fails open at runtime (`turnstileOn()` needs both). Demo personas skip Turnstile.

`GET /api/health?deep=1` with `Authorization: Bearer $HEALTH_TOKEN` probes each dependency in parallel, with a 1.5s cap per probe:

| Dependency | Probe | Notes |
|---|---|---|
| `upstash` | `PING` | |
| `ddb` | `GetItem CARD#0000-0000/META` | No item still counts as reachable. |
| `s3` | `GET health/sentinel.json` | A 404 counts as reachable. |
| `qloo` | One search through `qget` | The cache absorbs it. |
| `llm` | The paused flag | No paid call. |

It returns `{deps:{name:{ok,ms,note?}}, degraded:[...]}` and answers 503 if anything is degraded. Unconfigured backends report `note:"off"` and count as ok.

## Setup

### GitHub Actions synthetic check (`.github/workflows/synthetic.yml`)
Runs every 15 minutes, and on demand from the Actions tab.

1. Go to GitHub → repo → Settings → Secrets and variables → Actions.
2. Under **Secrets**, add:
   - `SITE_URL`: the production URL with no trailing slash, e.g. `https://tastrology.vercel.app`.
   - `HEALTH_TOKEN`: a long random string, e.g. `openssl rand -hex 24`. Set the same value as `HEALTH_TOKEN` in Vercel (Production) and redeploy.
3. Optional, under **Variables**: add `CARD_CODE`, a known minted card code like `1234-ABCD`. Without it, the card step is skipped.
4. Run it once with "Run workflow" to confirm it passes.

The workflow fails if any of these happen:
- deep health is not 200, or any dep is not ok;
- the persona POST to `/api/agent` doesn't stream a `"type":"result"` line within 90s (a 202 is polled);
- `/api/card?code=$CARD_CODE` isn't 200 with a card.

GitHub emails the repo owner when a scheduled run fails. Note that GitHub pauses scheduled workflows after 60 days with no repo activity.

### UptimeRobot (free)
1. Sign up at uptimerobot.com (the free plan checks every 5 minutes).
2. Add a new monitor:
   - Type **HTTP(s)**.
   - URL `https://<prod-domain>/api/health`.
   - Interval 5 minutes.
3. Leave the expected status at the default (2xx is up). The public endpoint returns 503 on a production misconfiguration, so that counts as down.
4. Optional: add a **Keyword** monitor on the same URL for `"ok":true`, to also catch a 200 with an unexpected body.
5. Add an alert contact (email is free).

Don't put `HEALTH_TOKEN` in UptimeRobot. Deep checks belong to the GitHub workflow, which keeps the token in Actions secrets.
