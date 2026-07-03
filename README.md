# SonGul Note · 손글

A tablet-first handwriting notebook for Korean learners. Write naturally with a stylus,
organize notebooks and pages, annotate PDF worksheets, and get feedback on Korean
spacing (띄어쓰기), particles (조사), and spelling — fully offline, local-first.

This is the **v0.1 MVP** described in [plan.md](./plan.md), implemented as a
tablet-optimized web app (PWA). See [docs/PRODUCT_SPEC.md](./docs/PRODUCT_SPEC.md)
for what is in this version and why the first platform is the web.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Open it on an iPad (Safari) or Galaxy Tab (Chrome) on the same network —
`npm run dev` listens on the LAN. Apple Pencil and S Pen work through Pointer
Events with pressure; fingers pan and pinch-zoom (palm rejection by pointer type).

## What works (v0.1)

- **Library** — create / rename / delete / duplicate-via-backup notebooks.
- **Ink** — pressure-sensitive pen (variable-width vector outlines), highlighter
  (multiply blend), stroke eraser, undo/redo (op stack), S Pen barrel-button eraser.
- **Pages** — add / duplicate / delete / reorder; thumbnail sidebar; 7 templates
  including 한글 연습 squares and TOPIK 원고지 manuscript grid.
- **Storage** — local-first IndexedDB; every stroke is persisted on commit
  (doubles as crash recovery); erased strokes are tombstoned, not destroyed.
- **PDF** — import a worksheet (each page becomes an immutable background),
  write over it, export the annotated notebook as PDF (ink stays vector) or
  the current page as PNG. `.songul` JSON bundle for backup/transfer.
- **교정 Korean feedback** — lasso a handwritten sentence → feedback panel:
  pluggable recognition adapter (mock provider ships first; ML Kit/MyScript later),
  rule-based checkers for spacing, particle agreement (을/를, 로/으로, 와/과),
  spellings (됬→됐, 되요→돼요), speech-level consistency; bilingual explanations;
  feedback history; recurring-mistake list; **practice page generator** that
  builds a tracing sheet from your corrected sentences.

## Data model

Strokes are stored as vectors with full metadata (`id`, `pageId`, `deviceId`,
points with pressure + timing, tool, width, color, tombstone flag) — matching the
plan's stroke schema so recognition, sync, and the future native ink engines can
reuse the same data.

## Repo layout

```
src/
  ink/          geometry (outlines, hit-tests) + canvas rendering
  pdf/          pdfjs import, pdf-lib export
  feedback/     Korean checkers + recognition adapter
  components/   Library, Editor, CanvasSurface, Toolbar, Sidebar, FeedbackPanel
  db.ts         IndexedDB layer   ·  bundle.ts  .songul export/import
  templates.ts  page templates    ·  types.ts   data model
docs/           product spec
plan.md         full product plan (all milestones)
```
