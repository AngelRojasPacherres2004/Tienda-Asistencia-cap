create table public.commercial_transfer_items (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,
  tienda_origen text not null references public.commercial_store_map(dashboard_store_id),
  tienda_destino text not null references public.commercial_store_map(dashboard_store_id),
  producto_id text not null,
  codigo_producto text not null default '',
  producto text not null,
  talla text not null default '',
  cantidad integer not null check (cantidad > 0),
  numero_guia text not null default '' check (length(numero_guia) <= 80),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'validado')),
  creado_por integer not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  validado_por integer references public.usuarios(id),
  validado_en timestamptz,
  constraint transfer_distinct_stores check (tienda_origen <> tienda_destino),
  constraint transfer_guide_requires_validation check (estado = 'validado' or numero_guia = ''),
  constraint transfer_validation_complete check (
    (estado = 'pendiente' and validado_por is null and validado_en is null)
    or (estado = 'validado' and validado_por is not null and validado_en is not null)
  ),
  unique (grupo_id, tienda_origen, tienda_destino, producto_id)
);
create index commercial_transfer_items_origin_created_idx on public.commercial_transfer_items(tienda_origen, creado_en desc);
alter table public.commercial_transfer_items enable row level security;
revoke all on public.commercial_transfer_items from anon, authenticated;
grant select, insert, update on public.commercial_transfer_items to service_role;
comment on table public.commercial_transfer_items is 'Una fila por producto y origen dentro de un grupo destinado a una tienda. Acceso por API con sesión y alcance de tienda; guía habilitada tras validación.';
