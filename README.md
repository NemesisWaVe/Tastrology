# TasteMirror

**Your taste already knows your style.** Tell TasteMirror a few things you love, such as artists, films, books, places or games. Its agent queries **Qloo's cross-domain taste graph** to infer your Style DNA and match you with fashion and beauty brands. It shows its work: it measures which of your loves earned each brand.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com) ("Agents, but with taste").

## What makes it Qloo-powered

Remove Qloo and nothing works. The core inference ("people who love *Blade Runner 2049* and *Berghain* gravitate to Acronym and Rick Owens") exists only in Qloo's cross-domain affinity data.

| Qloo endpoint | Used for |
|---|---|
| `GET /search` | Seed autocomplete; the agent resolves seeds to entity IDs |
| `GET /v2/insights` `filter.type=urn:entity:brand` + `feature.explainability` | Brand affinity, with Qloo's per-seed influence on every result |
| `GET /v2/insights` × N (leave-one-out) | **Ablation**: re-query without each seed to measure how much affinity each brand loses |
| `GET /v2/insights` `filter.type=urn:tag` | Style DNA keywords, overall and per "side" when tastes conflict |
| `GET /v2/insights` place / movie / artist / book | Cross-domain taste bridges |
| `GET /v2/tags` | Find fashion and beauty tag URNs to keep brand results on-topic |
| `signal.interests.entities` / `filter.exclude.entities` | Feedback loop: 👍 brands become signals, 👎 brands are excluded |

**Grounding rule.** Every brand, place or title shown comes from a Qloo response in that run. A `GroundingLedger` records everything Qloo returns, and a final gate drops anything else. The LLM can only name the aesthetic and phrase explanations. See `lib/grounding.ts` and `tests/grounding.test.ts`.

## The agent (glass-box, not a wrapper)

1. **Resolve** seeds via Qloo search.
2. **Insights** for brands, with explainability.
3. **Ablate**: one leave-one-out Qloo call per seed builds the **Attribution Matrix**.
4. **Self-critique**:
   - It detects *contradicting* seeds, meaning their influence patterns don't overlap, and splits the Style DNA into two sides instead of averaging them.
   - It rejects brands *carried by a single seed* (≥60% of signal) as fragile matches.
5. **Tags**: Style DNA keywords from Qloo's tag graph.
6. **Bridges**: a place, film, artist and book that complete the aesthetic.
7. **Finalize**: the LLM names the aesthetic and writes "because you love…" lines. Any IDs it invents are ignored.

With `LLM_*` set, an OpenAI-compatible tool-calling model plans and calls these tools itself. The default is a free OpenRouter model, `nvidia/nemotron-3.5-lightning:free`, with `nemotron-3.5-super-vl:free` as fallback. Without an LLM, a deterministic planner runs the same tools.

- **Speculative execution:** while the LLM is deciding, the next Qloo step is prefetched. Its trace events are held back until the LLM actually calls that tool, so runs stay around 20s without hiding the LLM's choices.
- **Free-tier resilience:** on a 429 the LLM is paused (circuit breaker) and the deterministic planner finishes the run. The user never sees a blank screen.

The trace streams live (NDJSON) and every Qloo call is inspectable.

## Run it

```bash
cd tastemirror
cp .env.example .env.local   # mock mode works with no keys
npm install
npm run dev                  # http://localhost:3000
npm test                     # grounding + feedback tests (mock graph)
```

Set `QLOO_MODE=live` and `QLOO_API_KEY` to use the real API (`https://hackathon.api.qloo.com`, header `X-Api-Key`).

**Mock mode** uses a small hand-made synthetic graph (`lib/mock/`) with the same response shape. Per Qloo's hackathon terms, **no Qloo response data is committed to this repo**. Live responses are cached in memory only.

## Stack

Next.js 15 (App Router, TypeScript), Tailwind v4, a hand-written tool-calling agent loop over any OpenAI-compatible API, an in-memory LRU cache for Qloo calls and finished runs, a per-IP rate limit, and Vitest.

## License

Apache License 2.0. See LICENSE.
