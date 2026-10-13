"""Prepara reportes anuales privados a partir de la Capa 2 homologada.

No publica ni modifica la base. Cada archivo está separado por año y tienda;
las autorizaciones se aplican de nuevo al solicitar sus enlaces.
"""

import argparse
import gzip
import json
from collections import defaultdict
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path

import duckdb


DETAIL_SQL = {
    "ventas": """select fecha_venta fecha, year(fecha_venta) anio, month(fecha_venta) mes,
        day(fecha_venta) dia, tienda_id, tienda, nro_venta, codigo_nissei, descripcion,
        rubro, linea, sub_linea, marca, cantidad, precio_real, total_venta,
        tipo_documento, estado from {fact}""",
    "stock": """select fecha_corte fecha, year(fecha_corte) anio, month(fecha_corte) mes,
        day(fecha_corte) dia, tienda_id, tienda, codigo_nissei, descripcion,
        rubro, linea, sub_linea, marca, estado_stock, cantidad, valor_stock from {fact}""",
    "ingresos": """select fecha_ingreso fecha, year(fecha_ingreso) anio, month(fecha_ingreso) mes,
        day(fecha_ingreso) dia, tienda_id, tienda, codigo_nissei, descripcion,
        rubro, linea, sub_linea, marca, proveedor, cantidad_recibida, total_ingreso,
        tipo_movimiento_ingreso from {fact}""",
    "transferencias": """select fecha_transferencia fecha, year(fecha_transferencia) anio,
        month(fecha_transferencia) mes, day(fecha_transferencia) dia,
        tienda_origen_id tienda_id, tienda_origen tienda, 'SALIDA' direccion,
        tienda_origen_id, tienda_origen, tienda_destino_id, tienda_destino, nro_guia,
        codigo_nissei, descripcion, rubro, linea, sub_linea, marca, cantidad,
        total_transferencia, estado_transferencia from {fact}
        union all select fecha_transferencia, year(fecha_transferencia),
        month(fecha_transferencia), day(fecha_transferencia),
        tienda_destino_id, tienda_destino, 'ENTRADA', tienda_origen_id, tienda_origen,
        tienda_destino_id, tienda_destino, nro_guia, codigo_nissei, descripcion,
        rubro, linea, sub_linea, marca, cantidad, total_transferencia,
        estado_transferencia from {fact}""",
    "trafico": """select fecha, year(fecha) anio, month(fecha) mes, day(fecha) dia,
        tienda_id, tienda, cantidad_personas, tipo_conteo, fuente_conteo,
        estado_registro from {fact} where es_dato_valido""",
}

DATE_FIELDS = {
    "ventas": "fecha_venta", "stock": "fecha_corte", "ingresos": "fecha_ingreso",
    "transferencias": "fecha_transferencia", "trafico": "fecha",
}

SUMMARY_SQL = {
    "ventas_diario": """select fecha_venta fecha, tienda_id,
        sum(total_venta) venta_neta, sum(cantidad) unidades,
        count(distinct cast(fecha_venta as varchar) || '|' || tienda_id || '|' || nro_venta) transacciones
        from {fact} group by 1, 2""",
    "ventas": """select fecha_venta fecha, tienda_id, rubro, linea, sub_linea,
        sum(total_venta) venta_neta, sum(cantidad) unidades
        from {fact} group by 1, 2, 3, 4, 5""",
    "ingresos": """select fecha_ingreso fecha, tienda_id, rubro, linea, sub_linea,
        sum(total_ingreso) valor_ingreso, sum(cantidad_recibida) unidades
        from {fact} group by 1, 2, 3, 4, 5""",
    "stock": """select fecha_corte fecha, tienda_id, rubro, linea, sub_linea,
        sum(valor_stock) valor_stock, sum(cantidad) unidades
        from {fact} group by 1, 2, 3, 4, 5""",
    "transferencias": """select fecha_transferencia fecha, tienda_origen_id tienda_id,
        rubro, linea, sub_linea, 'SALIDA' direccion,
        sum(total_transferencia) valor_transferencia, sum(cantidad) unidades
        from {fact} group by 1, 2, 3, 4, 5
        union all select fecha_transferencia, tienda_destino_id, rubro, linea,
        sub_linea, 'ENTRADA', sum(total_transferencia), sum(cantidad)
        from {fact} group by 1, 2, 3, 4, 5""",
    "trafico": """select fecha, tienda_id, sum(cantidad_personas) personas
        from {fact} where es_dato_valido group by 1, 2""",
}


def json_value(value):
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def source(root, kind):
    name = "FactTraficoClientes" if kind == "trafico" else "Fact" + kind.capitalize()
    path = root / "capa2" / (name + ".parquet")
    if not path.is_file():
        raise FileNotFoundError(path)
    return "read_parquet('" + str(path).replace("'", "''") + "')"


