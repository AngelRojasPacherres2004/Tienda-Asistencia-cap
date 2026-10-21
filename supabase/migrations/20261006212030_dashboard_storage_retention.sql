drop policy if exists "admins can delete dashboard releases" on public.dashboard_releases;
create policy "admins can delete dashboard releases"
on public.dashboard_releases for delete
to authenticated
using (
  exists (
    select 1
    from public.dashboard_users
    where user_id = (select auth.uid())
      and is_active = true
      and role = 'admin'
  )
);

drop policy if exists "admins can delete private dashboard objects" on storage.objects;
create policy "admins can delete private dashboard objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1
    from public.dashboard_users
    where user_id = (select auth.uid())
      and is_active = true
      and role = 'admin'
  )
);

grant delete on table public.dashboard_releases to authenticated;
