# SonGul v0.5 Phase 5 — Teacher/Student Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share notebooks between accounts (owner/editor/viewer) with email invites and share links, append-only comments synced as ops, viewer read-only editing with commenting — the M10 teacher-review workflow, minus realtime (spec §12).

**Architecture:** Comments are a new IndexedDB store (v4) written through `ADD_COMMENT` ops — they ride the Phase 4 sync pipeline unchanged. Membership/roles/links live server-side (SQL RPCs, SECURITY DEFINER); the engine records each notebook's role in the `notebookRoles` setting during sync. Client: share dialog in the Library (owner), shared badge + "Remove from my library" (non-owner), read-only editor + comments panel, share-link redemption from the URL hash.

**Tech Stack:** unchanged (TS, idb, supabase-js, vitest).

## Global Constraints

- Spec §12 of `docs/superpowers/specs/2026-07-05-songul-v04-v05-sync-collab-design.md`.
- IndexedDB v4 (adds `comments`). Deviation from spec noted: comment bbox anchors flash via the existing jump-highlight on tap instead of absolute-positioned pins (same affordance, no canvas-transform math).
- Viewer local removal must NEVER emit ops and must purge that notebook's oplog rows (a stray op for a foreign notebook would poison every push batch).
- All new UI gated on `cloudConfigured()`; bilingual copy; commits per task; PowerShell 5.1 rules as before.

---

### Task 1: Comments data layer (DB v4 + capture + apply + purge)

**Files:**
- Modify: `src/types.ts`, `src/db.ts`, `src/sync/ops.ts`
- Test: `src/sync/__tests__/comments.test.ts`

**Interfaces produced:**
- `Comment { id, notebookId, pageId, bbox: BBox | null, text, authorEmail, createdAt }` (types.ts)
- db.ts: `addComment(c: Comment)` (captures `ADD_COMMENT`), `listCommentsByPage(pageId)`, `listCommentsByNotebook(notebookId)`, `purgeNotebookLocal(id)` (silent physical delete of nb/pages/strokes/images/feedback/recognition/comments), `deleteOpsForNotebook(notebookId)`.
- ops.ts: `OpPayloads['ADD_COMMENT'] = { comment: Comment }`; `applyOp` ADD_COMMENT = put-if-absent.

- [ ] Step 1: failing tests — capture on addComment; apply put-if-absent (no dupe, no re-capture); purgeNotebookLocal removes all rows AND that notebook's ops while leaving other notebooks alone.
- [ ] Step 2: types.ts `Comment`; db.ts v4 upgrade `comments` store (keyPath `id`, indexes `by-page`, `by-notebook`), CRUD + purge helpers; ops.ts payload + apply case (replace the Phase-4 quiet-ignore branch).
- [ ] Step 3: green (new tests + full suite + build), commit `feat(collab): comments store synced as append-only ops (DB v4)`.

---

### Task 2: Server SQL — sharing (tokens, RPCs, role-aware op policy)

**Files:** `docs/SUPABASE_SETUP.md` (append "v0.5 — Sharing & comments" run-once section)

```sql
create table public.share_tokens (
  token uuid primary key default gen_random_uuid(),
  notebook_id text not null references public.notebook_sync (notebook_id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.share_tokens enable row level security;
grant select, insert, delete on public.share_tokens to authenticated;
create policy "tokens owner all" on public.share_tokens
  for all to authenticated
  using (exists (select 1 from public.notebook_sync s
                 where s.notebook_id = share_tokens.notebook_id
                   and s.owner_id = (select auth.uid())))
  with check (created_by = (select auth.uid()));

create or replace function public.add_member_by_email(nb text, member_email text, member_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if not exists (select 1 from public.notebook_sync s where s.notebook_id = nb and s.owner_id = auth.uid()) then
    raise exception 'only the owner can invite';
  end if;
  if member_role not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  select id into target from auth.users where lower(email) = lower(member_email) limit 1;
  if target is null then raise exception 'no account with that email'; end if;
  insert into public.notebook_members (notebook_id, user_id, role)
    values (nb, target, member_role)
    on conflict (notebook_id, user_id) do update set role = excluded.role;
end; $$;
revoke execute on function public.add_member_by_email from public, anon;
grant execute on function public.add_member_by_email to authenticated;

create or replace function public.redeem_share_token(t uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare tok record;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into tok from public.share_tokens where token = t;
  if tok is null then raise exception 'invalid or revoked link'; end if;
  insert into public.notebook_members (notebook_id, user_id, role)
    values (tok.notebook_id, auth.uid(), tok.role)
    on conflict (notebook_id, user_id) do nothing;
  return tok.notebook_id;
end; $$;
revoke execute on function public.redeem_share_token from public, anon;
grant execute on function public.redeem_share_token to authenticated;

create or replace function public.list_members(nb text)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role
  from public.notebook_members m join auth.users u on u.id = m.user_id
  where m.notebook_id = nb and public.is_member(nb);
$$;
revoke execute on function public.list_members from public, anon;
grant execute on function public.list_members to authenticated;

create or replace function public.remove_member(nb text, member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.notebook_sync s where s.notebook_id = nb and s.owner_id = auth.uid())
     and member <> auth.uid() then
    raise exception 'not allowed';
  end if;
  delete from public.notebook_members where notebook_id = nb and user_id = member and role <> 'owner';
end; $$;
revoke execute on function public.remove_member from public, anon;
grant execute on function public.remove_member to authenticated;

-- viewers may write comments only
drop policy "ops insert writer" on public.sync_ops;
create policy "ops insert writer" on public.sync_ops
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.notebook_members m
                where m.notebook_id = sync_ops.notebook_id
                  and m.user_id = (select auth.uid())
                  and (m.role in ('owner', 'editor')
                       or (m.role = 'viewer' and sync_ops.op_type = 'ADD_COMMENT')))
  );
```

