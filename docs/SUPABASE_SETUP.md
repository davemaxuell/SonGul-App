# SonGul — Supabase Cloud Backup Setup (one-time)

The app's cloud features (accounts, notebook backup/restore) run against a free
Supabase project that **you** own. Until this setup is done, the app simply
shows "cloud backup isn't configured" hints and stays fully local.

## 1. Create the project

1. Sign up at <https://supabase.com> (free tier is plenty) and create a project.
2. Open **Project Settings → API** and note:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon / publishable key** (safe to embed in the client app; do **not**
     use the `service_role` / secret key anywhere in this repo)

## 2. Configure the app

Copy `.env.example` to `.env` in the repo root and fill in both values:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
```

Then rebuild — browser: `npm run build` (or restart `npm run dev`); Android:
`npm run build`, `npx cap sync android`, `gradlew.bat assembleDebug`.

## 3. Auth settings (dashboard)

**Authentication → Sign In / Up → Email**: email + password is used as-is.
New projects require email confirmation by default and the built-in mailer is
heavily rate-limited. For personal use, turn **Confirm email** off; otherwise
expect a confirmation mail before first sign-in.

## 4. Run the schema SQL (dashboard → SQL Editor)

Paste and run the whole block once:

```sql
-- SonGul cloud backup schema

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

-- upsert needs INSERT + SELECT + UPDATE; object path is {userId}/{notebookId}.songul
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

-- 3. In-app account deletion (Play policy requirement) ---------------------
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

Notes:
- `backups` manifest rows are removed automatically when the user is deleted
  (FK `on delete cascade`); the function also purges the user's storage objects.
- `delete_user` is `SECURITY DEFINER` on purpose (clients can't delete their
  own `auth.users` row); it only ever acts on `auth.uid()` and is not callable
  anonymously.

## 5. Verify

1. Open the app → Settings → Account → create an account, sign in.
2. Library → a notebook's ⋯ menu → **Back up to cloud**.
3. Library → **Cloud** → the backup row appears; Restore imports a copy.
4. Dashboard → Table Editor → `backups` shows the manifest row; Storage →
   `backups` bucket shows `{userId}/{notebookId}.songul`.

## Semantics (what backup is — and isn't)

Backups are **whole-notebook snapshots, newest wins** — there is no merge.
Restoring always imports a **copy** with fresh internal ids (the app offers to
replace the local original when it's still present). Cross-device delta sync
(v0.4, below) is separate and operation-based.

## v0.4 — Cross-device sync schema (run once, after the v0.3 block)

```sql
-- Registry of synced notebooks (created automatically on first push)
create table public.notebook_sync (
  notebook_id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now()
);

-- Membership (v0.4 writes only the owner row; sharing arrives in v0.5)
create table public.notebook_members (
  notebook_id text not null references public.notebook_sync (notebook_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (notebook_id, user_id)
);

-- The op stream. server_seq gives one total order all devices replay.
create table public.sync_ops (
  notebook_id text not null references public.notebook_sync (notebook_id) on delete cascade,
  server_seq bigint generated always as identity,
  op_id text not null unique,
  author_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  op_type text not null,
  payload jsonb not null,
  client_ts bigint not null,
  created_at timestamptz not null default now(),
  primary key (notebook_id, server_seq)
);
create index sync_ops_pull on public.sync_ops (notebook_id, server_seq);

alter table public.notebook_sync enable row level security;
alter table public.notebook_members enable row level security;
alter table public.sync_ops enable row level security;
grant select, insert, update, delete on public.notebook_sync to authenticated;
grant select, insert, update, delete on public.notebook_members to authenticated;
grant select, insert on public.sync_ops to authenticated;

create or replace function public.is_member(nb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notebook_members m
    where m.notebook_id = nb and m.user_id = auth.uid()
  );
$$;

create policy "sync registry select member" on public.notebook_sync
  for select to authenticated using (public.is_member(notebook_id));
create policy "sync registry insert own" on public.notebook_sync
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "members select own notebooks" on public.notebook_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_member(notebook_id));
create policy "members owner self-insert" on public.notebook_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notebook_sync s
                where s.notebook_id = notebook_members.notebook_id
                  and s.owner_id = (select auth.uid()))
  );
create policy "members delete self" on public.notebook_members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "ops select member" on public.sync_ops
  for select to authenticated using (public.is_member(notebook_id));
create policy "ops insert writer" on public.sync_ops
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.notebook_members m
                where m.notebook_id = sync_ops.notebook_id
                  and m.user_id = (select auth.uid())
                  and m.role in ('owner', 'editor'))
  );
```

Blobs (PDF attachments, page backgrounds, snapshots) reuse the private
`backups` bucket under `{userId}/sync/...` — the v0.3 folder-scoped policies
already cover those paths. Sync is fully client-driven: the app pushes local
ops, pulls newer ones by `server_seq`, and applies them with LWW rules; a
device only ever sees notebooks it is a member of.
