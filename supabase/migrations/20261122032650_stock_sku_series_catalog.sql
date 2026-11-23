alter table public.dashboard_stock_catalog
  add column if not exists serie text;

create table if not exists public.dashboard_stock_skus (
  stock_cutoff date not null,
  product_id text not null,
  sku_id text not null,
  product_code text not null,
  serie text,
  primary key (stock_cutoff, product_id, sku_id),
  foreign key (stock_cutoff, product_id)
    references public.dashboard_stock_catalog(stock_cutoff, product_id) on delete cascade
);

create index if not exists dashboard_stock_skus_code_idx
  on public.dashboard_stock_skus (stock_cutoff, product_code);

alter table public.dashboard_stock_skus enable row level security;
revoke all on public.dashboard_stock_skus from anon, authenticated;
grant select, insert, update, delete on public.dashboard_stock_skus to service_role;
