# SonGul Note — v0.1 Product Spec

Status: implemented and verified 2026-07-03. Parent plan: [../plan.md](../plan.md).

## Platform decision

The plan (§2.2) recommends iPadOS-native first. v0.1 is instead a **tablet-first
web app (PWA)** because it was built in a Windows environment with no Xcode, and
because one codebase covers both target devices immediately:

- iPad + Apple Pencil — Safari Pointer Events report pressure/tilt.
- Galaxy Tab + S Pen — Chrome Pointer Events report pressure; the barrel button
  is detected (`buttons & 32`) and temporarily switches to the eraser.

The stroke data model matches the plan's schema exactly, so a native PencilKit /
Compose ink surface can be added later (Milestone 2 long-term direction) and read
the same notebooks via the sync layer or `.songul` bundles. Nothing in v0.1 locks
SonGul to the browser.

## Milestone coverage

| Plan milestone | v0.1 status |
|---|---|
| M1 App shell | ✅ Library → notebook → editor navigation, notebook/page CRUD, settings |
| M2 Ink engine v0 | ✅ Pressure pen, highlighter, eraser, undo/redo, persistence, pan/pinch zoom, palm rejection, predicted-ink preview (`getPredictedEvents`) |
| M3 Storage | ✅ IndexedDB, per-stroke commit writes (crash-safe), tombstones, `.songul` bundle. ⏳ Formal op-log table + snapshots deferred |
| M4 Editor features | ✅ Thumbnails, 7 templates, lasso select/move/resize/copy/paste/delete. ⏳ Shape assist, image/text-box insert deferred |
| M5 PDF | ✅ Import → immutable page backgrounds, annotate, export annotated PDF (vector ink), PNG export |
| M6 Recognition | ✅ v0.3: ML Kit Digital Ink on Android (SongulInk Capacitor plugin), live per-line background recognition, handwritten search with jamo matching, Analyze pre-fill, CER bench page. Browser PWA keeps manual entry. |
| M7 Korean feedback | ✅ Feedback panel, spacing/particle/spelling/register checkers with bilingual explanations, highlight overlay, history, result schema per plan |
| M8 Practice mode | ✅ v0 — recurring-mistake aggregation + generated tracing practice pages |
| M9 Cloud (subset) | ✅ v0.3: Supabase email/password accounts, whole-notebook cloud backup/restore (`backups` bucket + manifest table, RLS), auto-backup on close with offline retry queue, in-app account deletion. Delta sync still deferred. Setup: [SUPABASE_SETUP.md](SUPABASE_SETUP.md) |
| M10–M11 Collab/hardening | ❌ Out of scope per plan §2.4 |

## Korean checker v0 — rule inventory

Rules only fire when jamo analysis makes the error unambiguous (batchim check via
`(code − 0xAC00) % 28`), to keep false positives low:

- Spacing: `-(으)ㄹ 수 있다/없다/수밖에`, `-(으)ㄹ 것/때`, `-지 않다`, `-아/어야 하다`,
  `몇 + counter`, `이번/다음/저번 주`, `한 달`, `수 밖에 → 수밖에`.
- Particles: `를` after batchim → `을`; `을` after vowel → `를` (with noun
  exceptions); `으로/로` by batchim (ㄹ exception); `와` after batchim → `과`.
- Spelling: `됬 → 됐`, word-final `되요 → 돼요`.
- Naturalness: 합니다체/해요체 mixing flagged (low severity).

## Architecture notes

- **Canvas**: two layers — static (paper + committed ink, redrawn on change) and
  live (active stroke + predicted tail, lasso, selection, feedback highlights,
  redrawn per frame). Selection drags render against a cached backdrop so moving
  strokes never re-renders the whole page per frame.
- **Pen rendering**: raw points → resample → Chaikin smoothing → per-point radius
  from smoothed pressure → closed outline polygon (round caps) → single fill.
  The same outline feeds the canvas renderer and the PDF exporter (SVG path), so
  exports match the screen.
- **Persistence**: strokes are individual IndexedDB records written at commit
  time; a force-close loses at most the in-flight stroke. Erase = tombstone.
- **Recognition/feedback** run behind adapters (`RecognitionProvider`,
  rule-based checker) so providers can be swapped per plan Priority 5.
