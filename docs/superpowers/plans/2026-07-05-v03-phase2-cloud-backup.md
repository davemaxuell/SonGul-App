# SonGul v0.3 Phase 2 — Supabase Accounts & Cloud Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email/password accounts + whole-notebook `.songul` backup/restore via Supabase (Storage bucket + Postgres manifest, RLS), with auto-backup on notebook close and in-app account deletion.

**Architecture:** A thin `src/cloud/` layer wraps `@supabase/supabase-js` behind a `cloudConfigured()` gate (env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; everything degrades to hints when unset). Backups reuse the existing `.songul` bundle exporter/importer verbatim; restore is always import-as-copy (the importer remaps ids by design). A pending queue in IndexedDB retries failed/offline auto-backups. Server-side setup ships as SQL in `docs/SUPABASE_SETUP.md` — the user runs it once in the dashboard SQL editor.

**Tech Stack:** @supabase/supabase-js v2 (new runtime dep), existing Vite/React/TS + vitest.

## Global Constraints

- `npm run build` and `npx vitest run` must pass after every task; commit after every task.
- No secrets in the repo: `.env` is gitignored; `.env.example` documents the two vars. The anon/publishable key is safe to embed at build time; the service-role key is never used client-side.
- RLS pattern (per Supabase security checklist): policies use `TO authenticated` + `(select auth.uid()) = user_id`; UPDATE has both USING and WITH CHECK; storage upsert needs INSERT+SELECT+UPDATE policies; `delete_user()` is SECURITY DEFINER with an `auth.uid() is null` guard, EXECUTE revoked from anon/public.
- All cloud UI must render a graceful "not configured" state so the app works before keys exist.

---

### Task 1: Cloud client + config gate

**Files:**
- Modify: `package.json` (dep), `.gitignore` (`.env`), `src/vite-env.d.ts`
- Create: `.env.example`, `src/cloud/supabase.ts`, `src/cloud/useCloudUser.ts`

**Interfaces (produced, used by later tasks):**
- `cloudConfigured(): boolean`; `supabase(): SupabaseClient` (throws when unconfigured)
- `signUp(email, password)`, `signIn(email, password)`, `signOut()`, `currentUser(): Promise<User | null>`, `onAuthChange(cb): () => void`, `deleteAccount(): Promise<void>` (rpc `delete_user` then signOut)
- React hook `useCloudUser(): User | null`

- [ ] **Step 1:** `npm install @supabase/supabase-js`
- [ ] **Step 2:** Add `.env` to `.gitignore`; create `.env.example`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
```

- [ ] **Step 3:** Augment `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4:** Create `src/cloud/supabase.ts`:

```ts
// Cloud gate: all Supabase access goes through here. When the env vars are
// absent the app runs fully local (every cloud surface shows a hint instead).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function cloudConfigured(): boolean {
  return Boolean(url && key);
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error('Cloud backup is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  if (!client) client = createClient(url, key);
  return client;
}

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signUp({ email, password });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase().auth.signOut();
  if (error) throw error;
}

export async function currentUser(): Promise<User | null> {
  if (!cloudConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!cloudConfigured()) return () => {};
  const { data } = supabase().auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

/** In-app account deletion (Play policy). Server side: `delete_user` RPC. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase().rpc('delete_user');
  if (error) throw error;
  await supabase().auth.signOut();
}
```

- [ ] **Step 5:** Create `src/cloud/useCloudUser.ts`:

```ts
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { cloudConfigured, currentUser, onAuthChange } from './supabase';

export function useCloudUser(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!cloudConfigured()) return;
    void currentUser().then(setUser);
    return onAuthChange(setUser);
  }, []);
  return user;
}
```

- [ ] **Step 6:** `npx vitest run` + `npm run build` pass → commit `feat(cloud): supabase client gate + auth helpers`.

---

### Task 2: Server setup doc (`docs/SUPABASE_SETUP.md`)

**Files:** Create: `docs/SUPABASE_SETUP.md`

- [ ] **Step 1:** Write the doc with: project creation steps, where to find URL/key, `.env` instructions, the full SQL below (run in dashboard SQL editor), and the auth note (Auth → Sign In/Up → Email: either disable "Confirm email" for personal use or expect confirmation emails; built-in email is rate-limited).

