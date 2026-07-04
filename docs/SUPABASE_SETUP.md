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
is a future milestone (plan.md M9) and will build on this same manifest.
