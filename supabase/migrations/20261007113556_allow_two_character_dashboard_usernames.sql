create or replace function public.dashboard_normalize_username()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.usuario := trim(new.usuario);
  new.username_key := lower(new.usuario);
  if new.usuario !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,48}$' then
    raise exception 'El usuario debe tener entre 2 y 49 caracteres: letras, números, punto, guion o guion bajo.';
  end if;
  return new;
end;
$function$;
