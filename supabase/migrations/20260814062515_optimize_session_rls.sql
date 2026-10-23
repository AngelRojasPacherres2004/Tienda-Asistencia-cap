drop policy if exists "active session can read dashboard releases" on public.dashboard_releases;
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

drop policy if exists "active session can read dashboard files" on public.dashboard_files;
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

drop policy if exists "active session can read private dashboard objects" on storage.objects;
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
