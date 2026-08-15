create policy "admins can create dashboard releases"
on public.dashboard_releases for insert
to authenticated
with check (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
);

create policy "admins can update dashboard releases"
on public.dashboard_releases for update
to authenticated
using (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
);

create policy "admins can create dashboard files"
on public.dashboard_files for insert
to authenticated
with check (
  exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
);

create policy "admins can upload private dashboard objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
);

create policy "admins can replace private dashboard objects"
on storage.objects for update
to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
)
with check (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users
    where user_id = (select auth.uid()) and is_active = true and role = 'admin'
  )
);

grant insert, update on table public.dashboard_releases to authenticated;
grant insert on table public.dashboard_files to authenticated;
grant usage, select on sequence public.dashboard_files_id_seq to authenticated;
