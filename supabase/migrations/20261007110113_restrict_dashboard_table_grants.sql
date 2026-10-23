-- Permisos mínimos explícitos para las tablas técnicas del dashboard.
revoke all on table public.dashboard_users from authenticated;
revoke all on table public.dashboard_releases from authenticated;
revoke all on table public.dashboard_files from authenticated;

grant select (
  user_id, display_name, usuario, username_key, cargo, dispositivo, role,
  is_active, active_session_id, session_claimed_at, session_seen_at,
  created_at, updated_at
) on table public.dashboard_users to authenticated;

grant select, delete on table public.dashboard_releases to authenticated;
grant select on table public.dashboard_files to authenticated;
