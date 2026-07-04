# SonGul v0.2 — Brand redesign, AI-ready feedback service, tablet APK

Date: 2026-07-04 · Status: approved for implementation (autonomous session; decisions
recorded here in lieu of interactive sign-off)

## 1. Goals

From the product owner's request:

1. Change the app's mood and design to match https://son-gul-web-ui.vercel.app/ and use the
   official SonGul logo.
2. Define what service the product offers users and support it technologically in the backend.
3. Prepare the backend for an external AI API (handwriting feedback) that does not exist yet,
   so that when it arrives we "only need to plug it in" — and it should be fast.
4. Produce an installable package (APK) so the owner can try the mock product on a tablet.

## 2. Visual redesign — "writing-sheet warmth"

The marketing site's language: warm paper cream, faint manuscript grid, indigo "pen" as the
single action color, navy ink headings, playful Gaegu handwriting accents, pill buttons,
soft warm shadows, bilingual Korean-first copy, sprout logo (growth), mascot tutor.

### 2.1 Token mapping (styles.css `:root`)

| Old (stationery/celadon) | New (SonGul brand) | Used for |
|---|---|---|
| `--chrome #f0ebdf` body bg | `--paper #FBF6E9` + grid `.sheet-bg` pattern | app background |
| `--paper #fffdf7` | `--surface #FFFDF6` | cards, panels, page paper |
| `--celadon #3f7261` | `--pen #3F51D6` (hover `--pen-600 #3343C0`, tints `#E7E9FB/#F2F3FD`) | primary actions, active states |
| `--ink #262119` | `--ink #2E2C25` (+ `--navy #23244D` for filled/active chrome) | text, active tool |
| `--vermilion #c4472b` | `--red #C8463B` / `--red-50 #FBEAE7` | 교정 red-pen, high severity, danger |
| `--ochre #b9862f` | `--warm #E0922B` / `--warm-50 #FBF0DC` | medium severity |
| (new) | `--green #3F9B66` / `--green-50 #EAF5EE` | corrected text, success |
| `--line #d8d0bc` | `--line #E7DFCB`, `--grid #E4D9BE` | borders, page grid |
| radius 10px | 14 / 22 / 999px pills | buttons become pills like the site |
| cool shadows | warm shadows `rgba(80,66,30,…)` | cards, menus |

Fonts: `--font-display: Poppins + Noto Sans KR` · `--font-body: Inter + Noto Sans KR` ·
`--font-hand: Gaegu` (empty states, playful hints). Loaded from Google Fonts CDN with
preconnect; Android/Samsung tablets ship Noto Sans KR system-wide so offline fallback stays
faithful; the service worker runtime-caches font files after first online load. Bundling
KR subsets locally is deferred (v-next).

### 2.2 Screen-level changes

- **Library**: real `SonGul-LOGO.png` wordmark (replaces the 손 square), tagline
  "손으로 배우는 한국어 — learn Korean by hand", cream grid `.sheet-bg` backdrop, notebook
  covers recolored (pen indigo / navy / warm / green), pill buttons, mascot + Gaegu copy in
  the empty state.
- **Editor**: top bar on cream with pill controls; 교정 button keeps the red-pen identity
  (`--red`); active tools fill navy; page sidebar and menus on `--surface` with warm shadows.
- **Feedback panel**: red-pen 교정 chip kept; corrected sentence box goes `--green-50`;
  severity colors red/warm/ink-faint; provider + latency badge added (see §4).
- **Settings**: new "SonGul AI" block (engine mode, server URL, connection test).
- **PWA chrome**: `theme-color #FBF6E9`, new indigo-square icon (site favicon style),
  manifest name "SonGul — 손글", SW cache bumped to `songul-v2`, runtime caching for fonts.
- Interaction ergonomics (hit targets ≥40px, stylus/palm behavior) unchanged.

## 3. What service does SonGul offer? (product definition)

The marketing site sells one loop, and v0.2 makes the app embody it:

> **Write by hand → Check (AI 교정) → Understand (explanations) → Practice (generated pages)
> → Track (history & recurring mistakes).**

