"""Validate and atomically import the commercial stock snapshot into Postgres.

No database connection is made without --apply. The password is read from a
terminal prompt unless SUPABASE_DB_PASSWORD is provided by the caller.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "piplines"))
from compactar_dashboard import descompactar_predictivo  # noqa: E402

DATA = ROOT / "dashboard-data"
STOCK_FIELDS = (
    "stockUnits", "stockValue", "goodUnits", "mermaStockUnits",
    "desmedroStockUnits", "units30", "sales30", "units12", "sales12",
)
PREDICTIVE_FIELDS = ("units60", "units90", "merma30", "merma60", "merma90")
CATALOG_FIELDS = ("productCode", "product", "category", "line", "subline", "brand")


def prepare() -> tuple[str, str, list[tuple], list[tuple], dict[str, float]]:
    stock_path = DATA / "dashboard-stock-products.json"
    predictive_path = DATA / "dashboard-predictive-compact.json"
    stock_bytes = stock_path.read_bytes()
    predictive_bytes = predictive_path.read_bytes()
    source_sha = hashlib.sha256(stock_bytes + predictive_bytes).hexdigest()
    metadata = json.loads((DATA / "dashboard.json").read_text(encoding="utf-8"))["metadata"]
    cutoff = metadata["stockCutoff"]
    if not isinstance(cutoff, str) or len(cutoff) != 10:
        raise ValueError("El corte de stock del dashboard no es una fecha válida.")
    stock = json.loads(stock_bytes)["stockProducts"]
    predictions = descompactar_predictivo(json.loads(predictive_bytes)["predictiveCompact"])["rows"]
    predictive_index = {(row["storeId"], row["productId"]): row for row in predictions}
    if len(predictive_index) != len(predictions):
        raise ValueError("Hay claves de predicción repetidas.")
    catalog: dict[str, tuple] = {}
    facts: list[tuple] = []
    seen: set[tuple[str, str]] = set()
    totals = {field: 0.0 for field in STOCK_FIELDS}
    for row in stock:
        product_id = row["productId"]
        store_id = row["storeId"]
        key = store_id, product_id
        if key in seen:
            raise ValueError(f"SKU repetido por tienda: {key}")
        seen.add(key)
        detail = tuple(row[field] for field in CATALOG_FIELDS)
        if product_id in catalog and catalog[product_id] != detail:
            raise ValueError(f"Metadatos incompatibles para SKU {product_id}")
        catalog[product_id] = detail
        metrics = tuple(float(row[field]) for field in STOCK_FIELDS)
        for field, value in zip(STOCK_FIELDS, metrics, strict=True):
            totals[field] += value
        extra = predictive_index.get(key)
        predictive_metrics = tuple(float(extra[field]) for field in PREDICTIVE_FIELDS) if extra else (0.0,) * 5
        facts.append((cutoff, store_id, product_id, *metrics, *predictive_metrics))
    missing_predictive = set(predictive_index) - seen
    if missing_predictive:
        raise ValueError(f"{len(missing_predictive)} predicciones sin SKU en el stock.")
    catalog_rows = [(cutoff, product_id, *detail) for product_id, detail in catalog.items()]
    return cutoff, source_sha, catalog_rows, facts, totals


def import_snapshot(cutoff: str, source_sha: str, catalog: list[tuple], facts: list[tuple], totals: dict[str, float]) -> None:
    try:
        import psycopg
    except ImportError as error:
        raise SystemExit("Instala psycopg[binary] para usar --apply.") from error
    password = os.environ.get("SUPABASE_DB_PASSWORD") or getpass.getpass("Contraseña PostgreSQL de Supabase: ")
    if not password:
        raise ValueError("Se necesita la contraseña de PostgreSQL.")
    with psycopg.connect(
        host="aws-0-us-east-1.pooler.supabase.com", port=5432,
        user="postgres.xtnihjzqnxozbotymoma", dbname="postgres",
        password=password, sslmode="require", connect_timeout=20,
    ) as connection:
        with connection.cursor() as cursor:
            for migration in (
                ROOT / "supabase/migrations/20261025180000_dashboard_stock_snapshot.sql",
                ROOT / "supabase/migrations/20261025181000_dashboard_stock_insights.sql",
                ROOT / "supabase/migrations/20261025181500_dashboard_stock_insights_inline.sql",
                ROOT / "supabase/migrations/20261025182000_dashboard_window_total_inline.sql",
            ):
                version, name = migration.stem.split("_", 1)
                cursor.execute("select 1 from supabase_migrations.schema_migrations where version=%s", (version,))
                if not cursor.fetchone():
                    cursor.execute(migration.read_text(encoding="utf-8"))
                    cursor.execute(
                        "insert into supabase_migrations.schema_migrations(version,name) values (%s,%s)",
                        (version, name),
                    )
            cursor.execute(
                "select source_sha256, row_count, status from public.dashboard_stock_snapshots where stock_cutoff=%s",
                (cutoff,),
            )
            existing = cursor.fetchone()
            if existing:
                if existing == (source_sha, len(facts), "ready"):
                    print(f"Corte {cutoff} ya validado; no se importaron filas duplicadas.")
                    return
                raise ValueError("El corte ya existe con otro contenido o no terminó de cargarse.")
            cursor.execute(
                "insert into public.dashboard_stock_snapshots(stock_cutoff,source_sha256,row_count) values (%s,%s,%s)",
                (cutoff, source_sha, len(facts)),
            )
            with cursor.copy(
                "copy public.dashboard_stock_catalog(stock_cutoff,product_id,product_code,product,category,line,subline,brand) from stdin"
            ) as copy:
                for row in catalog:
                    copy.write_row(row)
            with cursor.copy(
                "copy public.dashboard_stock_metrics(stock_cutoff,store_id,product_id,stock_units,stock_value,good_units,"
                "merma_stock_units,desmedro_stock_units,units30,sales30,units12,sales12,units60,units90,merma30,"
                "merma60,merma90) from stdin"
            ) as copy:
                for row in facts:
                    copy.write_row(row)
            cursor.execute(
                "select count(*), sum(stock_units), sum(stock_value), sum(units30) "
                "from public.dashboard_stock_metrics where stock_cutoff=%s", (cutoff,),
            )
            count, stock_units, stock_value, units30 = cursor.fetchone()
            if count != len(facts):
                raise ValueError(f"Importación incompleta: {count}/{len(facts)} filas.")
            for key, actual in (("stockUnits", stock_units), ("stockValue", stock_value), ("units30", units30)):
                if abs(actual - totals[key]) > max(0.01, abs(totals[key]) * 1e-10):
                    raise ValueError(f"La suma {key} no coincide con el origen.")
            cursor.execute(
                "update public.dashboard_stock_snapshots set status='ready',ready_at=now() where stock_cutoff=%s",
                (cutoff,),
            )
    print(f"Corte {cutoff} confirmado: {len(catalog)} SKU y {len(facts)} filas de tienda.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Importar después de validar la migración de esquema")
    args = parser.parse_args()
    cutoff, source_sha, catalog, facts, totals = prepare()
    print(f"Corte {cutoff}; {len(catalog)} SKU; {len(facts)} filas; hash {source_sha}; "
          f"stock {totals['stockUnits']:.2f} unidades; valor {totals['stockValue']:.2f}.")
    if args.apply:
        import_snapshot(cutoff, source_sha, catalog, facts, totals)


if __name__ == "__main__":
    main()
