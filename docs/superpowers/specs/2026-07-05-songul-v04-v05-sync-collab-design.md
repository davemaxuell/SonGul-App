# SonGul v0.4 / v0.5 — Cross-Device Sync & Collaboration

Status: derived 2026-07-05 from plan.md §6 ("Phase 4 — Cloud Product", "Phase 5 — Production")
and milestones M9/M10, continuing the v0.3 arc. Predecessor:
[2026-07-04-songul-v03-recognition-cloud-playstore-design.md](2026-07-04-songul-v03-recognition-cloud-playstore-design.md).

## Scope decisions (from plan.md, not re-asked)

| Question | Decision | Source |
|---|---|---|
| What is "Phase 4"? | plan.md §6 Phase 4 = Cloud Product. Auth + backup shipped in v0.3 → remainder is **cross-device sync with conflict handling** (M9 full) | plan.md §6 |
| Sync granularity | **Operation deltas + snapshots — never whole-document LWW** | plan.md M9 "Important Rule" |
| Conflict strategy | Per M9 table: strokes merge, deletes tombstone, reorder = simple server order, feedback append-only | plan.md M9 |
| What is "Phase 5"? | plan.md §6 Phase 5 = Production. Android app + store release shipped in v0.3 → buildable remainder is the **teacher/student collaboration workflow** (M10 subset) | plan.md §6 |
| Phase 5 exclusions | Realtime presence/live cursors (M10 marks "later"), payments/subscription (needs the user's merchant account; MVP-excluded), custom renderer (ink is already custom vector), iPadOS | plan.md M10, §2.4 |
| Backend | Same Supabase project as v0.3, client-driven sync (Option A "custom sync logic"), env-gated: without keys the app stays fully local | v0.3 decision |
| Versions | Phase 4 → 0.4.0 (versionCode 400), Phase 5 → 0.5.0 (500) | version scheme v0.3 |

---

## Phase 4 — Cross-device sync (M9)

### 11.1 Architecture

```
db.ts mutation (putStroke, putPage, …)
  → appends SyncOp to IndexedDB `oplog` store (same-turn, invisible to callers)
  → SyncEngine (debounced + on triggers):
      push: unsynced ops → Postgres `sync_ops` (idempotent on op_id)
      pull: ops where server_seq > cursor → LWW-apply into IndexedDB → advance cursor
      blobs: attachments/pageImages ↔ Storage objects
      snapshot: periodic id-preserving state object per notebook (fast bootstrap)
  → status surfaced in Library header chip + Settings
```

Client-driven: no custom server. RLS scopes everything; devices converge because
every device applies the same server-ordered op stream with the same
deterministic LWW rule for row updates.

### 11.2 Op model

One op = one row change. Types:
`UPSERT_NOTEBOOK {notebook}` · `DELETE_NOTEBOOK {}` · `UPSERT_PAGE {page}` ·
`DELETE_PAGE {pageId}` · `PUT_STROKE {stroke}` (covers add / erase-tombstone /
undo-restore / lasso-transform — strokes are row-LWW) · `ADD_FEEDBACK {feedback}` ·
`PUT_RECOGNITION {record}` · (v0.5 adds `ADD_COMMENT`).

Local op record: `{opId, seq(auto), deviceId, notebookId, type, payload, ts, synced}`.
`deviceId` reuses `ids.ts deviceId()`. Capture is inside db.ts so no call site
changes; the sync applier and snapshot install run inside `withoutOpCapture()`
so replicated state never re-emits ops. `.songul` import DOES emit ops (it is
new content).

### 11.3 Conflict handling

- Row updates (notebook/page/stroke/recognition): **LWW by `(ts, deviceId)`**,
  compared against `syncTs/syncDev` stamped on the local row. Deterministic on
  all devices regardless of arrival order → convergence.
- Deletes: **tombstones** (`deleted: true` on pages and notebooks — new optional
  field; strokes already have it). Queries filter tombstones; physical delete
  only via compaction (startup purge of tombstones older than 30 days, plus
  pruning of synced oplog rows older than 7 days).
- Feedback/comments: append-only (put-if-absent).
- Echo suppression: pulled ops with own deviceId only advance the cursor.
- Page reorder = per-page UPSERT_PAGE ops; ties resolve by LWW = "simple server
  order for MVP" per plan.md.

### 11.4 Server schema (notebook-scoped so Phase 5 sharing bolts on)

```
notebook_sync    (notebook_id pk, owner_id, title, created_at)
notebook_members (notebook_id, user_id, role owner|editor|viewer)  -- v0.4: owner row only
sync_ops         (notebook_id, server_seq identity, op_id unique, author_id,
                  device_id, op_type, payload jsonb, client_ts, created_at)
```
RLS: members read their notebooks' ops; owner/editor insert; `notebook_sync`
row auto-created on first push. Blobs reuse the private `backups` bucket under
`{userId}/sync/attachments/{id}` and `{userId}/sync/pageimages/{pageId}` (the
existing folder-scoped policies already cover these paths). Cursor per
notebook stored locally in settings. SQL ships as a new run-once section in
docs/SUPABASE_SETUP.md.

### 11.5 Bootstrap, backfill, snapshots

- **Backfill**: on first sync with an empty oplog, emit ops for all existing
  local entities (guarded by a settings flag) so pre-sync notebooks reach other
  devices.
- **Snapshots**: after a successful sync, if ≥500 ops accumulated since the
  last snapshot, upload an id-preserving state object per notebook
  (`{userId}/sync/snapshots/{notebookId}.json` + watermark server_seq). A fresh
  device with no local copy installs the snapshot then replays the tail. This
  is the M9 "snapshot upload/download" task; it reuses the bundle serializer
  with id-preservation (no remap).
- Manual whole-notebook backup/restore from v0.3 stays untouched (disaster path).

### 11.6 Triggers & UI

- Sync runs: app start, library mount, notebook close, `online` event, manual
  "Sync now", and debounced (~10 s) after local ops while signed in.
- Library header chip: ☁ idle/syncing/synced-at/error/offline (hidden when
  cloud unconfigured or signed out). Settings → Cloud sync toggle
  (`Settings.cloudSync`, default on) + last-sync line under the account panel.
- Editor does not live-merge mid-session; pulled changes appear on next
  notebook open (DoD-sufficient; realtime is Phase 5+ territory).

### 11.7 Testing

Unit (fake-indexeddb + in-memory mock of the supabase query surface): op
capture per mutation; LWW comparator; apply rules incl. tombstone-vs-edit and
un-delete; idempotent push (op_id conflict); echo suppression; cursor
advancement; **two-device convergence property test** (random interleavings →
identical final stores); backfill idempotence; snapshot round-trip preserves
ids; compaction. Live two-account testing is a user step (needs their Supabase
project) — same posture as Phase 2.

---

## Phase 5 — Teacher/student collaboration (M10 subset)

### 12.1 Sharing model

- Roles: `owner` / `editor` / `viewer`. Viewers can still **comment** (that IS
  the teacher-review workflow).
- Invite by email: `add_member_by_email(notebook_id, email, role)` SECURITY
  DEFINER RPC (owner-only; looks up auth.users by email).
- Share links: `share_tokens (token, notebook_id, role, created_by, expires_at)`
  + `redeem_share_token(token)` RPC → inserts membership for the signed-in
  redeemer. Link format: `https://son-gul-web-ui.vercel.app/#share=<token>`;
  the app redeems the fragment on load when signed in.
- RLS insert policy becomes role-aware: owner/editor insert any op; viewer may
  insert only `ADD_COMMENT`.

### 12.2 Comments (append-only, synced as ops)

`Comment {id, notebookId, pageId, bbox?, text, authorEmail, createdAt}` in a new
IndexedDB store, written via `ADD_COMMENT` ops. UI: editor side panel listing
the current page's comments (author + time), "add comment" composer (optional
bbox anchor from an active lasso selection), numbered pin badges overlaid at
anchored bboxes. Deleting comments: out of scope (append-only, per M9 rule).

### 12.3 Shared-with-me UX

- Membership pull on sync lists shared notebooks; their content arrives through
  the same snapshot+ops path and they appear in the Library with a "shared ·
  role" badge and owner attribution.
- Role enforcement client-side: viewer opens the editor read-only (ink tools
  disabled, comment composer enabled); server-side RLS is the real guarantee.
- Viewer/editor "delete" = *Remove from my library* (deletes local copy +
  own membership row; no tombstone op). Owner delete keeps v0.4 semantics
  (tombstone for everyone) behind a confirm that says so.

### 12.4 Out of scope (deferred)

Realtime presence/live cursors, simultaneous-editing CRDTs beyond op-LWW,
comment threads/resolve, payments, teacher dashboards, iPadOS.

---

## Phasing

1. **Phase 4 (v0.4.0)** — oplog + sync engine + conflict handling + backfill +
   snapshots + sync UI + SQL migration section. Independently shippable.
2. **Phase 5 (v0.5.0)** — membership/roles/links SQL + share dialog +
   shared-with-me + read-only editor + comments. Ships on top of 4.
