"""Produce CSV comerciales agregados desde Capa 2, sin alterar las fuentes."""

import argparse
import csv
import json
import re
from pathlib import Path

import duckdb


KINDS = ("ventas", "stock", "ingresos", "transferencias")
NUMERIC = {
    "ventas": {"unidades", "importe_venta", "lineas_venta"},
    "stock": {"unidades", "valor_stock", "lineas_stock"},
    "ingresos": {"unidades_recibidas", "importe_ingreso", "lineas_ingreso"},
    "transferencias": {"cantidad", "importe_transferencia"},
}


def source(path: Path) -> str:
    return str(path).replace("'", "''")


def queries(root: Path, sales_cutoff: str, stock_cutoff: str, stores: list[str]) -> dict[str, str]:
    fact = lambda name: f"read_parquet('{source(root / 'capa2' / (name + '.parquet'))}')"
    allowed = ",".join(f"'{item}'" for item in stores)
    dimensions = "coalesce(nullif(trim(rubro), ''), 'SIN CLASIFICAR') rubro, coalesce(nullif(trim(linea), ''), 'SIN CLASIFICAR') linea, coalesce(nullif(trim(sub_linea), ''), 'SIN CLASIFICAR') sub_linea, coalesce(nullif(trim(marca), ''), 'SIN MARCA') marca"
    return {
        "ventas": f"""select strftime(fecha_venta, '%Y-%m') periodo, tienda_id, any_value(tienda) tienda,
          {dimensions}, sum(cantidad) unidades, sum(total_venta) importe_venta,
          count(*) lineas_venta from {fact('FactVentas')}
          where fecha_venta <= '{sales_cutoff}' and tienda_id in ({allowed})
          group by 1, 2, 4, 5, 6, 7 order by 2, 1, 4, 5, 6, 7""",
        "stock": f"""select fecha_corte, tienda_id, any_value(tienda) tienda,
          {dimensions}, coalesce(estado_stock, 'SIN ESTADO') estado_stock,
          sum(cantidad) unidades, sum(valor_stock) valor_stock, count(*) lineas_stock
          from {fact('FactStock')} where fecha_corte = '{stock_cutoff}' and tienda_id in ({allowed})
          group by 1, 2, 4, 5, 6, 7, 8 order by 2, 4, 5, 6, 7, 8""",
        "ingresos": f"""select strftime(fecha_ingreso, '%Y-%m') periodo, tienda_id, any_value(tienda) tienda,
          {dimensions}, sum(cantidad_recibida) unidades_recibidas,
          sum(total_ingreso) importe_ingreso, count(*) lineas_ingreso
          from {fact('FactIngresos')} where fecha_ingreso <= '{sales_cutoff}' and tienda_id in ({allowed})
          group by 1, 2, 4, 5, 6, 7 order by 2, 1, 4, 5, 6, 7""",
        "transferencias": f"""with movimientos as (
          select tienda_origen_id tienda_id, 'SALIDA' direccion, * from {fact('FactTransferencias')}
          union all
          select tienda_destino_id tienda_id, 'ENTRADA' direccion, * from {fact('FactTransferencias')}
          ) select fecha_transferencia, tienda_id, direccion, tienda_origen_id, tienda_origen,
          tienda_destino_id, tienda_destino, nro_guia, codigo_nissei, rubro, linea, sub_linea,
          marca, cantidad, total_transferencia importe_transferencia, estado_transferencia
          from movimientos where fecha_transferencia <= '{sales_cutoff}' and tienda_id in ({allowed})
          order by tienda_id, fecha_transferencia, nro_guia""",
    }


def safe_cell(value, numeric: bool):
    if value is None:
        return ""
    if numeric:
        return value
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def generate(root: Path, output: Path, sales_cutoff: str, stock_cutoff: str, stores: list[str]):
    if not stores or any(not re.fullmatch(r"T\d{3}", store) for store in stores):
        raise ValueError("Indica códigos de tienda válidos.")
    output.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    maxima = {
        "ventas": connection.sql(f"select max(fecha_venta) from read_parquet('{source(root / 'capa2' / 'FactVentas.parquet')}')").fetchone()[0],
        "stock": connection.sql(f"select max(fecha_corte) from read_parquet('{source(root / 'capa2' / 'FactStock.parquet')}')").fetchone()[0],
    }
    if str(maxima["ventas"]) != sales_cutoff or str(maxima["stock"]) != stock_cutoff:
        raise ValueError(f"Los cortes de Capa 2 {maxima} no coinciden con la publicación; no se generan reportes mezclados.")
    counts = {}
    for kind, query in queries(root, sales_cutoff, stock_cutoff, stores).items():
        cursor = connection.execute(query)
        columns = [item[0] for item in cursor.description]
        owner = columns.index("tienda_id")
        handles = {}
        writers = {}
        try:
            while block := cursor.fetchmany(10000):
                for row in block:
                    store_id = row[owner]
                    if store_id not in writers:
                        target = output / kind / f"{store_id}.csv"
                        target.parent.mkdir(parents=True, exist_ok=True)
                        handle = target.open("w", encoding="utf-8-sig", newline="")
                        handles[store_id] = handle
                        writers[store_id] = csv.writer(handle)
                        writers[store_id].writerow(columns)
                        counts[(kind, store_id)] = 0
                    writers[store_id].writerow([safe_cell(value, column in NUMERIC[kind]) for column, value in zip(columns, row)])
                    counts[(kind, store_id)] += 1
        finally:
            for handle in handles.values():
                handle.close()
    manifest = {"salesCutoff": sales_cutoff, "stockCutoff": stock_cutoff,
                "files": [{"kind": kind, "storeId": store, "rows": rows,
                           "bytes": (output / kind / f"{store}.csv").stat().st_size}
                          for (kind, store), rows in sorted(counts.items())]}
    (output / "summary.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sales-cutoff", required=True)
    parser.add_argument("--stock-cutoff", required=True)
    parser.add_argument("--stores", required=True)
    args = parser.parse_args()
    result = generate(args.source_root, args.output, args.sales_cutoff, args.stock_cutoff,
                      args.stores.split(","))
    print(json.dumps({"files": len(result["files"]), "rows": sum(item["rows"] for item in result["files"]),
                      "bytes": sum(item["bytes"] for item in result["files"])}, ensure_ascii=False))