```sql
-- SonGul cloud backup schema (run once in the SQL editor)

-- 1. Manifest table -------------------------------------------------------
create table public.backups (
  user_id uuid not null references auth.users (id) on delete cascade,
  notebook_id text not null,
  title text not null default '',
  page_count integer not null default 0,
  size_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  device_name text not null default '',
  primary key (user_id, notebook_id)
);

alter table public.backups enable row level security;

-- newer projects don't auto-expose tables to the Data API
grant select, insert, update, delete on table public.backups to authenticated;

create policy "backups select own" on public.backups
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "backups insert own" on public.backups
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "backups update own" on public.backups
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "backups delete own" on public.backups
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 2. Private storage bucket ----------------------------------------------
insert into storage.buckets (id, name, public) values ('backups', 'backups', false);

-- upsert needs INSERT + SELECT + UPDATE; path is {userId}/{notebookId}.songul
create policy "backup objects select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'backups' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "backup objects insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'backups' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "backup objects update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'backups' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'backups' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "backup objects delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'backups' and (select auth.uid())::text = (storage.foldername(name))[1]);

-- 3. In-app account deletion ----------------------------------------------
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from storage.objects
    where bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;
```

- [ ] **Step 2:** Commit `docs: supabase setup guide (schema, RLS, storage, delete_user)`.

---

### Task 3: Backup core (`src/cloud/backup.ts`)

**Files:**
- Create: `src/cloud/backup.ts`
- Modify: `src/bundle.ts:75` (loosen `importBundle(file: File)` → `importBundle(file: Blob)` — it only calls `.text()`; `File extends Blob` so existing callers are unaffected)
- Test: `src/cloud/__tests__/backup.test.ts` (pure helpers only — network functions aren't unit-tested)

**Interfaces:**
- `CloudBackupRow { user_id, notebook_id, title, page_count, size_bytes, updated_at, device_name }`
- `backupPath(userId, notebookId): string`; `deviceName(): string`
- `backupNotebook(nb: Notebook)`, `listCloudBackups(): Promise<CloudBackupRow[]>`, `restoreBackup(row): Promise<Notebook>`, `deleteBackup(row)`, `autoBackupOnClose(nb, enabled)` (queues on failure — consumes Task 4's `queueBackup`)

- [ ] **Step 1:** Loosen the importer signature in `src/bundle.ts`:

```ts
export async function importBundle(file: Blob): Promise<Notebook> {
```

- [ ] **Step 2:** Failing test `src/cloud/__tests__/backup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backupPath, deviceName } from '../backup';

describe('backup helpers', () => {
  it('builds the storage object path', () => {
    expect(backupPath('u1', 'nb1')).toBe('u1/nb1.songul');
  });
  it('names the device from the user agent', () => {
    expect(typeof deviceName()).toBe('string');
    expect(deviceName().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3:** Implement `src/cloud/backup.ts`:

```ts
// Whole-notebook snapshot backup to Supabase Storage + manifest table.
// Restore is always import-as-copy (the bundle importer remaps ids).
import type { Notebook } from '../types';
import * as db from '../db';
import { exportBundle, importBundle } from '../bundle';
import { cloudConfigured, currentUser, supabase } from './supabase';
import { queueBackup } from './queue';

export interface CloudBackupRow {
  user_id: string;
  notebook_id: string;
  title: string;
  page_count: number;
  size_bytes: number;
  updated_at: string;
  device_name: string;
}

export function backupPath(userId: string, notebookId: string): string {
  return `${userId}/${notebookId}.songul`;
}

export function deviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android tablet';
  if (/iPad|iPhone/i.test(ua)) return 'iPad/iPhone';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'device';
}

export async function backupNotebook(nb: Notebook): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('로그인 후 백업할 수 있어요. Sign in to back up.');
  const blob = await exportBundle(nb.id);
  const path = backupPath(user.id, nb.id);
  const { error: upErr } = await supabase()
    .storage.from('backups')
    .upload(path, blob, { upsert: true, contentType: 'application/json' });
  if (upErr) throw upErr;
  const pages = await db.listPages(nb.id);
  const row: CloudBackupRow = {
    user_id: user.id,
    notebook_id: nb.id,
    title: nb.title,
    page_count: pages.length,
    size_bytes: blob.size,
    updated_at: new Date().toISOString(),
    device_name: deviceName(),
  };
  const { error: rowErr } = await supabase()
    .from('backups')
    .upsert(row, { onConflict: 'user_id,notebook_id' });
  if (rowErr) throw rowErr;
}