def write_query(connection, query, output, kind, stores, years, handles, counts, dimensions=None):
    cursor = connection.execute(query)
    columns = [column[0] for column in cursor.description]
    while block := cursor.fetchmany(10000):
        for values in block:
            row = dict(zip(columns, map(json_value, values)))
            year, store = int(str(row["fecha"])[:4]), row["tienda_id"]
            if year not in years or store not in stores:
                continue
            key = (year, kind, store)
            if key not in handles:
                target = output / str(year) / kind / f"{store}.jsonl.gz"
                target.parent.mkdir(parents=True, exist_ok=True)
                handles[key] = gzip.open(target, "wt", encoding="utf-8", compresslevel=6)
            handles[key].write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            counts[key] += 1
            if dimensions is not None and kind != "trafico":
                dimensions[(year, store)].add((row.get("rubro") or "", row.get("linea") or "", row.get("sub_linea") or ""))


def generate(root, output, requested_years):
    connection = duckdb.connect()
    store_rows = connection.execute("""select tienda_id, tienda, alias, cluster, formato_tienda
        from read_parquet(?) where tienda_id like 'T___'""",
        [str(root / "capa2" / "DimTiendas.parquet")]).fetchall()
    stores = {row[0]: {"name": row[1], "alias": row[2], "cluster": row[3], "format": row[4]}
              for row in store_rows}
    if not stores:
        raise ValueError("No se encontraron tiendas homologadas.")
    years = set(requested_years)
    cutoffs = {}
    for kind, field in DATE_FIELDS.items():
        cutoffs[kind] = str(connection.execute(
            f"select max({field}) from {source(root, kind)}").fetchone()[0] or "")

    detail_handles, detail_counts = {}, defaultdict(int)
    dimensions = defaultdict(set)
    try:
        for kind, template in DETAIL_SQL.items():
            print(f"Detalle {kind}...", flush=True)
            write_query(connection, template.format(fact=source(root, kind)), output, kind,
                        stores, years, detail_handles, detail_counts, dimensions)
    finally:
        for handle in detail_handles.values():
            handle.close()

    summary_handles, summary_counts = {}, defaultdict(int)
    try:
        for kind, template in SUMMARY_SQL.items():
            print(f"Resumen {kind}...", flush=True)
            fact_kind = "ventas" if kind == "ventas_diario" else kind
            query = template.format(fact=source(root, fact_kind))
            cursor = connection.execute(query)
            columns = [column[0] for column in cursor.description]
            while block := cursor.fetchmany(10000):
                for values in block:
                    row = dict(zip(columns, map(json_value, values)))
                    year, store = int(str(row["fecha"])[:4]), row["tienda_id"]
                    if year not in years or store not in stores:
                        continue
                    row["kind"] = kind
                    row["anio"] = year
                    row["mes"] = int(row["fecha"][5:7])
                    row["dia"] = int(row["fecha"][8:10])
                    key = (year, store)
                    if key not in summary_handles:
                        target = output / str(year) / "summary" / f"{store}.json.gz"
                        target.parent.mkdir(parents=True, exist_ok=True)
                        summary_handles[key] = gzip.open(target, "wt", encoding="utf-8", compresslevel=6)
                    summary_handles[key].write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                    summary_counts[key] += 1
    finally:
        for handle in summary_handles.values():
            handle.close()
    connection.close()

    files = []
    for (year, kind, store), rows in sorted(detail_counts.items()):
        target = output / str(year) / kind / f"{store}.jsonl.gz"
        files.append({"year": year, "kind": kind, "storeId": store, "rows": rows,
                      "bytes": target.stat().st_size, "path": f"{year}/{kind}/{store}.jsonl.gz"})
    summaries = []
    for (year, store), rows in sorted(summary_counts.items()):
        target = output / str(year) / "summary" / f"{store}.json.gz"
        summaries.append({"year": year, "storeId": store, "rows": rows,
                          "bytes": target.stat().st_size, "path": f"{year}/summary/{store}.json.gz"})
    manifest = {"generatedAt": datetime.now(timezone.utc).isoformat(),
                "years": sorted({item["year"] for item in files}), "cutoffs": cutoffs,
                "stores": stores, "files": files, "summaries": summaries,
                "dimensions": {f"{year}/{store}": sorted(map(list, values))
                               for (year, store), values in dimensions.items()}}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--years", required=True, help="Un año o lista separada por comas")
    args = parser.parse_args()
    selected = [int(year) for year in args.years.split(",")]
    if not selected or any(year < 2024 or year > 2100 for year in selected):
        parser.error("Indica años válidos.")
    result = generate(args.source_root, args.output, selected)
    print(json.dumps({"years": result["years"], "files": len(result["files"]),
                      "summaries": len(result["summaries"]),
                      "bytes": sum(row["bytes"] for row in result["files"] + result["summaries"])}, ensure_ascii=False))
