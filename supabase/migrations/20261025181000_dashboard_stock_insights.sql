-- Cálculos de salud y reposición sobre el corte vigente; el resultado es pequeño
-- incluso cuando el usuario comercial puede consultar todas las tiendas.
create or replace function public.dashboard_stock_window_total(
  days integer, value30 double precision, value60 double precision, value90 double precision
) returns double precision
language sql immutable parallel safe
as $$
  with window_values as (
    select greatest(1, days) as d,
           greatest(0.0, value30) as v30,
           greatest(greatest(0.0, value30), value60) as v60,
           greatest(greatest(greatest(0.0, value30), value60), value90) as v90
  )
  select case
    when d <= 30 then v30 * d / 30.0
    when d <= 60 then v30 + (v60 - v30) * (d - 30) / 30.0
    when d <= 90 then v60 + (v90 - v60) * (d - 60) / 30.0
    else v90 * d / 90.0
  end from window_values;
$$;

create or replace function public.dashboard_stock_insights(
  p_cutoff date,
  p_store_ids text[],
  p_rubros text[],
  p_lines text[] default '{}'::text[],
  p_sublines text[] default '{}'::text[],
  p_window_days integer default 30,
  p_movement_days integer default 90,
  p_healthy_days integer default 30,
  p_overstock_days integer default 90,
  p_merma_pct double precision default 2,
  p_horizon_days integer default 0
) returns jsonb
language sql stable parallel safe
as $$
  with filtered as materialized (
    select m.store_id, m.product_id, c.product, c.brand,
           m.stock_units, m.stock_value,
           public.dashboard_stock_window_total(p_window_days, m.units30, m.units60, m.units90) as demand_units,
           public.dashboard_stock_window_total(p_movement_days, m.units30, m.units60, m.units90) as movement_units
    from public.dashboard_stock_metrics m
    join public.dashboard_stock_catalog c
      on c.stock_cutoff = m.stock_cutoff and c.product_id = m.product_id
    join public.dashboard_stock_snapshots s
      on s.stock_cutoff = m.stock_cutoff and s.status = 'ready'
    where m.stock_cutoff = p_cutoff
      and m.store_id = any(p_store_ids)
      and c.category = any(p_rubros)
      and (cardinality(p_lines) = 0 or c.line = any(p_lines))
      and (cardinality(p_sublines) = 0 or c.subline = any(p_sublines))
  ), evaluated as materialized (
    select *,
      stock_value * (1 - least(.95, greatest(0, .18 + p_merma_pct / 100.0))) as vendible_value,
      case when demand_units > 0 then
        stock_units * (1 - least(.95, greatest(0, .18 + p_merma_pct / 100.0)))
          / (demand_units / greatest(1, p_window_days))
      end as coverage_days
    from filtered
  ), classified as materialized (
    select *, case
      when movement_units <= 0 then 'SIN ROTACIÓN'
      when coverage_days is null then 'SIN DATOS'
      when coverage_days <= p_healthy_days / 2.0 then 'CRÍTICO'
      when coverage_days <= p_healthy_days then 'ALERTA'
      when coverage_days <= p_overstock_days then 'ÓPTIMO'
      else 'BAJA ROTACIÓN'
    end as status
    from evaluated
  ), projected as materialized (
    select *, case
      when status = 'SIN ROTACIÓN' or coverage_days is null then 'SIN ROTACIÓN'
      when greatest(0, coverage_days - p_horizon_days) <= p_healthy_days / 2.0 then 'CRÍTICO'
      when greatest(0, coverage_days - p_horizon_days) <= p_healthy_days then 'ALERTA'
      when greatest(0, coverage_days - p_horizon_days) <= p_overstock_days then 'ÓPTIMO'
      else 'BAJA ROTACIÓN'
    end as projected_status
    from classified
  ), brands as (
    select coalesce(nullif(brand, ''), 'SIN MARCA') as name,
      sum(stock_units) as "stockUnits", sum(stock_value) as "stockValue",
      sum(demand_units) as "demandUnits", sum(movement_units) as "movementUnits"
    from projected group by 1
  ), health as (
    select status, sum(vendible_value) as value, count(*) as products
    from projected group by status
  ), projection as (
    select projected_status as status, sum(vendible_value) as value, count(*) as products
    from projected group by projected_status
  ), risk as (
    select store_id as "storeId", sum(vendible_value) as "totalValue",
      coalesce(sum(vendible_value) filter (where status <> 'SIN ROTACIÓN'
        and projected_status in ('CRÍTICO', 'ALERTA')), 0) as "riskValue",
      count(*) filter (where status <> 'SIN ROTACIÓN'
        and projected_status in ('CRÍTICO', 'ALERTA')) as "riskProducts",
      count(*) as products
    from projected group by store_id
  ), priority as (
    select store_id as "storeId", product, brand, stock_units as "stockUnits",
      vendible_value as "vendibleValue", projected_status as status,
      greatest(0, coverage_days - p_horizon_days) as "coverageDays",
      case projected_status when 'CRÍTICO' then 0 when 'ALERTA' then 1
        when 'SIN ROTACIÓN' then 2 when 'BAJA ROTACIÓN' then 3
        when 'ÓPTIMO' then 4 else 9 end as status_order
    from projected
    order by status_order, "coverageDays" asc nulls first, vendible_value desc
    limit 5
  )
  select jsonb_build_object(
    'brandRows', coalesce((select jsonb_agg(to_jsonb(b)) from brands b), '[]'::jsonb),
    'healthRows', coalesce((select jsonb_agg(to_jsonb(h)) from health h), '[]'::jsonb),
    'projectionRows', coalesce((select jsonb_agg(to_jsonb(p)) from projection p), '[]'::jsonb),
    'riskRows', coalesce((select jsonb_agg(to_jsonb(r)) from risk r where r."riskValue" > 0), '[]'::jsonb),
    'priorityProducts', coalesce((select jsonb_agg(to_jsonb(p) - 'status_order'
      order by p.status_order, p."coverageDays" asc nulls first, p."vendibleValue" desc) from priority p), '[]'::jsonb),
    'rowCount', (select count(*) from projected)
  );
$$;

revoke all on function public.dashboard_stock_window_total(integer,double precision,double precision,double precision)
  from public, anon, authenticated;
revoke all on function public.dashboard_stock_insights(date,text[],text[],text[],text[],integer,integer,integer,integer,double precision,integer)
  from public, anon, authenticated;
grant execute on function public.dashboard_stock_window_total(integer,double precision,double precision,double precision)
  to service_role;
grant execute on function public.dashboard_stock_insights(date,text[],text[],text[],text[],integer,integer,integer,integer,double precision,integer)
  to service_role;