export async function listCloudBackups(): Promise<CloudBackupRow[]> {
  const { data, error } = await supabase()
    .from('backups')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudBackupRow[];
}

export async function restoreBackup(row: CloudBackupRow): Promise<Notebook> {
  const user = await currentUser();
  if (!user) throw new Error('Sign in to restore.');
  const { data, error } = await supabase()
    .storage.from('backups')
    .download(backupPath(user.id, row.notebook_id));
  if (error || !data) throw error ?? new Error('Download failed');
  return importBundle(data);
}

export async function deleteBackup(row: CloudBackupRow): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error('Sign in first.');
  const { error: objErr } = await supabase()
    .storage.from('backups')
    .remove([backupPath(user.id, row.notebook_id)]);
  if (objErr) throw objErr;
  const { error } = await supabase().from('backups').delete().eq('notebook_id', row.notebook_id);
  if (error) throw error;
}

/** Silent auto-backup on notebook close; failures land in the retry queue. */
export async function autoBackupOnClose(nb: Notebook, enabled: boolean): Promise<void> {
  if (!enabled || !cloudConfigured()) return;
  const user = await currentUser();
  if (!user) return;
  try {
    await backupNotebook(nb);
  } catch {
    await queueBackup(nb.id);
  }
}
```

- [ ] **Step 4:** Tests + build pass → commit `feat(cloud): notebook backup/restore/delete against supabase`.

---

### Task 4: Pending-backup queue (`src/cloud/queue.ts`)

**Files:**
- Create: `src/cloud/queue.ts`
- Test: `src/cloud/__tests__/queue.test.ts`

**Interfaces:** `pendingBackups(): Promise<string[]>`, `queueBackup(notebookId)`, `flushPending(run: (id: string) => Promise<void>): Promise<number>` (skips when offline; failed ids stay queued).

> Build order note: Task 3's `backup.ts` imports `queueBackup` — write this file in the same commit if the compiler complains, or accept the two-task order as one working tree (Task 3 committed after this file exists). Simplest: create `queue.ts` **before** committing Task 3; commit both in their own commits with queue first if needed.

- [ ] **Step 1:** Failing test `src/cloud/__tests__/queue.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { flushPending, pendingBackups, queueBackup } from '../queue';

describe('pending backup queue', () => {
  it('queues without duplicates and flushes successes', async () => {
    await queueBackup('nb1');
    await queueBackup('nb1');
    await queueBackup('nb2');
    expect(await pendingBackups()).toEqual(['nb1', 'nb2']);
    const done = await flushPending(async (id) => {
      if (id === 'nb2') throw new Error('still failing');
    });
    expect(done).toBe(1);
    expect(await pendingBackups()).toEqual(['nb2']);
  });
});
```

- [ ] **Step 2:** Implement `src/cloud/queue.ts`:

```ts
// Auto-backups that failed (offline, server hiccup) wait here and retry
// when the library loads or connectivity returns.
import * as db from '../db';

const KEY = 'pendingBackups';

export async function pendingBackups(): Promise<string[]> {
  return (await db.getSetting<string[]>(KEY)) ?? [];
}

export async function queueBackup(notebookId: string): Promise<void> {
  const cur = await pendingBackups();
  if (!cur.includes(notebookId)) await db.setSetting(KEY, [...cur, notebookId]);
}