The notebook is the surface; the *service* is the feedback loop on handwritten Korean:
letter shape, stroke order, spacing, grammar, naturalness — with concrete corrections and
regenerated practice. Technologically that requires exactly one backend capability done
well: **an analysis gateway that turns (strokes, image, text) into structured findings,
fast, from any device** — which is what §4 builds. Progress dashboards, streaks, accounts
and sync (marketing site's Dashboard page; plan.md M9+) consume the same analysis records
later; the schema already carries what they need (type, severity, spans, timestamps).

## 4. AI-ready feedback backend

### 4.1 Shape

```
App (tablet, offline-capable)
 └─ FeedbackEngine adapter
     ├─ LocalEngine  — in-app rule checkers (today's korean.ts) — always works, APK default
     └─ RemoteEngine — HTTP → SonGul feedback gateway
Server (server/, zero-dependency Node ≥22, plain node http)
 └─ POST /v1/feedback/analyze
     validate → normalize → cache lookup → provider chain → persist → respond
     Providers (FeedbackProvider interface):
       1. external-ai — enabled iff SONGUL_AI_URL/SONGUL_AI_KEY set; ONE mapping function
          to implement when the real AI API arrives          ← the plug-in point
       2. rules-v0    — imports the SAME checkKorean() the app uses (shared module)
```

Key property: **the wire contract already carries everything a future AI needs** — raw
vector strokes (x/y/pressure/time), a rendered PNG of the selection, and the (recognized or
typed) text. Today's rules provider only reads `text`; the AI provider will read all three.
So plugging in the AI changes zero client code and zero API shape — only
`server/providers/externalAi.ts` gains its request/response mapping.

### 4.2 API contract (v1)

- `GET /v1/health` → `{ ok, version, activeProvider, providers:[{id, ready, mode}] }`
- `POST /v1/feedback/analyze`
  ```jsonc
  {
    "language": "ko",
    "source": {
      "text": "한국어를 공부할수있어요",          // optional if strokes/image present
      "strokes": [{ "points": [{"x":1,"y":2,"p":0.5,"t":0}], "width": 3 }],  // optional
      "imagePng": "data:image/png;base64,…"      // optional, ≤1024px longest edge, client-side
    },
    "types": ["spacing","grammar","spelling","naturalness","handwriting"],
    "clientRequestId": "uuid"                     // idempotency/coalescing key
  }
  ```
  → `200 { analysisId, status:"done", provider, cached, latencyMs, result }`
  → `202 { analysisId, status:"pending", pollAfterMs }` (slow provider path)
  → `422 { error:"UNSUPPORTED_SOURCE" }` when only ink is sent and no ready provider can
    recognize it (the rules provider needs text; the AI provider won't).
  `result = { sourceText, correctedText|null, findings: Finding[] }` — `Finding` identical
  to the client type (type, severity, original, suggestion, explanation, explanationEn,
  start, end) so results drop straight into the existing panel and history store.
- `GET /v1/feedback/analysis/:id` → same envelope (poll target).
- `GET /v1/feedback/history?limit=50` → recent analyses (feeds future dashboard/teacher view).

### 4.3 "Fast later" engineering (built now, benefits the AI day one)

1. **Content-addressed cache** — key = sha256(provider + language + normalized text +
   stroke digest); repeat analyses return in ~1ms with `cached:true`. AI calls are the
   expensive thing later; identical homework re-checks become free.
2. **In-flight coalescing** — identical concurrent requests share one provider call.
3. **Async job envelope** — `done`/`pending` + poll endpoint; client already handles both,
   so a 5–10 s AI never blocks the pen. (Rules answer synchronously today.)
4. **Provider timeout + fallback chain** — external AI gets a hard budget (default 8 s);
   on timeout/failure the gateway falls back to rules and flags `provider:"rules-v0"`.
   The app additionally falls back to LocalEngine when the server is unreachable.
5. **Latency observability** — every response carries `latencyMs` + provider; server logs
   per-request timing lines (plan.md M11 asks for exactly this).
6. **Client-side payload discipline** — selection PNG downscaled before upload; strokes sent
   as compact arrays.

Persistence: append-only JSONL under `server/data/` (analyses double as the cache index at
boot). Deliberately no database dependency for the mock; the storage interface is three
functions, swappable for Postgres when accounts/sync (M9) arrive.

### 4.4 Runbook: the day the AI API arrives

1. `server/.env`: set `SONGUL_AI_URL`, `SONGUL_AI_KEY` (+ optional `SONGUL_AI_TIMEOUT_MS`).
2. Fill in the marked mapping function in `server/providers/externalAi.ts`
   (our request → their payload; their response → `Finding[]`).
3. Restart. Health shows `external-ai: ready`; the app needs no update.

## 5. Client wiring

- `src/feedback/client.ts` — `FeedbackEngine` interface, `LocalEngine` (wraps
  `checkKorean`), `RemoteEngine` (fetch + timeout + poll), `resolveEngine(settings)`.
- `Settings` gains `{ aiMode: 'auto'|'local'|'remote', serverUrl }` (defaults:
  `auto`, `''`); merge-with-defaults keeps old installs working. `auto` = remote when a URL
  is configured and healthy, else local.
- `AnalysisRequest` gains `strokes: Stroke[]` (EditorScreen already has them in scope).
- FeedbackPanel: analyze() routes through the engine; result header shows
  `provider · latency · offline/online`; remote failure shows a gentle "fell back to
  on-device rules" note.

## 6. Packaging — Android APK (Capacitor)

- Toolchain (this machine has none): Temurin JDK 21 via winget; Android
  cmdline-tools zip + `sdkmanager platform-tools platforms;android-35 build-tools;35.0.0`
  with licenses accepted; Gradle comes from the generated wrapper.
- `@capacitor/core+cli+android` (v7), appId `com.songul.note`, appName `SonGul`,
  `webDir dist`, `android.allowMixedContent true` so the tablet can call a LAN
  `http://<pc-ip>:8787` feedback server during testing.
- Launcher icons generated from a 1024px brand PNG via `@capacitor/assets`.
- Output: debug-signed `app-debug.apk` (sideload-installable; Play signing later).
- Known WebView limitations to note in the README: blob-URL downloads (PDF/.songul export)
  may be inert inside the APK shell — exports are a browser-PWA strength for now; the
  writing/feedback/practice loop is the APK's job.
- Fallback if toolchain install fails: ship PWA + LAN instructions and say so plainly.

## 7. Out of scope (unchanged from plan.md)

Real handwriting recognition, real AI provider, accounts/cloud sync (M9), collaboration
(M10), payments, Play Store release. The dashboard remains marketing-site-only; the app's
기록/연습 tabs are its seed.

## 8. Verification

1. `tsc && vite build` clean.
2. Playwright: library (brand look, logo), create notebook, write, lasso → 교정 →
   analyze via **LocalEngine** (server down) → findings render; then start server →
   settings URL → analyze via **RemoteEngine** → provider badge `rules-v0`, `cached:true`
   on repeat; screenshots archived.
3. `node server/index.ts` health + analyze round-trip via curl, including cache hit and
   external-ai-unconfigured fallback.
4. APK: gradle build succeeds; artifact size sanity; install instructions written.
