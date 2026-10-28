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

-- La clave es derivada: se indexa la expresión y se expone mediante una vista
-- para no repetirla físicamente en las 265 mil filas del catálogo. No se
-- elimina una posible columna heredada sin verificar antes sus consumidores.

create unique index if not exists productos_codigo_portal_id_ux
  on public.productos (public.codigo_portal_producto(codigo_nissei));

create or replace view public.productos_codigos_portal
with (security_invoker = true)
as
select
  public.codigo_portal_producto(codigo_nissei) as codigo_portal_id,
  codigo_nissei
from public.productos;

revoke all on table public.productos_codigos_portal from public, anon, authenticated;
grant select on table public.productos_codigos_portal to service_role;

comment on view public.productos_codigos_portal is
  'Resuelve identificadores comerciales anonimizados mediante un indice funcional, sin duplicarlos en public.productos.';

-- Migra las credenciales operativas heredadas sin imprimirlas ni exponerlas.
-- !SIN_ACCESO! es un marcador deliberado y no representa una contrasena.
update public.usuarios
set password = crypt(password, gen_salt('bf', 12))
where password is not null
  and password <> '!SIN_ACCESO!'
  and password !~ '^\$2[aby]\$';
