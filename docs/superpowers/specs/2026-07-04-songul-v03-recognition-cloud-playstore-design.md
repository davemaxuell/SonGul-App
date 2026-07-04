# SonGul v0.3 — Live Recognition, Cloud Backup, Play Store Readiness

Status: approved 2026-07-04. Parent plan: [../../plan.md](../../plan.md) (M6 recognition, M9 subset, release hardening).
Predecessor: [2026-07-04-songul-v02-brand-ai-backend-design.md](2026-07-04-songul-v02-brand-ai-backend-design.md).

## Decisions made during brainstorm

| Question | Decision |
|---|---|
| v0.3 goal | Make the AI loop real (recognition first) |
| Recognition | On-device ML Kit Digital Ink (Android), via local Capacitor plugin |
| External AI provider | **Deferred** — `externalAi.ts` plug-in point stays empty; recognized text flows through the existing `analyzeSmart()` contract so a future LLM inherits it |
| Scope riders | Handwritten search + recognition quality bench (convert-to-text deferred) |
| Search indexing | **Live per-line recognition** (recognize clusters as they go quiet while writing) |
| Cloud depth | **Backup & restore** of whole `.songul` bundles (no merge/delta sync — M9 full sync deferred) |
| Backend | **Supabase** (Auth email+password, Storage bucket, Postgres manifest, RLS) |
| Store target | Signed release AAB good for a Play **internal testing track**, plus in-app policy compliance |

## Phasing — each phase independently shippable

1. **Phase 1 — Recognition**: Capacitor plugin, line clusterer, live recognition scheduler, handwritten search, bench page.
2. **Phase 2 — Accounts & cloud backup**: Supabase auth, backup/restore UI, auto-backup, account deletion.
3. **Phase 3 — Release engineering**: signed AAB, native export fix, privacy/data-safety docs, `docs/PLAY_STORE.md`.

---

## Phase 1 — Recognition

### 1. Architecture

```
stroke committed (existing ink engine)
  → LineClusterer assigns stroke to a line cluster        (pure JS, O(1))
  → cluster quiet ~1.5s
  → RecognitionScheduler queues cluster (low priority, serialized)
  → RecognitionProvider "mlkit-android"
      → Capacitor plugin SongulInk → ML Kit Digital Ink (native thread)
  → RecognitionResult persisted to IndexedDB
  → consumed by: handwritten search, Analyze pre-fill
```

Recognition is write-behind: pen loop and canvas never wait on it. In the browser
PWA the provider reports `unavailable` and everything behaves as v0.2 (manual entry).

### 2. Capacitor plugin `SongulInk` (native, lives in `android/`)

- Kotlin class registered in `MainActivity`; no separate npm package.
- `recognize({strokes: [{points: [{x, y, t}]}], language}) → {candidates: [{text, score}]}`
- `ensureModel({language}) → {status: "downloaded"|"downloading"|"failed"}` — one-time
  ~20 MB Korean model download; progress surfaced as plugin events; status shown in Settings.
- Dependency: `com.google.mlkit:digital-ink-recognition`.

### 3. LineClusterer (client, pure TS)

- Groups committed strokes into line clusters: a stroke joins the active cluster when
  vertical extent overlaps ≥ 40% or starts within 1.2× the cluster's line height,
  else opens a new cluster.
- Erase / lasso-move / undo marks the owning cluster dirty → re-queued.
- Clusters are derived data: rebuilt from strokes on page load, never a source of truth.

### 4. Storage & handwritten search

- New IndexedDB store `recognition_results`, key `(pageId, clusterId)`:
  `{pageId, clusterId, text, confidence, strokeIds, bbox, provider, timestamp}`
  (field set mirrors plan.md M6 output schema).
- Library search box: jamo-normalized substring match over results; hit shows
  notebook/page + snippet; tap opens editor at page and flashes cluster bbox.
- Cascade delete with pages/notebooks.

### 5. Feedback loop integration

- Analyze on a selection: covered fresh clusters pre-fill text instantly; uncovered
  strokes get a one-shot `recognize()`; result editable before analysis.
- Rules engine and gateway pipeline unchanged.

### 6. Bench page

- Hidden route from Settings → "Recognition bench": prompts built-in ~20-item Korean
  sample set, user writes each, scores character error rate against the prompt,
  running tally. Purpose: quantify trust in ML Kit before deeper reliance.

### 7. Error handling

- Provider `unavailable` (browser / model missing / plugin absent) → manual entry
  fallback; search shows "recognition available on the Android app" hint.
- Cluster recognition failure → one retry, then mark `failed` (excluded from search).
- Low-confidence results stored but flagged; Analyze shows them editable, never
  silently trusted.

### 8. Testing

- Unit: LineClusterer (overlap/time/erase cases), jamo search matcher, scheduler debounce.
- Device acceptance: bench page on Galaxy Tab; M6 definition of done — write Korean,
  search the word later, land on the right page area.

---

## Phase 2 — Accounts & cloud backup (Supabase)

### 9.1 Auth

- `@supabase/supabase-js`, email + password only (no OAuth redirects — works the same
  in browser and APK WebView). Google sign-in deferred.
- Settings → Account panel: sign up / sign in / sign out / **delete account**
  (Play policy requirement; deletes auth user + storage objects + manifest rows).

### 9.2 Storage layout

- Private Storage bucket `backups`; object path `{userId}/{notebookId}.songul`.
- Postgres table `backups` (manifest): `user_id, notebook_id, title, page_count,
  size_bytes, updated_at, device_name`. RLS: `user_id = auth.uid()` on table and bucket.
- Schema deliberately mirrors plan.md M9 metadata so delta sync can bolt on later.

### 9.3 Backup flow

- Reuses the existing `.songul` bundle exporter unchanged.
- Notebook menu → "Back up": upload bundle + upsert manifest row.
- Auto-backup toggle (Settings): on notebook close, if signed in + online, back up
  dirty notebooks silently; offline queues until connectivity returns.

### 9.4 Restore flow

- Library → "Cloud backups" screen lists manifest rows (title, pages, size, date, device).
- Restore downloads bundle → existing `.songul` importer. Existing local notebook →
  user chooses overwrite or restore-as-copy. Delete removes object + row.
- No merge logic anywhere: a backup is a whole-notebook snapshot, newest wins.

---

## Phase 3 — Play Store readiness

### 10.1 Release build

- Upload keystore + `key.properties` (gitignored) wired into Gradle signing config.
- `versionCode`/`versionName` derived from package.json version.
- Deliverable: `gradlew bundleRelease` → upload-ready `.aab`. Capacitor 8 target SDK
  already satisfies Play requirements.

### 10.2 Native export fix (store-blocker bug)

- Blob anchor downloads are inert in the APK WebView. When `Capacitor.isNativePlatform()`,
  PDF/PNG/`.songul` exports route through Capacitor Filesystem (cache dir) + Share sheet.

### 10.3 Policy compliance

- In-app account deletion (Phase 2 §9.1).
- Hosted privacy-policy page — public URL required by Play; simplest: `/privacy` on the
  existing son-gul-web-ui.vercel.app site (content authored here, deployment is a user step).
- Data-safety answer sheet documented.

### 10.4 `docs/PLAY_STORE.md`

- Checklist: 512 px icon + 1024×500 feature graphic adapted from existing brand assets,
  tablet screenshots, Play Console steps to an internal testing track.
- Console signup/publishing ($25) is a user step.

---

## Out of scope (unchanged deferrals)

- Real external AI provider mapping (plug-in point stays).
- Convert-to-text, full M9 delta sync/conflicts, collaboration (M10), iPadOS.
