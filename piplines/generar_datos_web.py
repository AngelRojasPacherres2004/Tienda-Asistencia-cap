from __future__ import annotations

import argparse
import json
import shutil
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import duckdb

from project_paths import PROJECT_ROOT, CAPA2_DIR
from runtime_config import finalizar_proceso


WEB_DIR = PROJECT_ROOT / "dashboard-web"
SALIDA_PUBLICA = WEB_DIR / "public" / "assets" / "data" / "dashboard.json"
SALIDA_COMPILADA = WEB_DIR / "dist" / "dashboard-web" / "browser" / "assets" / "data" / "dashboard.json"


def normalizar(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    return valor


def filas(conexion: duckdb.DuckDBPyConnection, consulta: str) -> list[dict]:
    cursor = conexion.execute(consulta)
    columnas = [item[0] for item in cursor.description]
    return [
        {columna: normalizar(valor) for columna, valor in zip(columnas, registro)}
        for registro in cursor.fetchall()
    ]


def literal_parquet(nombre: str) -> str:
    ruta = (CAPA2_DIR / f"{nombre}.parquet").resolve().as_posix().replace("'", "''")
    if not (CAPA2_DIR / f"{nombre}.parquet").exists():
        raise FileNotFoundError(f"Falta capa2/{nombre}.parquet")
    return f"read_parquet('{ruta}')"


def resumen_mensual_dimension(
    conexion: duckdb.DuckDBPyConnection,
    ventas: str,
    ingresos: str,
    dimensiones: list[tuple[str, str, str]],
) -> list[dict]:
    """Resume ventas e ingresos al nivel exacto elegido para filtros web."""
    aliases = [alias for _, alias, _ in dimensiones]
    expresiones_venta = [
        f"COALESCE(NULLIF(TRIM({columna}), ''), '{vacio}') AS {alias}"
        for columna, alias, vacio in dimensiones
    ]
    expresiones_ingreso = expresiones_venta
    seleccion_llaves = ", ".join(["periodo_id", "tienda_id", *aliases])
    uso_llaves = ", ".join(["periodo_id", "tienda_id", *aliases])
    grupo = ", ".join(str(indice) for indice in range(1, 3 + len(aliases)))
    seleccion_dimensiones = ",\n                ".join(expresiones_venta)
    salida_dimensiones = ", ".join(f"l.{alias}" for alias in aliases)
    consulta = f"""
        WITH ventas_dim AS (
            SELECT periodo_id, tienda_id,
                {seleccion_dimensiones},
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0
                    THEN cantidad * precio_sugerido ELSE 0 END) AS gross,
                SUM(CASE WHEN total_venta > 0 THEN total_venta ELSE 0 END) AS positive_real,
                ABS(SUM(CASE WHEN total_venta < 0 THEN total_venta ELSE 0 END)) AS notes,
                SUM(total_venta) AS net,
                COUNT(DISTINCT CAST(fecha_venta AS VARCHAR) || '|' || tienda_id || '|' || nro_venta) AS transactions,
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units
            FROM {ventas}
            GROUP BY {grupo}
        ), ingresos_dim AS (
            SELECT periodo_id, tienda_id,
                {seleccion_dimensiones},
                SUM(cantidad_recibida) AS received
            FROM {ingresos}
            GROUP BY {grupo}
        ), llaves AS (
            SELECT {seleccion_llaves} FROM ventas_dim
            UNION SELECT {seleccion_llaves} FROM ingresos_dim
        )
        SELECT l.periodo_id AS "periodId", l.tienda_id AS "storeId", {salida_dimensiones},
            CAST(COALESCE(v.gross, 0) AS DOUBLE) AS gross,
            CAST(COALESCE(v.positive_real, 0) AS DOUBLE) AS "positiveReal",
            CAST(COALESCE(v.notes, 0) AS DOUBLE) AS notes,
            CAST(COALESCE(v.gross, 0) - COALESCE(v.positive_real, 0) AS DOUBLE) AS discount,
            CAST(COALESCE(v.net, 0) AS DOUBLE) AS net,
            CAST(COALESCE(v.transactions, 0) AS BIGINT) AS transactions,
            CAST(COALESCE(v.units, 0) AS DOUBLE) AS units,
            CAST(COALESCE(i.received, 0) AS DOUBLE) AS received
        FROM llaves l
        LEFT JOIN ventas_dim v USING ({uso_llaves})
        LEFT JOIN ingresos_dim i USING ({uso_llaves})
        ORDER BY l.periodo_id, l.tienda_id, {', '.join(f'l.{alias}' for alias in aliases)}
    """
    return filas(conexion, consulta)


def generar() -> dict:
    ventas = literal_parquet("FactVentas")
    stock_historico = literal_parquet("FactStock")
    ingresos = literal_parquet("FactIngresos")
    metas = literal_parquet("FactMetasTienda")
    personal = literal_parquet("FactPersonalTienda")
    trafico = literal_parquet("FactTraficoClientes")
    tiendas = literal_parquet("DimTiendas")
    merma = literal_parquet("FactMerma")

    conexion = duckdb.connect()
    fecha_ultima_venta = conexion.execute(f"SELECT MAX(fecha_venta) FROM {ventas}").fetchone()[0]
    fecha_stock = conexion.execute(
        f"SELECT MAX(fecha_corte) FROM {stock_historico}"
    ).fetchone()[0]
    if fecha_ultima_venta != fecha_stock:
        raise RuntimeError(
            "El stock y las ventas no comparten corte comercial: "
            f"ventas={fecha_ultima_venta}, stock={fecha_stock}. Actualice la capa 2."
        )
    periodos_stock = [
        int(fila[0])
        for fila in conexion.execute(
            f"SELECT DISTINCT periodo_corte_id FROM {stock_historico} ORDER BY 1"
        ).fetchall()
    ]
    # Los KPIs representan una fotografía actual. El histórico mensual queda
    # conservado en FactStock, pero nunca se suma entre cortes.
    stock = (
        f"(SELECT * FROM {stock_historico} "
        f"WHERE fecha_corte = DATE '{fecha_stock.isoformat()}')"
    )

    dimensiones_tienda = filas(
        conexion,
        f"""
        SELECT
            tienda_id AS "storeId",
            CASE WHEN tienda_id = 'T014' THEN 'AGU' ELSE tienda END AS "store",
            CASE WHEN tienda_id = 'T014' THEN 'AGU' ELSE alias END AS alias,
            formato_tienda AS "format", cluster,
            COALESCE(es_tienda, FALSE) AS "isStore",
            CAST(metraje_m2 AS DOUBLE) AS "areaM2",
            CAST(capacidad_stock_unidades AS DOUBLE) AS capacity,
            fecha_apertura AS "openingDate", fecha_cierre AS "closingDate",
            estado_operativo AS status
        FROM {tiendas}
        ORDER BY COALESCE(alias, tienda), tienda_id
        """,
    )

    base_mensual = filas(
        conexion,
        f"""
        WITH ventas_mes AS (
            SELECT
                periodo_id, tienda_id,
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0
                    THEN cantidad * precio_sugerido ELSE 0 END) AS gross,
                SUM(CASE WHEN total_venta > 0 THEN total_venta ELSE 0 END) AS positive_real,
                ABS(SUM(CASE WHEN total_venta < 0 THEN total_venta ELSE 0 END)) AS notes,
                SUM(total_venta) AS net,
                COUNT(DISTINCT CAST(fecha_venta AS VARCHAR) || '|' || tienda_id || '|' || nro_venta) AS transactions,
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units
            FROM {ventas}
            GROUP BY 1, 2
        ), meta_mes AS (
            SELECT periodo_id, tienda_id,
                SUM(CASE WHEN es_meta_valida THEN meta_ventas ELSE 0 END) AS target
            FROM {metas}
            GROUP BY 1, 2
        ), trafico_mes AS (
            SELECT periodo_id, tienda_id,
                SUM(CASE WHEN es_dato_valido THEN cantidad_personas ELSE 0 END) AS traffic
            FROM {trafico}
            GROUP BY 1, 2
        ), personal_mes AS (
            SELECT periodo_id, tienda_id, SUM(COALESCE(cantidad_personal, 0)) AS personnel
            FROM {personal}
            GROUP BY 1, 2
        ), ingresos_mes AS (
            SELECT periodo_id, tienda_id, SUM(cantidad_recibida) AS received
            FROM {ingresos}
            GROUP BY 1, 2
        ), llaves AS (
            SELECT periodo_id, tienda_id FROM ventas_mes
            UNION SELECT periodo_id, tienda_id FROM meta_mes
            UNION SELECT periodo_id, tienda_id FROM trafico_mes
            UNION SELECT periodo_id, tienda_id FROM personal_mes
            UNION SELECT periodo_id, tienda_id FROM ingresos_mes
        )
        SELECT
            l.periodo_id AS "periodId", CAST(FLOOR(l.periodo_id / 100) AS INTEGER) AS year,
            CAST(l.periodo_id % 100 AS INTEGER) AS month, l.tienda_id AS "storeId",
            CAST(COALESCE(v.gross, 0) AS DOUBLE) AS gross,
            CAST(COALESCE(v.positive_real, 0) AS DOUBLE) AS "positiveReal",
            CAST(COALESCE(v.notes, 0) AS DOUBLE) AS notes,
            CAST(COALESCE(v.gross, 0) - COALESCE(v.positive_real, 0) AS DOUBLE) AS discount,
            CAST(COALESCE(v.net, 0) AS DOUBLE) AS net,
            CAST(COALESCE(v.transactions, 0) AS BIGINT) AS transactions,
            CAST(COALESCE(v.units, 0) AS DOUBLE) AS units,
            CAST(COALESCE(m.target, 0) AS DOUBLE) AS target,
            CAST(COALESCE(t.traffic, 0) AS DOUBLE) AS traffic,
            CAST(COALESCE(p.personnel, 0) AS DOUBLE) AS personnel,
            CAST(COALESCE(i.received, 0) AS DOUBLE) AS received
        FROM llaves l
        LEFT JOIN ventas_mes v USING (periodo_id, tienda_id)
        LEFT JOIN meta_mes m USING (periodo_id, tienda_id)
        LEFT JOIN trafico_mes t USING (periodo_id, tienda_id)
        LEFT JOIN personal_mes p USING (periodo_id, tienda_id)
        LEFT JOIN ingresos_mes i USING (periodo_id, tienda_id)
        ORDER BY l.periodo_id, l.tienda_id
        """,
    )

    personal_por_area = filas(
        conexion,
        f"""
        SELECT
            periodo_id AS "periodId",
            tienda_id AS "storeId",
            COALESCE(NULLIF(TRIM(area_asignada), ''), 'SIN ÁREA') AS area,
            COALESCE(NULLIF(TRIM(tipo_area), ''), 'SIN TIPO') AS "areaType",
            CAST(SUM(COALESCE(cantidad_personal, 0)) AS DOUBLE) AS personnel
        FROM {personal}
        GROUP BY 1, 2, 3, 4
        ORDER BY 1, 2, 3
        """,
    )

    por_rubro = resumen_mensual_dimension(
        conexion,
        ventas,
        ingresos,
        [("rubro", "category", "SIN RUBRO")],
    )
    por_linea = resumen_mensual_dimension(
        conexion,
        ventas,
        ingresos,
        [("rubro", "category", "SIN RUBRO"), ("linea", "line", "SIN LINEA")],
    )
    por_sublinea = resumen_mensual_dimension(
        conexion,
        ventas,
        ingresos,
        [
            ("rubro", "category", "SIN RUBRO"),
            ("linea", "line", "SIN LINEA"),
            ("sub_linea", "subline", "SIN SUBLINEA"),
        ],
    )

    por_marca = filas(
        conexion,
        f"""
        SELECT periodo_id AS "periodId", tienda_id AS "storeId",
            COALESCE(NULLIF(TRIM(rubro), ''), 'SIN RUBRO') AS category,
            COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
            COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
            COALESCE(NULLIF(TRIM(marca), ''), 'SIN MARCA') AS brand,
            CAST(SUM(total_venta) AS DOUBLE) AS net,
            CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS DOUBLE) AS units
        FROM {ventas}
        GROUP BY 1, 2, 3, 4, 5, 6
        HAVING SUM(total_venta) <> 0
        ORDER BY 1, 2, 3, 4, 5, 6
        """,
    )

    rangos_precio = filas(
        conexion,
        f"""
        WITH ventas_positivas AS (
            SELECT
                periodo_id, tienda_id,
                COALESCE(NULLIF(TRIM(rubro), ''), 'SIN RUBRO') AS category,
                COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
                COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
                total_venta / cantidad AS precio_unitario,
                total_venta AS net,
                cantidad AS units
            FROM {ventas}
            WHERE cantidad > 0 AND total_venta > 0
        ), clasificada AS (
            SELECT *,
                CASE
                    WHEN precio_unitario <= 30 THEN 1
                    WHEN precio_unitario <= 60 THEN 2
                    WHEN precio_unitario <= 90 THEN 3
                    WHEN precio_unitario <= 120 THEN 4
                    WHEN precio_unitario <= 150 THEN 5
                    WHEN precio_unitario <= 180 THEN 6
                    WHEN precio_unitario <= 210 THEN 7
                    WHEN precio_unitario <= 240 THEN 8
                    WHEN precio_unitario <= 270 THEN 9
                    WHEN precio_unitario <= 300 THEN 10
                    ELSE 11
                END AS band_order,
                CASE
                    WHEN precio_unitario <= 30 THEN 'S/ 0–30'
                    WHEN precio_unitario <= 60 THEN 'S/ 31–60'
                    WHEN precio_unitario <= 90 THEN 'S/ 61–90'
                    WHEN precio_unitario <= 120 THEN 'S/ 91–120'
                    WHEN precio_unitario <= 150 THEN 'S/ 121–150'
                    WHEN precio_unitario <= 180 THEN 'S/ 151–180'
                    WHEN precio_unitario <= 210 THEN 'S/ 181–210'
                    WHEN precio_unitario <= 240 THEN 'S/ 211–240'
                    WHEN precio_unitario <= 270 THEN 'S/ 241–270'
                    WHEN precio_unitario <= 300 THEN 'S/ 271–300'
                    ELSE 'S/ 301+'
                END AS price_band
            FROM ventas_positivas
        )
        SELECT
            periodo_id AS "periodId", tienda_id AS "storeId",
            category, line, subline,
            band_order AS "bandOrder", price_band AS "priceBand",
            CAST(SUM(net) AS DOUBLE) AS net,
            CAST(SUM(units) AS DOUBLE) AS units
        FROM clasificada
        GROUP BY 1, 2, 3, 4, 5, 6, 7
        ORDER BY 1, 2, 3, 4, 5, 6
        """,
    )

    stock_tienda = filas(
        conexion,
        f"""
        SELECT s.tienda_id AS "storeId", CAST(SUM(s.cantidad) AS DOUBLE) AS units,
            CAST(SUM(s.valor_stock) AS DOUBLE) AS value,
            CAST(MAX(d.capacidad_stock_unidades) AS DOUBLE) AS capacity
        FROM {stock} s LEFT JOIN {tiendas} d USING (tienda_id)
        GROUP BY 1 ORDER BY 1
        """,
    )

    antiguedad = filas(
        conexion,
        f"""
        SELECT tienda_id AS "storeId",
            COALESCE(NULLIF(TRIM(rubro), ''), 'SIN RUBRO') AS category,
            COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
            COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
            CASE WHEN es_periodo_origen_valido THEN periodo_origen_id ELSE 0 END AS "originPeriodId",
            CAST(SUM(cantidad) AS DOUBLE) AS units,
            CAST(SUM(valor_stock) AS DOUBLE) AS value
        FROM {stock}
        GROUP BY 1, 2, 3, 4, 5 ORDER BY 5, 1, 2, 3, 4
        """,
    )

    cobertura = filas(
        conexion,
        f"""
        WITH st AS (
            SELECT tienda_id, SUM(cantidad) AS stock_units, SUM(valor_stock) AS stock_value
            FROM {stock} GROUP BY 1
        ), v30 AS (
            SELECT tienda_id,
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units30,
                SUM(total_venta) AS sales30
            FROM {ventas}
            WHERE fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 29 DAY
                                  AND DATE '{fecha_stock.isoformat()}'
            GROUP BY 1
        )
        SELECT st.tienda_id AS "storeId", CAST(st.stock_units AS DOUBLE) AS "stockUnits",
            CAST(st.stock_value AS DOUBLE) AS "stockValue",
            CAST(COALESCE(v30.units30, 0) AS DOUBLE) AS "units30",
            CAST(COALESCE(v30.sales30, 0) AS DOUBLE) AS "sales30",
            CASE WHEN v30.units30 > 0 THEN CAST(st.stock_units * 30.0 / v30.units30 AS DOUBLE) END AS "coverageDays",
            CASE WHEN st.stock_value > 0 THEN CAST(v30.sales30 / st.stock_value AS DOUBLE) END AS rotation
        FROM st LEFT JOIN v30 USING (tienda_id)
        ORDER BY 1
        """,
    )

    rotacion_rubro = filas(
        conexion,
        f"""
        WITH st AS (
            SELECT tienda_id, COALESCE(NULLIF(TRIM(rubro), ''), 'SIN RUBRO') AS category,
                SUM(valor_stock) AS stock_value, SUM(cantidad) AS stock_units
            FROM {stock} GROUP BY 1, 2
        ), v30 AS (
            SELECT tienda_id, COALESCE(NULLIF(TRIM(rubro), ''), 'SIN RUBRO') AS category,
                SUM(total_venta) AS sales30,
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units30
            FROM {ventas}
            WHERE fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 29 DAY
                                  AND DATE '{fecha_stock.isoformat()}'
            GROUP BY 1, 2
        )
        SELECT st.tienda_id AS "storeId", st.category,
            CAST(st.stock_units AS DOUBLE) AS "stockUnits",
            CAST(st.stock_value AS DOUBLE) AS "stockValue",
            CAST(COALESCE(v30.units30, 0) AS DOUBLE) AS "units30",
            CAST(COALESCE(v30.sales30, 0) AS DOUBLE) AS "sales30",
            CASE WHEN st.stock_value > 0 THEN CAST(COALESCE(v30.sales30, 0) / st.stock_value AS DOUBLE) END AS rotation
        FROM st LEFT JOIN v30 USING (tienda_id, category)
        ORDER BY 1, 2
        """,
    )

    producto_extremos = filas(
        conexion,
        f"""
        WITH st AS (
            SELECT tienda_id, producto_id,
                COALESCE(NULLIF(TRIM(descripcion), ''), codigo_nissei, producto_id) AS product,
                COALESCE(NULLIF(TRIM(rubro), ''), 'SIN RUBRO') AS category,
                COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
                COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
                COALESCE(NULLIF(TRIM(marca), ''), 'SIN MARCA') AS brand,
                SUM(cantidad) AS stock_units,
                SUM(valor_stock) AS stock_value,
                SUM(CASE WHEN estado_grupo = 'BUENO' THEN cantidad ELSE 0 END) AS good_units,
                SUM(CASE WHEN estado_grupo = 'MERMA' THEN cantidad ELSE 0 END) AS merma_stock_units,
                SUM(CASE WHEN estado_grupo = 'DESMEDRO' THEN cantidad ELSE 0 END) AS desmedro_stock_units
            FROM {stock}
            GROUP BY 1, 2, 3, 4, 5, 6, 7
            HAVING SUM(cantidad) > 0
        ), ventas_producto AS (
            SELECT tienda_id, producto_id,
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 29 DAY
                                              AND DATE '{fecha_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units30,
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 29 DAY
                                              AND DATE '{fecha_stock.isoformat()}'
                         THEN total_venta ELSE 0 END) AS sales30,
                SUM(CASE WHEN fecha_venta > DATE '{fecha_stock.isoformat()}' - INTERVAL 12 MONTH
                         AND fecha_venta <= DATE '{fecha_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units12,
                SUM(CASE WHEN fecha_venta > DATE '{fecha_stock.isoformat()}' - INTERVAL 12 MONTH
                         AND fecha_venta <= DATE '{fecha_stock.isoformat()}'
                         THEN total_venta ELSE 0 END) AS sales12
            FROM {ventas}
            GROUP BY 1, 2
        )
        SELECT st.tienda_id AS "storeId", st.producto_id AS "productId", st.product,
            st.category, st.line, st.subline, st.brand,
            CAST(st.stock_units AS DOUBLE) AS "stockUnits",
            CAST(st.stock_value AS DOUBLE) AS "stockValue",
            CAST(st.good_units AS DOUBLE) AS "goodUnits",
            CAST(st.merma_stock_units AS DOUBLE) AS "mermaStockUnits",
            CAST(st.desmedro_stock_units AS DOUBLE) AS "desmedroStockUnits",
            CAST(COALESCE(v.units30, 0) AS DOUBLE) AS "units30",
            CAST(COALESCE(v.sales30, 0) AS DOUBLE) AS "sales30",
            CAST(COALESCE(v.units12, 0) AS DOUBLE) AS "units12",
            CAST(COALESCE(v.sales12, 0) AS DOUBLE) AS "sales12"
        FROM st LEFT JOIN ventas_producto v USING (tienda_id, producto_id)
        ORDER BY st.tienda_id, st.stock_units DESC, st.product
        """,
    )

    detalle_predictivo = filas(
        conexion,
        f"""
        WITH productos_stock AS (
            SELECT DISTINCT tienda_id, producto_id
            FROM {stock}
            WHERE producto_id IS NOT NULL
        ), ventas_ventanas AS (
            SELECT tienda_id, producto_id,
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 59 DAY
                                              AND DATE '{fecha_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units60,
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 89 DAY
                                              AND DATE '{fecha_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units90
            FROM {ventas}
            WHERE producto_id IS NOT NULL
              AND fecha_venta BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 89 DAY
                                  AND DATE '{fecha_stock.isoformat()}'
            GROUP BY 1, 2
        ), merma_ventanas AS (
            SELECT tienda_id, producto_id,
                SUM(CASE WHEN fecha_analisis BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 29 DAY
                                                   AND DATE '{fecha_stock.isoformat()}'
                         THEN COALESCE(cantidad, 0) ELSE 0 END) AS merma30,
                SUM(CASE WHEN fecha_analisis BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 59 DAY
                                                   AND DATE '{fecha_stock.isoformat()}'
                         THEN COALESCE(cantidad, 0) ELSE 0 END) AS merma60,
                SUM(CASE WHEN fecha_analisis BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 89 DAY
                                                   AND DATE '{fecha_stock.isoformat()}'
                         THEN COALESCE(cantidad, 0) ELSE 0 END) AS merma90
            FROM {merma}
            WHERE producto_id IS NOT NULL
              AND fecha_analisis BETWEEN DATE '{fecha_stock.isoformat()}' - INTERVAL 89 DAY
                                     AND DATE '{fecha_stock.isoformat()}'
            GROUP BY 1, 2
        )
        SELECT p.tienda_id AS "storeId", p.producto_id AS "productId",
            CAST(COALESCE(v.units60, 0) AS DOUBLE) AS "units60",
            CAST(COALESCE(v.units90, 0) AS DOUBLE) AS "units90",
            CAST(COALESCE(m.merma30, 0) AS DOUBLE) AS "merma30",
            CAST(COALESCE(m.merma60, 0) AS DOUBLE) AS "merma60",
            CAST(COALESCE(m.merma90, 0) AS DOUBLE) AS "merma90"
        FROM productos_stock p
        LEFT JOIN ventas_ventanas v USING (tienda_id, producto_id)
        LEFT JOIN merma_ventanas m USING (tienda_id, producto_id)
        ORDER BY 1, 2
        """,
    )

    anios = sorted({registro["year"] for registro in base_mensual})
    resultado = {
        "metadata": {
            "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "salesCutoff": fecha_ultima_venta.isoformat(),
            "stockCutoff": fecha_stock.isoformat(),
            "stockPeriods": periodos_stock,
            "years": anios,
            "nonSellableRate": 0.18,
            "coverageRanges": [
                {"min": 0, "max": 29.9999, "label": "CRÍTICO", "color": "#DC2626"},
                {"min": 30, "max": 45, "label": "ALERTA", "color": "#F59E0B"},
                {"min": 45.0001, "max": 60, "label": "NORMAL", "color": "#16A34A"},
                {"min": 60.0001, "max": 90, "label": "OBSERVACIÓN", "color": "#64748B"},
                {"min": 90.0001, "max": 999999, "label": "EXCESO", "color": "#2563EB"},
            ],
            "eoq": {
                "available": True,
                "pilot": True,
                "orderCost": 5000,
                "annualHoldingCost": 8,
            },
            "rop": {
                "available": True,
                "pilot": True,
                "leadTimeDays": 4,
                "safetyStockUnits": 40,
            },
            "capacityIsProvisional": True,
        },
        "stores": dimensiones_tienda,
        "monthlyStore": base_mensual,
        "monthlyPersonnelArea": personal_por_area,
        "monthlyCategory": por_rubro,
        "monthlyLine": por_linea,
        "monthlySubline": por_sublinea,
        "monthlyBrand": por_marca,
        "monthlyPriceRange": rangos_precio,
        "stockStore": stock_tienda,
        "stockOrigin": antiguedad,
        "predictiveStore": cobertura,
        "predictiveCategory": rotacion_rubro,
        "predictiveRows": detalle_predictivo,
        "stockProducts": producto_extremos,
    }
    return resultado


def escribir(resultado: dict) -> None:
    SALIDA_PUBLICA.parent.mkdir(parents=True, exist_ok=True)
    # dashboard-stock.json fue reemplazado por dos archivos de carga diferida.
    # Eliminar únicamente esta salida regenerable evita duplicar ~60 MB en dist/portable.
    for obsoleto in (SALIDA_PUBLICA.parent / "dashboard-stock.json", SALIDA_COMPILADA.parent / "dashboard-stock.json"):
        obsoleto.unlink(missing_ok=True)
    resumen_marca: dict[tuple[int, str, str], dict] = {}
    for registro in resultado["monthlyBrand"]:
        llave = (registro["periodId"], registro["storeId"], registro["brand"])
        agregado = resumen_marca.setdefault(
            llave,
            {
                "periodId": registro["periodId"], "storeId": registro["storeId"],
                "category": "", "line": "", "subline": "", "brand": registro["brand"],
                "net": 0.0, "units": 0.0,
            },
        )
        agregado["net"] += registro["net"]
        agregado["units"] += registro["units"]

    catalogo = sorted(
        {
            (registro["category"], registro["line"], registro["subline"])
            for registro in resultado["monthlySubline"]
        }
    )
    archivos = {
        "dashboard-brand.json": {"monthlyBrand": resultado["monthlyBrand"]},
        "dashboard-subline.json": {"monthlySubline": resultado["monthlySubline"]},
        "dashboard-price-range.json": {"monthlyPriceRange": resultado["monthlyPriceRange"]},
        # Separar el resumen de antigüedad del detalle por producto evita que la
        # pestaña de Inventario tenga que descargar ~60 MB antes de poder pintar.
        "dashboard-stock-origin.json": {"stockOrigin": resultado["stockOrigin"]},
        "dashboard-stock-products.json": {"stockProducts": resultado["stockProducts"]},
        "dashboard-predictive.json": {
            "note": (
                "Ventanas móviles de 30/60/90 días ancladas al corte comercial "
                f"{resultado['metadata']['stockCutoff']}. "
                "Ventas usa fecha_venta y la merma histórica usa fecha_analisis. "
                "La vendibilidad actual usa los tres estados homologados de FactStock: BUENO, MERMA y DESMEDRO. "
                "El filtro MES no desplaza estas ventanas porque FactStock es una foto de corte."
            ),
            "rows": resultado["predictiveRows"],
        },
    }
    principal = {
        **{
            clave: valor for clave, valor in resultado.items()
            if clave not in {"predictiveRows", "monthlyPriceRange"}
        },
        "hierarchyCatalog": [
            {"category": rubro, "line": linea, "subline": sublinea}
            for rubro, linea, sublinea in catalogo
        ],
        "monthlySubline": [],
        "monthlyBrand": list(resumen_marca.values()),
        "monthlyPriceRange": [],
        "stockOrigin": [],
        "stockProducts": [],
    }
    archivos["dashboard.json"] = principal

    for nombre, contenido in archivos.items():
        destino = SALIDA_PUBLICA.parent / nombre
        destino.write_text(json.dumps(contenido, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        if SALIDA_COMPILADA.parent.parent.parent.exists():
            SALIDA_COMPILADA.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(destino, SALIDA_COMPILADA.parent / nombre)
        print(f"Datos web: {destino.name} ({destino.stat().st_size / 1024 / 1024:.2f} MB)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera el conjunto compacto para el dashboard Angular.")
    parser.parse_args()
    escribir(generar())
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
