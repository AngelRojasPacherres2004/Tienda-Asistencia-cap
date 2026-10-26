-- Instantáneas de inventario para responder consultas acotadas del dashboard.
-- Cada corte se carga completo antes de quedar disponible para lectura.
create table if not exists public.dashboard_stock_snapshots (
  stock_cutoff date primary key,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count >= 0),
  status text not null default 'loading' check (status in ('loading', 'ready')),
  created_at timestamptz not null default now(),
  ready_at timestamptz
);

create table if not exists public.dashboard_stock_catalog (
  stock_cutoff date not null references public.dashboard_stock_snapshots(stock_cutoff) on delete cascade,
  product_id text not null,
  product_code text not null default '',
  product text not null,
  category text not null,
  line text not null,
  subline text not null,
  brand text not null,
  primary key (stock_cutoff, product_id)
);

create index if not exists dashboard_stock_catalog_hierarchy_idx
  on public.dashboard_stock_catalog (stock_cutoff, category, line, subline, product_id);

create table if not exists public.dashboard_stock_metrics (
  stock_cutoff date not null,
  store_id text not null,
  product_id text not null,
  stock_units double precision not null,
  stock_value double precision not null,
  good_units double precision not null,
  merma_stock_units double precision not null,
  desmedro_stock_units double precision not null,
  units30 double precision not null,
  sales30 double precision not null,
  units12 double precision not null,
  sales12 double precision not null,
  units60 double precision not null default 0,
  units90 double precision not null default 0,
  merma30 double precision not null default 0,
  merma60 double precision not null default 0,
  merma90 double precision not null default 0,
  primary key (stock_cutoff, store_id, product_id),
  foreign key (stock_cutoff, product_id)
    references public.dashboard_stock_catalog(stock_cutoff, product_id) on delete cascade
);

create index if not exists dashboard_stock_metrics_product_idx
  on public.dashboard_stock_metrics (stock_cutoff, product_id, store_id);

alter table public.dashboard_stock_snapshots enable row level security;
alter table public.dashboard_stock_catalog enable row level security;
alter table public.dashboard_stock_metrics enable row level security;
revoke all on public.dashboard_stock_snapshots from anon, authenticated;
revoke all on public.dashboard_stock_catalog from anon, authenticated;
revoke all on public.dashboard_stock_metrics from anon, authenticated;
grant select, insert, update, delete on public.dashboard_stock_snapshots to service_role;
grant select, insert, update, delete on public.dashboard_stock_catalog to service_role;
grant select, insert, update, delete on public.dashboard_stock_metrics to service_role;

comment on table public.dashboard_stock_snapshots is
  'Cortes completos y validados de stock comercial; solo el backend consulta cortes ready.';
