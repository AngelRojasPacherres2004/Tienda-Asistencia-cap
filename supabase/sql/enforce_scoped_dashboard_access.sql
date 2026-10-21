-- Etapa 2. Aplicar SOLO después de publicar y verificar todos los archivos
-- limitados. Esta transacción retira el acceso a JSON globales a zonales y
-- administradores. Los filtros visuales ya no son la barrera de seguridad.
begin;
do $$
declare
  latest_release uuid;
  original_count integer;
  scope_count integer;
  scoped_count integer;
begin
  select id into latest_release from public.dashboard_releases
  where status = 'published' order by published_at desc limit 1;
  if latest_release is null then raise exception 'No hay publicación vigente'; end if;
  select count(*) into original_count from public.dashboard_files where release_id = latest_release;
  select count(distinct (scope_type, scope_value)) into scope_count
  from public.dashboard_scope_files where release_id = latest_release;
  select count(*) into scoped_count from public.dashboard_scope_files where release_id = latest_release;
  if original_count = 0 or scope_count < 20 or scoped_count <> original_count * scope_count then
    raise exception 'Publicación sin alcances completos: % originales, % alcances, % archivos', original_count, scope_count, scoped_count;
  end if;
end $$;

drop policy if exists "active users can read dashboard files" on public.dashboard_files;
drop policy if exists "active session can read dashboard files" on public.dashboard_files;
create policy "only commercial chiefs read global dashboard files"
on public.dashboard_files for select to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    join public.dashboard_roles r on r.code = u.role
    where u.user_id = (select auth.uid()) and u.is_active
      and r.is_active and r.can_access_dashboard and r.scope_type = 'all'
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "active users can read private dashboard objects" on storage.objects;
drop policy if exists "active session can read private dashboard objects" on storage.objects;
create policy "read only authorized commercial objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'dashboard-data' and exists (
    select 1 from public.dashboard_users u
    join public.dashboard_roles r on r.code = u.role
    where u.user_id = (select auth.uid()) and u.is_active
      and r.is_active and r.can_access_dashboard
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
      and (
        r.scope_type = 'all'
        or (
          split_part(name, '/', 2) = 'scoped'
          and split_part(name, '/', 3) = r.scope_type
          and exists (
            select 1 from public.dashboard_user_scopes s
            where s.user_id = u.user_id
              and s.scope_type = r.scope_type
              and s.scope_value = split_part(name, '/', 4)
          )
        )
      )
  )
);
commit;
