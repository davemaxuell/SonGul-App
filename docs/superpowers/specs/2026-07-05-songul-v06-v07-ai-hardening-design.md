# SonGul v0.6 / v0.7 — Real AI Loop & Production Hardening

Status: derived 2026-07-05 from the remaining plan.md milestones after §6 Phases 1–5
shipped (v0.1–v0.5). Predecessor: [2026-07-05-songul-v04-v05-sync-collab-design.md](2026-07-05-songul-v04-v05-sync-collab-design.md).

## Scope decisions

| Question | Decision | Source |
|---|---|---|
| What is "Phase 6"? | Finish the AI loop: **convert-to-text** (the one M6 deliverable deferred in v0.3 — plan.md's own v0.3 roadmap lists it) + **the real external AI provider** (fill `server/providers/externalAi.ts`, the plug-in point the v0.2 backend was built around) | plan.md M6 tasks, v0.2 spec deferral |
| AI vendor | **Anthropic Messages API**, model `claude-opus-4-8` default, `SONGUL_AI_MODEL` overridable. Raw fetch inside the existing provider skeleton (the gateway is deliberately dependency-free and the file's own runbook says "replace the two mapping functions") | file contract; server/env.ts principle |
| AI request shape | `system` = Korean-tutor prompt; user content = base64 image block (rendered selection) + recognized text; **structured outputs** (`output_config.format` json_schema matching `AnalyzeResult`/`Finding`); no `thinking` (latency; valid on Opus 4.8); no sampling params (400 on 4.8); refusal/`stop_reason` guard → throw → gateway falls back to rules | claude-api skill |
| AI latency | Fits the existing architecture: gateway's 1.5 s sync budget flips to `pending`+poll; provider timeout default raised to 20 s via `SONGUL_AI_TIMEOUT_MS` | gateway.ts |
| Convert-to-text shape | Lasso selection → 변환 action → recognized text (cluster prefill or one-shot recognize) → **TextBlock** placed at the selection bbox; source strokes tombstoned; whole thing one undo op | plan.md M6 "select-and-convert-to-text flow" |
| TextBlock rendering | New store `textblocks` (DB v5) + `UPSERT_TEXTBLOCK` sync op. Drawn by a shared `drawTextBlocks(ctx, blocks)` in the canvas render path and both exporters; **PDF export rasterizes text into the background layer** (pdf-lib standard fonts can't encode Hangul; embedding a CJK font is deferred). Post-hoc text editing/moving deferred — delete via page ops only | this doc |
| What is "Phase 7"? | plan.md **M11 Production hardening**, buildable subset: bundle code-splitting (1 MB main-chunk warning), local-first error diagnostics (capture → view/export in Settings; no external crash service — no account needed, matches privacy posture), migration + round-trip + geometry-determinism tests | plan.md M11, v1.0 roadmap "beta analytics and crash reporting" |
| Versions | Phase 6 → 0.6.0, Phase 7 → 0.7.0 (versionCode 600/700 auto) | v0.3 scheme |
| Still deferred | pdf-lib CJK font embedding, text-block WYSIWYG editing, realtime collab, payments, iPadOS, external crash services | — |

---

## Phase 6 — Real AI loop (v0.6.0)

### 13.1 External AI provider (server)

- `toAiPayload` → Anthropic `POST {SONGUL_AI_URL:-https://api.anthropic.com}/v1/messages`
  with headers `x-api-key: SONGUL_AI_KEY`, `anthropic-version: 2023-06-01`.
  Body: `model: SONGUL_AI_MODEL ?? 'claude-opus-4-8'`, `max_tokens: 2048`,
  tutor `system` prompt, one user message = optional image block
  (data-URL prefix stripped, `media_type: image/png`) + text block carrying the
  normalized text, requested finding types and offset rules.
- **Structured outputs**: `output_config.format = {type: 'json_schema', schema}` where the
  schema mirrors `AnalyzeResult` exactly (`sourceText`, `correctedText: string|null`,
  `findings[]` with enum `type`/`severity`, `original/suggestion/explanation/explanationEn`,
  integer `start/end` offsets into sourceText; `additionalProperties: false` everywhere).
- `fromAiResponse` → check `stop_reason === 'refusal'` and non-`end_turn` anomalies →
  throw (gateway logs + falls back to rules-v0); else `JSON.parse` the text block and
  clamp/validate offsets (drop findings with out-of-range offsets rather than fail).
- No client changes: `ready()` flips when env vars land; `/v1/health` shows it; the
  existing cache/coalescing/pending machinery applies unchanged.
- Pure mapping functions exported for vitest (`buildAiRequest`, `parseAiResponse`).
- Docs: server/README runbook updated (3 steps become concrete); `.env.example`
  section for `server/.env` (SONGUL_AI_KEY etc.).

### 13.2 Convert-to-text (client)

- `TextBlock {id, pageId, x, y, w, h, text, fontSize, color, createdAt, deleted, syncTs?, syncDev?}`;
  store `textblocks` (DB v5, `by-page` index); db CRUD captures `UPSERT_TEXTBLOCK`
  (v0.4/0.5 clients no-op unknown op types — switch has no default case).
- Flow: lasso → selection menu gains `텍스트 변환 · To text` → text from cluster
  pre-fill (≥80 % coverage) else one-shot `recognize()` (Android) else prompt for
  manual text (browser) → create TextBlock at `selection.bbox` (fontSize ≈ bbox
  height / line count, ink color), tombstone selected strokes, push a compound
  undo op (`convert`: restores strokes + tombstones the block on undo).
- Rendering: `drawTextBlocks(ctx, blocks)` (ink/render.ts, wrapped Korean text,
  `Malgun Gothic`-family stack) called from the canvas page render and PNG export;
  PDF export draws blocks into the rasterized background canvas.
- Bundle/export/sync: textblocks join `.songul` bundles (v2, backward-compatible
  import), snapshots, backfill, applyOp (LWW row semantics like strokes), purge,
  compaction, cascade rules; recognition search is unaffected (results for the
  converted strokes die with the cluster; the text lives in the block).

### 13.3 Tests

Provider request/response mapping (offsets clamp, refusal throws, image block
present/absent); TextBlock CRUD + op capture + applyOp LWW; convert op undo/redo
semantics at the db level; bundle v2 round-trip incl. textblocks.

---

## Phase 7 — Production hardening (v0.7.0, M11 subset)

### 14.1 Performance — code splitting

- Dynamic-import the PDF stack (`pdfjs-dist`, `pdf-lib`) at the call sites
  (`importPdf`, `exportPdf` entry points) and `@supabase/supabase-js` inside
  `cloud/supabase.ts`'s lazy client; goal: main chunk < 500 kB (currently ~1.04 MB),
  no chunk-size warning, first paint unchanged in behavior.

### 14.2 Diagnostics (local-first "crash reporting")

- `src/diag.ts`: hooks `window.onerror` + `unhandledrejection` (+ a `logDiag()` API),
  ring buffer of the last 100 entries `{ts, kind, message, stack?}` persisted via the
  settings store; boot-installs from App.
- Settings → `진단 · Diagnostics`: entry count, last-error preview, "Export log"
  (`saveBlob` a .txt — works on Android via share sheet), "Clear log". No network,
  no accounts — aligned with the privacy policy ("no analytics/tracking").

### 14.3 Test hardening

- DB migration test: seed a v2-shaped database (fake-indexeddb), reopen with the
  current schema, assert stores/rows/indexes survive.
- Bundle round-trip property: export → import → deep-equal on remapped content
  (pages/strokes/textblocks/feedback counts and fields).
- Ink geometry determinism: recorded stroke trace → `buildOutline`/`chaikin`/`resample`
  output hashed; guards the replay-test requirement at the geometry layer (no DOM).

### 14.4 Release checklist touch

README "What works" refresh to v0.7 reality; PLAY_STORE.md release-notes line;
memory update. Device beta run (M11 DoD "10 real testers for a week") stays a
user-world step.