- [ ] Step 1: append section; commit `docs(collab): v0.5 sharing SQL (tokens, invite/redeem RPCs, viewer comment policy)`.

---

### Task 3: share client module + roles map in engine

**Files:**
- Create: `src/cloud/share.ts`; Modify: `src/sync/engine.ts`; Test: `src/cloud/__tests__/share.test.ts` (+ extend fakeServer with `rpc`)

**Interfaces produced:**
- share.ts: `listMembers(nbId): Promise<{user_id, email, role}[]>`, `addMemberByEmail(nbId, email, role)`, `removeMember(nbId, userId)`, `createShareLink(nbId, role): Promise<string>` (inserts token row via `.from('share_tokens').insert(...).select()`, returns `https://son-gul-web-ui.vercel.app/#share=<token>`), `redeemShareToken(token): Promise<string>` — thin `supabase().rpc(...)` wrappers that throw on error.
- engine.ts: `memberNotebookIds` renamed to return `{ id, role }[]`; `doSync` writes `notebookRoles` setting (`Record<notebookId, 'owner'|'editor'|'viewer'>`); export `async function roleFor(notebookId): Promise<Role>` reading the setting (default `'owner'`).

- [ ] Step 1: failing tests — rpc wrappers pass args/propagate errors (mock `rpc`); engine writes `notebookRoles` from membership rows (fakeServer members seeded with roles).
- [ ] Step 2: implement; fakeServer gains `rpc(name, args)` recorder + members rows carry roles.
- [ ] Step 3: green + full suite + build; commit `feat(collab): share client (invites, links) + role map from sync`.

---

### Task 4: Editor — read-only mode + comments panel

**Files:** `src/App.tsx`, `src/components/EditorScreen.tsx`, `src/components/CommentsPanel.tsx` (new), `src/styles.css`

- App passes `role` to EditorScreen: LibraryScreen `onOpen(nb)` unchanged — App looks up `roleFor(nb.id)` before rendering? Simpler: EditorScreen fetches its own role in a mount effect (`roleFor(notebook.id)` → state, default 'owner'); `readOnly = role === 'viewer'`.
- Read-only enforcement: early-return guards in every mutating handler (stroke commit, erase/lasso ops, page add/dup/delete/reorder, PDF import, practice pages); toolbar gets `disabled` visual + a `읽기 전용 · view only` badge in the header; Export stays.
- CommentsPanel: side panel (same pattern as FeedbackPanel) listing `listCommentsByPage(currentPage.id)` (author, time, text, "📍 보기" flashes bbox via the existing jump mechanism when present); composer (textarea + add) enabled for all roles when signed in; `addComment` uses lasso-selection bbox when active else null, `authorEmail` from `currentUser()`; after add → `noteLocalMutation()`.
- Header button `💬 댓글` with count badge; panel refresh on page change and after sync.

- [ ] Step 1: implement; Step 2: `npm test` + build + dev-server smoke (unconfigured: no comments button when signed out? — comments require cloud, gate button on `cloudConfigured()`); Step 3: commit `feat(collab): read-only viewer mode + comments panel`.

---

### Task 5: Library share dialog, shared badges, link redemption

**Files:** `src/components/LibraryScreen.tsx`, `src/components/ShareDialog.tsx` (new), `src/App.tsx`, `src/styles.css`

- Notebook card menu gains `공유 · Share…` (only when `roleFor(nb.id)` resolves owner + signed in + configured) → ShareDialog: members list (email/role/remove), invite form (email + role select + Add), link section (role select + "Create link" → readonly input with URL + Copy via `navigator.clipboard`).
- Non-owner notebooks: card shows `shared · <role>` chip; menu replaces Delete with `내 서재에서 제거 · Remove from my library` → confirm → `removeMember(nb.id, myUserId)` + `db.purgeNotebookLocal(nb.id)` + drop its `syncCursors`/`notebookRoles` entries.
- Owner delete keeps v0.4 tombstone semantics; confirm copy warns "deletes for everyone you shared with".
- App.tsx boot: if `location.hash` starts `#share=` — when signed in, `redeemShareToken(token)` → clear hash → `syncNow()` → alert success (notebook appears via pull); when signed out, alert "로그인 후 링크를 다시 열어주세요 · Sign in, then open the link again" (hash left intact).

- [ ] Step 1: implement; Step 2: tests + build + browser smoke (unconfigured: no Share menu item, no chips, zero console errors); Step 3: commit `feat(collab): share dialog, shared-with-me library, link redemption`.

---

### Task 6: v0.5.0 + full verification

- [ ] package.json → 0.5.0; full pipeline (test/build/cap sync/assembleDebug); built-bundle version grep; browser regression smoke; commit `chore(release): v0.5.0 - collaboration phase complete`; memory update (phase 5 shipped; user must run v0.5 SQL; live two-account test = user step).
