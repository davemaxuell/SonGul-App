# SonGul feedback gateway

The backend for SonGul's one core service: turn handwritten Korean
(**strokes + image + text**) into structured feedback findings, fast, from any
device. Zero dependencies — plain Node ≥ 22.6 (type stripping runs the `.ts`
files directly).

```bash
npm run server          # http://0.0.0.0:8787 — tablets on the LAN can reach it
```

## API (v1)

| Route | What |
|---|---|
| `GET /v1/health` | provider chain status — the app's "Test connection" hits this |
| `POST /v1/feedback/analyze` | analyze `{ language, source:{text?, strokes?, imagePng?}, types? }` |
| `GET /v1/feedback/analysis/:id` | poll target when analyze returned `202 pending` |
| `GET /v1/feedback/history?limit=50` | recent analyses (future dashboard/teacher view) |

Responses carry `provider`, `cached`, `latencyMs`, and a `result` whose
`findings[]` use exactly the app's `Finding` type — the wire contract lives in
[`src/feedback/contract.ts`](../src/feedback/contract.ts) and is imported by
both sides, so they cannot drift.

## How it stays fast

- **Content-addressed cache** — sha256 of (provider, language, text, stroke
  digest); a repeated check answers in ~0 ms with `cached: true`.
- **In-flight coalescing** — identical concurrent requests share one provider call.
- **Async envelope** — if a provider exceeds `SONGUL_SYNC_BUDGET_MS` (1.5 s),
  the POST returns `202 { status: "pending", pollAfterMs }` and the client
  polls; a slow AI never blocks the pen.
- **Timeout + fallback chain** — the AI provider gets `SONGUL_AI_TIMEOUT_MS`
  (8 s); on failure the gateway silently falls back to `rules-v0`. The app
  additionally falls back to its on-device checkers if the gateway itself is
  unreachable, so feedback can never fully fail.
- **Latency logging** — one line per request (`provider=… cached=… …ms`).

## Plugging in the real AI (the only step left)

1. `cp server/.env.example server/.env`, set `SONGUL_AI_URL` + `SONGUL_AI_KEY`.
2. Fill in the two marked mapping functions in
   [`providers/externalAi.ts`](providers/externalAi.ts) (`toAiPayload`,
   `fromAiResponse`) with the vendor's request/response shapes.
3. Restart. `/v1/health` shows `external-ai · ready: true`.

Nothing else changes: the app already sends text + vector strokes + a rendered
selection PNG with every check, results flow through the same cache/fallback
machinery, and the UI's provider badge starts saying `external-ai`.

## Storage

Append-only `server/data/analyses.jsonl` (gitignored) replayed into memory at
boot — it doubles as the cache index. The gateway touches storage through four
functions in [`store.ts`](store.ts), so swapping in Postgres for accounts/sync
(plan.md M9) is contained.
