drop policy if exists "active users can read dashboard releases" on public.dashboard_releases;
drop policy if exists "active users can read dashboard files" on public.dashboard_files;
drop policy if exists "active users can read private dashboard objects" on storage.objects;

create policy "active users can read dashboard releases"
on public.dashboard_releases for select
to authenticated
using (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true
  )
);

create policy "active users can read dashboard files"
on public.dashboard_files for select
to authenticated
using (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true
  )
);

create policy "active users can read private dashboard objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true
  )
);

drop function if exists public.dashboard_user_active();
