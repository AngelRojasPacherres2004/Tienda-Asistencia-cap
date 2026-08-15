alter table public.dashboard_users
  add column if not exists active_session_id uuid,
  add column if not exists session_claimed_at timestamptz,
  add column if not exists session_seen_at timestamptz;

comment on column public.dashboard_users.active_session_id is
  'Session ID autorizada para el dashboard. El inicio más reciente reemplaza la sesión anterior.';

drop policy if exists "active users can read dashboard releases" on public.dashboard_releases;
create policy "active session can read dashboard releases"
on public.dashboard_releases for select to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "active users can read dashboard files" on public.dashboard_files;
create policy "active session can read dashboard files"
on public.dashboard_files for select to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "active users can read private dashboard objects" on storage.objects;
create policy "active session can read private dashboard objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);
