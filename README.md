# SonGul · 손글 — learn Korean by hand

<p><img src="public/assets/SonGul-LOGO.png" alt="SonGul" width="220"></p>

A tablet-first handwriting app for Korean learners: write naturally with a
stylus, organize notebooks, annotate PDF worksheets — and run every sentence
through the SonGul feedback loop:

> **Write → Check (교정) → Understand (explanations) → Practice (generated
> pages) → Track (history & recurring mistakes).**

v0.2 wears the official SonGul brand (warm writing-sheet paper, indigo pen,
red-pen 교정, Gaegu accents — matched to the marketing site) and ships an
**AI-ready feedback backend**: the app already sends handwriting strokes,
a rendered image, and text with every check, so the real AI API later plugs
into one server file with zero app changes.

## Run it

```bash
npm install
npm run dev        # app        → http://localhost:5173  (listens on the LAN)
npm run server     # feedback gateway → http://0.0.0.0:8787
npm run build      # production build in dist/
```

Open the app on an iPad (Safari) or Galaxy Tab (Chrome) on the same network.
Apple Pencil and S Pen work through Pointer Events with pressure; fingers pan
and pinch-zoom.

To use the gateway from a tablet: Settings → **SonGul AI** → enter
`http://<your-pc-ip>:8787` → *Test connection*. Feedback then shows a
`☁ rules-v0 · …ms` badge; if the server is unreachable it falls back to the
on-device checkers automatically (`📱 on-device` badge + notice).

## Android APK (mock product preview)

The repo contains a Capacitor Android project (`android/`). To rebuild:

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # needs JDK 21 + Android SDK
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a Galaxy Tab: copy `app-debug.apk` over (or share via Drive), tap
it, allow "install unknown apps" for your file manager, open **SonGul**.
Everything works offline (notes, ink, templates, on-device feedback,
practice pages). Since v0.3, PDF/PNG/`.songul` exports inside the APK open
the Android share sheet (save to Files, Drive, etc.).

## Release (Play Store)

```powershell
npm run build
npx cap sync android
android\gradlew.bat -p android bundleRelease --console=plain
```

Signed `.aab` lands in `android/app/build/outputs/bundle/release/`. Signing uses the
gitignored `android/songul-upload.jks` + `android/key.properties` — **keep backups of
both**. Full submission walkthrough (listing copy, data-safety answers, internal
testing track): [docs/PLAY_STORE.md](docs/PLAY_STORE.md).

## The feedback service (what the backend is for)

```
app FeedbackEngine ──► local rules (offline / APK default)
        │
        └────────────► server/ feedback gateway (v1 API)
                          ├─ external-ai   ← the future AI plugs in HERE
                          └─ rules-v0      (same checkKorean the app bundles)
                          + content-hash cache · coalescing · async poll
                          + timeout→fallback · latency logs
```

See [server/README.md](server/README.md) for the API, the fast-path design,
and the 3-step runbook for plugging in the real AI. The wire contract both
sides share is [src/feedback/contract.ts](src/feedback/contract.ts); the
design decisions are in
[docs/superpowers/specs/2026-07-04-songul-v02-brand-ai-backend-design.md](docs/superpowers/specs/2026-07-04-songul-v02-brand-ai-backend-design.md).

## What works (v0.2)

- **Library** — brand header with the SonGul logo; create / rename / delete /
  backup notebooks with cover colors from the brand palette.
- **Ink** — pressure-sensitive pen (vector outlines), highlighter, stroke
  eraser, undo/redo, S Pen barrel-button eraser.
- **Pages** — add / duplicate / delete / reorder; thumbnails; 7 templates
  including 한글 연습 squares and TOPIK 원고지.
- **Storage** — local-first IndexedDB; strokes persist on commit; tombstones.
- **PDF** — import worksheets, annotate, export annotated PDF / PNG;
  `.songul` bundles.
- **교정 feedback** — lasso handwriting → panel; pluggable recognition
  adapter; feedback engine with on-device rules **and** gateway mode
  (provider + latency badge, cached flag, graceful fallback); bilingual
  explanations; history; recurring mistakes; practice page generator.
- **PWA** — installable, offline shell, brand icons, font caching.

## Repo layout

```
src/
  ink/          geometry (outlines, hit-tests) + canvas rendering
  pdf/          pdfjs import, pdf-lib export
  feedback/     korean.ts checkers · client.ts engines · contract.ts wire types
  components/   Library, Editor, CanvasSurface, Toolbar, Sidebar, FeedbackPanel
  db.ts         IndexedDB layer   ·  bundle.ts  .songul export/import
server/         zero-dependency feedback gateway (v1 API, provider chain)
android/        Capacitor Android shell (debug APK)
assets/         brand icon/splash sources   ·  public/assets/  logo + mascot
docs/           product spec + design specs
plan.md         full product plan (all milestones)
```
