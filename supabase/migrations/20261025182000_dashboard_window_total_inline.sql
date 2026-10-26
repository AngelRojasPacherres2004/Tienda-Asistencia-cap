-- Una expresión SQL escalar permite que PostgreSQL inserte el cálculo en el
-- plan del agregado, evitando cientos de miles de llamadas con CTE interno.
create or replace function public.dashboard_stock_window_total(
  days integer, value30 double precision, value60 double precision, value90 double precision
) returns double precision
language sql immutable parallel safe
as $$
  select case
    when greatest(1, days) <= 30 then
      greatest(0.0, value30) * greatest(1, days) / 30.0
    when greatest(1, days) <= 60 then
      greatest(0.0, value30) +
      (greatest(0.0, value30, value60) - greatest(0.0, value30))
        * (greatest(1, days) - 30) / 30.0
    when greatest(1, days) <= 90 then
      greatest(0.0, value30, value60) +
      (greatest(0.0, value30, value60, value90) - greatest(0.0, value30, value60))
        * (greatest(1, days) - 60) / 30.0
    else greatest(0.0, value30, value60, value90) * greatest(1, days) / 90.0
  end;
$$;

revoke all on function public.dashboard_stock_window_total(integer,double precision,double precision,double precision)
  from public, anon, authenticated;
grant execute on function public.dashboard_stock_window_total(integer,double precision,double precision,double precision)
  to service_role;