export async function flushPending(run: (notebookId: string) => Promise<void>): Promise<number> {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) return 0;
  const cur = await pendingBackups();
  if (cur.length === 0) return 0;
  let done = 0;
  const remaining: string[] = [];
  for (const id of cur) {
    try {
      await run(id);
      done++;
    } catch {
      remaining.push(id);
    }
  }
  await db.setSetting(KEY, remaining);
  return done;
}
```

- [ ] **Step 3:** Tests + build pass → commit `feat(cloud): offline retry queue for auto-backups`.

---

### Task 5: Settings — Account panel + auto-backup toggle

**Files:**
- Modify: `src/types.ts` (Settings + `autoBackup: boolean`, default `false`)
- Modify: `src/components/SettingsDialog.tsx`

**Interfaces:** consumes Task 1 (`useCloudUser`, `signUp/signIn/signOut/deleteAccount`, `cloudConfigured`).

- [ ] **Step 1:** `types.ts`: add `/** auto-backup notebooks to the cloud on close (needs sign-in) */ autoBackup: boolean;` to `Settings` and `autoBackup: false` to `DEFAULT_SETTINGS`.
- [ ] **Step 2:** In `SettingsDialog.tsx`, add imports (`useCloudUser`, auth fns, `cloudConfigured`) and an Account block before the Handwriting-recognition block:
  - `!cloudConfigured()` → hint: "Cloud backup isn't configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and rebuild — see docs/SUPABASE_SETUP.md."
  - Signed out → email + password fields, "Sign in" and "Create account" buttons, error line.
  - Signed in → show email, "Sign out" button, and a danger "Delete account & cloud backups" button behind `window.confirm` (explains local notes stay).
  - Auto-backup settings row (switch bound to `settings.autoBackup`, disabled hint when not configured/signed out).
- [ ] **Step 3:** Tests + build + browser smoke (shows not-configured hint) → commit `feat(settings): account panel + auto-backup toggle`.

---

### Task 6: Library — Back up / Cloud backups UI + queue flush

**Files:**
- Modify: `src/components/LibraryScreen.tsx`, `src/styles.css` (append)

- [ ] **Step 1:** Add imports (`useCloudUser`, `cloudConfigured`, backup fns, queue fns) and state: `cloudOpen`, `cloudRows: CloudBackupRow[]`, `cloudBusy: string | null`.
- [ ] **Step 2:** Notebook ⋯ menu gets "Back up to cloud" (rendered when `cloudConfigured() && user`): calls `backupNotebook(nb)` with busy overlay + `alert` on error.
- [ ] **Step 3:** Header actions get a "Cloud" button (when configured): opens a `Modal` listing `listCloudBackups()` rows — title, `page_count` pages, `Math.round(size_bytes/1024)` KB, date, device — with per-row **Restore** (downloads → `importBundle` → refresh, opens restored notebook) and **Delete** (confirm → `deleteBackup` → refresh list). Empty/signed-out states show hints.
- [ ] **Step 4:** Queue flush on mount + reconnect (inside the component):

```ts
useEffect(() => {
  if (!cloudConfigured()) return;
  const flush = () =>
    void flushPending(async (id) => {
      const nb = await db.getNotebook(id);
      if (nb) await backupNotebook(nb);
    });
  flush();
  window.addEventListener('online', flush);
  return () => window.removeEventListener('online', flush);
}, []);
```

- [ ] **Step 5:** Append `.cloud-*` styles (list rows mirror `.search-hit` look). Tests + build + browser smoke → commit `feat(library): cloud backup & restore UI with retry flush`.

---

### Task 7: Editor — auto-backup on close

**Files:**
- Modify: `src/components/EditorScreen.tsx` (back button handler)

- [ ] **Step 1:** Import `autoBackupOnClose` from `../cloud/backup`; change the back button to:

```tsx
onClick={() => {
  void autoBackupOnClose(notebook, settings.autoBackup);
  onBack();
}}
```

(fire-and-forget; everything is already persisted to IndexedDB, so the export reads consistent data even after unmount).

- [ ] **Step 2:** Tests + build → commit `feat(editor): silent auto-backup on notebook close`.

---

### Task 8: Phase 2 verification & docs

- [ ] **Step 1:** `npx vitest run`, `npm run build`, `npx cap sync android`, `gradlew.bat assembleDebug` — all green.
- [ ] **Step 2:** Browser smoke: Settings shows account block (not-configured hint), library shows Cloud button behavior, editor unchanged, no console errors.
- [ ] **Step 3:** Update `docs/PRODUCT_SPEC.md` milestone table: change the M9–M11 row to note M9 subset shipped (`✅ v0.3: Supabase email/password accounts + whole-notebook cloud backup/restore + account deletion (backup&restore subset; delta sync still deferred)` — keep M10/M11 ❌).
- [ ] **Step 4:** Commit `chore: v0.3 phase 2 verification — cloud backup shipped`.

**User steps (one-time):** create the Supabase project, run `docs/SUPABASE_SETUP.md` SQL, put URL + anon/publishable key in `.env`, rebuild (`npm run build` / `npx cap sync android` + gradle) — cloud features light up.
