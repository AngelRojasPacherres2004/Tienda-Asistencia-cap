"""Compare the bounded Postgres chart query with the source stock JSON."""

from __future__ import annotations

import json
import math
import getpass
import sys
import time
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "piplines"))
from compactar_dashboard import descompactar_predictivo  # noqa: E402

DATA = ROOT / "dashboard-data"


def window_total(days: int, value30: float, value60: float, value90: float) -> float:
    value30 = max(0, value30)
    value60 = max(value30, value60)
    value90 = max(value60, value90)
    if days <= 30:
        return value30 * days / 30
    if days <= 60:
        return value30 + (value60 - value30) * (days - 30) / 30
    if days <= 90:
        return value60 + (value90 - value60) * (days - 60) / 30
    return value90 * days / 90


def status(days: float | None, no_movement: bool, healthy: int, overstock: int) -> str:
    if no_movement:
        return "SIN ROTACIÓN"
    if days is None:
        return "SIN DATOS"
    if days <= healthy / 2:
        return "CRÍTICO"
    if days <= healthy:
        return "ALERTA"
    if days <= overstock:
        return "ÓPTIMO"
    return "BAJA ROTACIÓN"


def expected(rows: list[dict], predictive: dict[tuple[str, str], dict], params: dict) -> dict:
    brands = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    health = defaultdict(lambda: [0.0, 0])
    projection = defaultdict(lambda: [0.0, 0])
    risk = defaultdict(lambda: [0.0, 0.0, 0, 0])
    evaluated = []
    rate = min(.95, max(0, .18 + params["p_merma_pct"] / 100))
    for row in rows:
        if row["storeId"] not in params["p_store_ids"] or row["category"] not in params["p_rubros"]:
            continue
        if params["p_lines"] and row["line"] not in params["p_lines"]:
            continue
        if params["p_sublines"] and row["subline"] not in params["p_sublines"]:
            continue
        extra = predictive[row["storeId"], row["productId"]]
        demand = window_total(params["p_window_days"], row["units30"], extra["units60"], extra["units90"])
        movement = window_total(params["p_movement_days"], row["units30"], extra["units60"], extra["units90"])
        vendible = row["stockValue"] * (1 - rate)
        coverage = row["stockUnits"] * (1 - rate) / (demand / params["p_window_days"]) if demand > 0 else None
        current = status(coverage, movement <= 0, params["p_healthy_days"], params["p_overstock_days"])
        projected = status(max(0, coverage - params["p_horizon_days"]) if coverage is not None else None,
                           current == "SIN ROTACIÓN" or coverage is None,
                           params["p_healthy_days"], params["p_overstock_days"])
        brand = brands[row["brand"] or "SIN MARCA"]
        brand[0] += row["stockUnits"]
        brand[1] += row["stockValue"]
        brand[2] += demand
        brand[3] += movement
        health[current][0] += vendible
        health[current][1] += 1
        projection[projected][0] += vendible
        projection[projected][1] += 1
        store = risk[row["storeId"]]
        store[0] += vendible
        store[3] += 1
        if current != "SIN ROTACIÓN" and projected in ("CRÍTICO", "ALERTA"):
            store[1] += vendible
            store[2] += 1
        evaluated.append((row, current, projected, coverage, vendible))
    return {"brands": brands, "health": health, "projection": projection, "risk": risk, "count": len(evaluated)}


def close(actual: float, target: float) -> bool:
    return math.isclose(float(actual), float(target), rel_tol=1e-9, abs_tol=.001)


def verify(local: dict, remote: dict) -> None:
    assert int(remote["rowCount"]) == local["count"]
    for remote_key, local_key, name_key, columns in (
        ("brandRows", "brands", "name", ("stockUnits", "stockValue", "demandUnits", "movementUnits")),
        ("healthRows", "health", "status", ("value", "products")),
        ("projectionRows", "projection", "status", ("value", "products")),
        ("riskRows", "risk", "storeId", ("totalValue", "riskValue", "riskProducts", "products")),
    ):
        for row in remote[remote_key]:
            values = local[local_key][row[name_key]]
            for field, target in zip(columns, values, strict=True):
                assert close(row[field], target), (remote_key, row[name_key], field, row[field], target)
    assert len(remote["priorityProducts"]) <= 5


def main() -> None:
    import psycopg
    password = getpass.getpass("Contraseña PostgreSQL de bd-app: ")
    core = json.loads((DATA / "dashboard.json").read_text(encoding="utf-8"))
    rows = json.loads((DATA / "dashboard-stock-products.json").read_text(encoding="utf-8"))["stockProducts"]
    predictive_rows = descompactar_predictivo(json.loads((DATA / "dashboard-predictive-compact.json").read_text(encoding="utf-8"))["predictiveCompact"])["rows"]
    predictive = {(row["storeId"], row["productId"]): row for row in predictive_rows}
    stores = sorted({row["storeId"] for row in rows})
    scenarios = [
        ("total", stores, ["TEXTIL", "CALZADO"], [], [], 30, 90, 30, 90, 2, 0),
        ("tienda-calzado", stores[:1], ["CALZADO"], [], [], 60, 60, 45, 120, 5, 30),
    ]
    with psycopg.connect(
        host="aws-0-us-east-1.pooler.supabase.com", port=5432,
        user="postgres.xtnihjzqnxozbotymoma", dbname="postgres",
        password=password, sslmode="require", connect_timeout=20,
    ) as connection:
      for label, store_ids, rubros, lines, sublines, window, movement, healthy, overstock, merma, horizon in scenarios:
        params = dict(p_cutoff=core["metadata"]["stockCutoff"], p_store_ids=store_ids,
                      p_rubros=rubros, p_lines=lines, p_sublines=sublines,
                      p_window_days=window, p_movement_days=movement,
                      p_healthy_days=healthy, p_overstock_days=overstock,
                      p_merma_pct=merma, p_horizon_days=horizon)
        start = time.perf_counter()
        with connection.cursor() as cursor:
            cursor.execute(
                "select public.dashboard_stock_insights(%s::date,%s::text[],%s::text[],%s::text[],%s::text[],"
                "%s::integer,%s::integer,%s::integer,%s::integer,%s::double precision,%s::integer)",
                tuple(params.values()),
            )
            remote = cursor.fetchone()[0]
        elapsed = time.perf_counter() - start
        response = json.dumps(remote, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        verify(expected(rows, predictive, params), remote)
        if len(response) >= 5_000_000:
            raise ValueError("La respuesta excede 5 MB.")
        print(f"{label}: {remote['rowCount']} filas; respuesta {len(response)} bytes; {elapsed:.2f} s; paridad OK")


if __name__ == "__main__":
    main()
