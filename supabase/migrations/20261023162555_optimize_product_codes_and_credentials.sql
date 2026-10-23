-- Evita recorrer todo el catalogo para resolver los IDs anonimizados que usa
-- el dashboard comercial. La expresion replica catalogProductId() de Node.
create or replace function public.codigo_portal_producto(valor text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select 'P_' || upper(substr(encode(digest(
    convert_to(
      regexp_replace(
        upper(regexp_replace(btrim(valor), '[[:space:]]+', ' ', 'g')),
        '\.0+$',
        ''
      ),
      'UTF8'
    ),
    'sha256'
  ), 'hex'), 1, 16));
$$;

revoke all on function public.codigo_portal_producto(text) from public, anon, authenticated;
grant execute on function public.codigo_portal_producto(text) to service_role;

alter table public.productos
  add column if not exists codigo_portal_id text generated always as (
    public.codigo_portal_producto(codigo_nissei)
  ) stored;

create unique index if not exists productos_codigo_portal_id_ux
  on public.productos (codigo_portal_id);

comment on column public.productos.codigo_portal_id is
  'Identificador SHA-256 abreviado usado por los artefactos comerciales para resolver un codigo sin escanear el catalogo.';

-- Migra las credenciales operativas heredadas sin imprimirlas ni exponerlas.
-- !SIN_ACCESO! es un marcador deliberado y no representa una contrasena.
update public.usuarios
set password = crypt(password, gen_salt('bf', 12))
where password is not null
  and password <> '!SIN_ACCESO!'
  and password !~ '^\$2[aby]\$';
