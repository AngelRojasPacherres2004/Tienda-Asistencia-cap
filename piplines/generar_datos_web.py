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
from maestros import homologar_tienda_python, tienda_id_python
from xlsx_staging import origen_xlsx_csv


WEB_DIR = PROJECT_ROOT / "commercial-dashboard"
SALIDA_PUBLICA = WEB_DIR / "public" / "assets" / "data" / "dashboard.json"
SALIDA_COMPILADA = WEB_DIR / "dist" / "dashboard-web" / "browser" / "assets" / "data" / "dashboard.json"
REPORTE_COBERTURA = CAPA2_DIR / "Reporte_Cobertura.json"
PERSONAL_XLSX = PROJECT_ROOT / "capa1" / "PERSONAL_TIENDAS.xlsx"


def normalizar(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    return valor


def particionar_registros_anuales(registros: list[dict], nombre: str, clave: str) -> dict[str, dict]:
    """Divide detalles temporales sin alterar filas ni dimensiones."""

    filas_por_anio: dict[int, list[dict]] = {}
    for registro in registros:
        periodo = int(registro.get("periodId") or 0)
        if periodo <= 0:
            raise ValueError(f"{clave} contiene una fila sin periodId válido")
        filas_por_anio.setdefault(periodo // 100, []).append(registro)
    return {
        f"{nombre}-{anio:04d}.json": {clave: filas}
        for anio, filas in sorted(filas_por_anio.items())
    }


def particionar_registros_mensuales(registros: list[dict], nombre: str, clave: str) -> dict[str, dict]:
    """Conserva exactamente las filas y el orden dentro de cada mes."""

    filas_por_periodo: dict[int, list[dict]] = {}
    for registro in registros:
        periodo = int(registro.get("periodId") or 0)
        if periodo <= 0 or not 1 <= periodo % 100 <= 12:
            raise ValueError(f"{clave} contiene una fila sin periodId mensual válido")
        filas_por_periodo.setdefault(periodo, []).append(registro)
    return {
        f"{nombre}-{periodo // 100:04d}-{periodo % 100:02d}.json": {clave: filas}
        for periodo, filas in sorted(filas_por_periodo.items())
    }


def resumir_marcas(registros: list[dict]) -> list[dict]:
    """Conserva los totales visibles sin repetir dimensiones vacías por marca."""

    resumen: dict[tuple[int, str, str], dict] = {}
    for registro in registros:
        llave = (registro["periodId"], registro["storeId"], registro["brand"])
        agregado = resumen.setdefault(
            llave,
            {
                "periodId": registro["periodId"],
                "storeId": registro["storeId"],
                "brand": registro["brand"],
                "net": 0.0,
                "units": 0.0,
            },
        )
        agregado["net"] += registro["net"]
        agregado["units"] += registro["units"]
    return list(resumen.values())


def resumir_vendedores(registros: list[dict]) -> list[dict]:
    """Preagrupa el ranking sin perder el detalle jerárquico opcional."""

    resumen: dict[tuple[int, str, str], dict] = {}
    for registro in registros:
        llave = (registro["periodId"], registro["storeId"], registro["seller"])
        agregado = resumen.setdefault(
            llave,
            {
                "periodId": registro["periodId"],
                "storeId": registro["storeId"],
                "category": "",
                "line": "",
                "subline": "",
                "seller": registro["seller"],
                "net": 0.0,
                "units": 0.0,
                "transactions": 0.0,
            },
        )
        for campo in ("net", "units", "transactions"):
            agregado[campo] += registro[campo]
    return list(resumen.values())


def resumir_rangos_precio(registros: list[dict]) -> list[dict]:
    """Mantiene ventas/unidades por banda para la gráfica sin filtros jerárquicos."""

    resumen: dict[tuple[int, str, int], dict] = {}
    for registro in registros:
        llave = (registro["periodId"], registro["storeId"], registro["bandOrder"])
        agregado = resumen.setdefault(
            llave,
            {
                "periodId": registro["periodId"],
                "storeId": registro["storeId"],
                "category": "",
                "line": "",
                "subline": "",
                "bandOrder": registro["bandOrder"],
                "priceBand": registro["priceBand"],
                "net": 0.0,
                "units": 0.0,
            },
        )
        agregado["net"] += registro["net"]
        agregado["units"] += registro["units"]
    return list(resumen.values())


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


def rubro_homologado_sql(expresion: str) -> str:
    """Mantiene la fuente intacta y entrega un rubro canónico al dashboard."""
    clave = f"UPPER(TRIM(CAST({expresion} AS VARCHAR)))"
    return f"""
        CASE
            WHEN {expresion} IS NULL OR TRIM(CAST({expresion} AS VARCHAR)) = '' THEN 'PRODUCTOS VARIOS / N/A'
            WHEN {clave} IN ('COMPUTO', 'CÓMPUTO') THEN 'CÓMPUTO'
            WHEN {clave} IN ('FERRETERIA', 'FERRETERÍA') THEN 'FERRETERÍA'
            WHEN {clave} IN ('TECNOLOGIA', 'TECNOLOGÍA') THEN 'TECNOLOGÍA'
            WHEN {clave} IN ('LINEA BLANCA', 'LÍNEA BLANCA') THEN 'LÍNEA BLANCA'
            WHEN {clave} IN ('BANO Y LAVANDERIA', 'BAÑO Y LAVANDERÍA') THEN 'BAÑO Y LAVANDERÍA'
            WHEN {clave} IN ('RECREACION', 'RECREACIÓN') THEN 'RECREACIÓN'
            WHEN {clave} IN ('JOYERIA', 'JOYERÍA') THEN 'JOYERÍA'
            WHEN {clave} IN ('MOCHILA/MALETA/MALETIN/CARTERA', 'MOCHILA/MALETA/MALETÍN/CARTERA', 'MOCHILAS MALETAS') THEN 'MOCHILA/MALETA/MALETÍN/CARTERA'
            WHEN {clave} IN ('MUEBLE', 'MUEBLES') THEN 'MUEBLE'
            WHEN {clave} IN ('VARIOS', 'N/A', 'SIN CLASIFICACIÓN', 'SIN CLASIFICACION') THEN 'PRODUCTOS VARIOS / N/A'
            ELSE TRIM(CAST({expresion} AS VARCHAR))
        END
    """


def expresion_dimension(columna: str, alias: str, vacio: str) -> str:
    if columna.strip().lower() == "rubro":
        return f"{rubro_homologado_sql(columna)} AS {alias}"
    return f"COALESCE(NULLIF(TRIM({columna}), ''), '{vacio}') AS {alias}"


def cargar_reporte_cobertura() -> dict:
    if not REPORTE_COBERTURA.exists():
        return {}
    return json.loads(REPORTE_COBERTURA.read_text(encoding="utf-8"))


def fecha_excel_sql(expresion: str) -> str:
    """Convierte fecha ISO/dd-mm-yyyy o serial Excel sin alterar el archivo fuente."""
    raw = f"NULLIF(TRIM(CAST({expresion} AS VARCHAR)), '')"
    return f"""
        CASE
            WHEN {raw} IS NULL THEN NULL
            WHEN regexp_full_match({raw}, '^[0-9]+([.,][0-9]+)?$')
                THEN CAST(DATE '1899-12-30' + TRY_CAST(REPLACE({raw}, ',', '.') AS INTEGER) AS DATE)
            ELSE COALESCE(
                TRY_CAST({raw} AS DATE),
                CAST(try_strptime({raw}, '%d/%m/%Y') AS DATE),
                CAST(try_strptime({raw}, '%d-%m-%Y') AS DATE)
            )
        END
    """


def cargar_personal_detalle(conexion: duckdb.DuckDBPyConnection) -> list[dict]:
    """Publica solo atributos laborales/demográficos mínimos; excluye DNI y contacto."""
    if not PERSONAL_XLSX.exists():
        return []
    origen = origen_xlsx_csv(PERSONAL_XLSX, "PERSONAL_TIENDAS")
    fecha_nacimiento = fecha_excel_sql('"fecha_nacimiento"')
    fecha_ingreso = fecha_excel_sql('"fecha_ingreso"')
    fecha_retiro = fecha_excel_sql('"fecha_retiro"')
    registros = filas(
        conexion,
        f"""
        WITH normalizado AS (
            SELECT
                NULLIF(TRIM(CAST("nombre_completo" AS VARCHAR)), '') AS name,
                NULLIF(TRIM(CAST("tienda" AS VARCHAR)), '') AS "rawStore",
                UPPER(NULLIF(TRIM(CAST("sexo" AS VARCHAR)), '')) AS gender,
                {fecha_nacimiento} AS "birthDate",
                TRY_CAST(NULLIF(TRIM(CAST("mes_cumpleanos" AS VARCHAR)), '') AS VARCHAR) AS "birthdayMonthName",
                TRY_CAST(NULLIF(TRIM(CAST("dia_cumpleanos" AS VARCHAR)), '') AS INTEGER) AS "birthdayDaySource",
                UPPER(COALESCE(NULLIF(TRIM(CAST("puesto" AS VARCHAR)), ''), 'SIN PUESTO')) AS role,
                UPPER(COALESCE(NULLIF(TRIM(CAST("area" AS VARCHAR)), ''), 'SIN ÁREA')) AS area,
                {fecha_ingreso} AS "hireDate",
                {fecha_retiro} AS "retirementDate",
                UPPER(NULLIF(TRIM(CAST("motivo_retiro" AS VARCHAR)), '')) AS "retirementReason",
                UPPER(COALESCE(NULLIF(TRIM(CAST("estado_laboral" AS VARCHAR)), ''), 'SIN ESTADO')) AS status
            FROM {origen}
        )
        SELECT DISTINCT
            name,
            "rawStore",
            CASE WHEN gender IN ('M', 'MASCULINO', 'HOMBRE') THEN 'M'
                 WHEN gender IN ('F', 'FEMENINO', 'MUJER') THEN 'F'
                 ELSE 'N/A' END AS gender,
            "birthDate",
            COALESCE(EXTRACT(MONTH FROM "birthDate")::INTEGER,
                CASE UPPER("birthdayMonthName")
                    WHEN 'ENERO' THEN 1 WHEN 'FEBRERO' THEN 2 WHEN 'MARZO' THEN 3
                    WHEN 'ABRIL' THEN 4 WHEN 'MAYO' THEN 5 WHEN 'JUNIO' THEN 6
                    WHEN 'JULIO' THEN 7 WHEN 'AGOSTO' THEN 8 WHEN 'SEPTIEMBRE' THEN 9
                    WHEN 'OCTUBRE' THEN 10 WHEN 'NOVIEMBRE' THEN 11 WHEN 'DICIEMBRE' THEN 12
                END) AS "birthdayMonth",
            COALESCE(EXTRACT(DAY FROM "birthDate")::INTEGER, "birthdayDaySource") AS "birthdayDay",
            role, area,
            CASE WHEN area IN ('CAJA', 'SEGURIDAD', 'ADMINISTRATIVA', 'ADMINISTRATIVO', 'ALMACÉN', 'ALMACEN')
                 THEN 'SOPORTE' ELSE 'COMERCIAL' END AS "areaType",
            "hireDate", "retirementDate", "retirementReason", status
        FROM normalizado
        WHERE name IS NOT NULL AND "rawStore" IS NOT NULL
        ORDER BY "rawStore", name
        """,
    )
    salida: list[dict] = []
    for registro in registros:
        store_id = tienda_id_python(homologar_tienda_python(registro.pop("rawStore", None)), estricto=True)
        if store_id:
            registro["storeId"] = store_id
            salida.append(registro)
    return salida


def resumen_mensual_dimension(
    conexion: duckdb.DuckDBPyConnection,
    ventas: str,
    ingresos: str,
    dimensiones: list[tuple[str, str, str]],
) -> list[dict]:
    """Resume ventas e ingresos al nivel exacto elegido para filtros web."""
    aliases = [alias for _, alias, _ in dimensiones]
    expresiones_venta = [expresion_dimension(columna, alias, vacio) for columna, alias, vacio in dimensiones]
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
    ventas_fuente = literal_parquet("FactVentas")
    stock_fuente = literal_parquet("FactStock")
    ingresos_fuente = literal_parquet("FactIngresos")
    metas = literal_parquet("FactMetasTienda")
    personal = literal_parquet("FactPersonalTienda")
    trafico_fuente = literal_parquet("FactTraficoClientes")
    rubro_dashboard = rubro_homologado_sql("rubro")
    tiendas = literal_parquet("DimTiendas")
    merma = literal_parquet("FactMerma")

    reporte_cobertura = cargar_reporte_cobertura()
    conexion = duckdb.connect()
    fecha_ultima_venta = conexion.execute(f"SELECT MAX(fecha_venta) FROM {ventas_fuente}").fetchone()[0]
    fecha_ultima_stock = conexion.execute(f"SELECT MAX(fecha_corte) FROM {stock_fuente}").fetchone()[0]
    fecha_corte = date.fromisoformat(
        reporte_cobertura.get("selectedCutoff")
        or (fecha_ultima_venta or fecha_ultima_stock or date.today()).isoformat()
    )
    corte_sql = f"DATE '{fecha_corte.isoformat()}'"
    # El Parquet conserva el día posterior para el siguiente corte. Ninguna
    # agregación del dashboard actual puede leerlo antes de su publicación.
    ventas = f"(SELECT * FROM {ventas_fuente} WHERE fecha_venta <= {corte_sql})"
    ingresos = f"(SELECT * FROM {ingresos_fuente} WHERE fecha_ingreso <= {corte_sql})"
    trafico = f"(SELECT * FROM {trafico_fuente} WHERE fecha <= {corte_sql})"
    stock_historico = f"(SELECT * FROM {stock_fuente} WHERE fecha_corte <= {corte_sql})"
    fecha_stock = conexion.execute(
        f"SELECT MAX(fecha_corte) FROM {stock_historico}"
    ).fetchone()[0]
    fecha_ancla_stock = fecha_stock or fecha_corte
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
        if fecha_stock
        else f"(SELECT * FROM {stock_historico} WHERE FALSE)"
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
            CAST(cant_colaboradores_normal AS DOUBLE) AS "normalStaff",
            CAST(colaboradores_camp AS DOUBLE) AS "campaignStaff",
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
                SUM(CASE WHEN es_meta_valida AND indicador = 'META VENTAS' THEN meta_ventas ELSE 0 END) AS target
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
        ), periodos AS (
            SELECT CAST(strftime(fecha, '%Y%m') AS INTEGER) AS periodo_id
            FROM generate_series(
                DATE '2023-01-01',
                -- Incluye metas futuras para calcular la meta anual completa.
                DATE '{fecha_corte.year}-12-01',
                INTERVAL 1 MONTH
            ) AS calendario(fecha)
        ), llaves AS (
            SELECT p.periodo_id, t.tienda_id
            FROM periodos p
            CROSS JOIN (
                SELECT tienda_id FROM {tiendas} WHERE COALESCE(es_tienda, FALSE)
            ) t
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

    metas_por_rubro = filas(
        conexion,
        f"""
        SELECT periodo_id AS "periodId", tienda_id AS "storeId",
            CASE indicador
                WHEN 'META RUBRO TEXTIL' THEN 'TEXTIL'
                WHEN 'META RUBRO CALZADO' THEN 'CALZADO'
                WHEN 'META RUBROS RESTANTES' THEN 'OTROS'
            END AS category,
            CAST(meta_ventas AS DOUBLE) AS target,
            'DEFINIDA' AS source
        FROM {metas}
        WHERE es_meta_valida
          AND indicador IN ('META RUBRO TEXTIL', 'META RUBRO CALZADO', 'META RUBROS RESTANTES')
        ORDER BY 1, 2, 3
        """,
    )

    diario_tienda = filas(
        conexion,
        f"""
        SELECT
            CAST(fecha_venta AS DATE) AS "date",
            CAST(strftime(fecha_venta, '%Y%m') AS INTEGER) AS "periodId",
            CAST(EXTRACT(YEAR FROM fecha_venta) AS INTEGER) AS year,
            CAST(EXTRACT(MONTH FROM fecha_venta) AS INTEGER) AS month,
            tienda_id AS "storeId",
            {rubro_dashboard} AS category,
            COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
            COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
            COALESCE(NULLIF(TRIM(marca), ''), 'SIN MARCA') AS brand,
            CASE
                WHEN cantidad <= 0 OR total_venta <= 0 THEN NULL
                WHEN total_venta / cantidad <= 30 THEN 1
                WHEN total_venta / cantidad <= 60 THEN 2
                WHEN total_venta / cantidad <= 90 THEN 3
                WHEN total_venta / cantidad <= 120 THEN 4
                WHEN total_venta / cantidad <= 150 THEN 5
                WHEN total_venta / cantidad <= 180 THEN 6
                WHEN total_venta / cantidad <= 210 THEN 7
                WHEN total_venta / cantidad <= 240 THEN 8
                WHEN total_venta / cantidad <= 270 THEN 9
                WHEN total_venta / cantidad <= 300 THEN 10
                ELSE 11
            END AS "bandOrder",
            CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0
                THEN cantidad * precio_sugerido ELSE 0 END) AS DOUBLE) AS gross,
            CAST(SUM(CASE WHEN total_venta > 0 THEN total_venta ELSE 0 END) AS DOUBLE) AS "positiveReal",
            CAST(ABS(SUM(CASE WHEN total_venta < 0 THEN total_venta ELSE 0 END)) AS DOUBLE) AS notes,
            CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad * precio_sugerido ELSE 0 END)
                - SUM(CASE WHEN total_venta > 0 THEN total_venta ELSE 0 END) AS DOUBLE) AS discount,
            CAST(SUM(total_venta) AS DOUBLE) AS net,
            COUNT(DISTINCT CAST(fecha_venta AS VARCHAR) || '|' || tienda_id || '|' || nro_venta) AS transactions,
            CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS DOUBLE) AS units,
            CAST(0 AS DOUBLE) AS target,
            CAST(0 AS DOUBLE) AS traffic,
            CAST(0 AS DOUBLE) AS personnel,
            CAST(0 AS DOUBLE) AS received
        FROM {ventas}
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
        ORDER BY 1, 5, 6, 7, 8, 9
        """,
    )
    # Afluencia comercial real por hora. Los tickets se deduplican por
    # fecha/tienda/número de venta para no contar una vez por cada producto.
    ventas_hora_mensual = filas(
        conexion,
        f"""
        WITH tickets AS (
            SELECT
                periodo_id, fecha_venta, tienda_id, nro_venta,
                CAST(EXTRACT(HOUR FROM MIN(hora_venta)) AS INTEGER) AS hour,
                SUM(total_venta) AS net
            FROM {ventas}
            WHERE hora_venta IS NOT NULL
            GROUP BY 1, 2, 3, 4
        )
        SELECT
            periodo_id AS "periodId",
            tienda_id AS "storeId",
            hour,
            CAST(COUNT(*) AS BIGINT) AS transactions,
            CAST(SUM(net) AS DOUBLE) AS net
        FROM tickets
        GROUP BY 1, 2, 3
        ORDER BY 1, 2, 3
        """,
    )
    ventas_hora_diaria = filas(
        conexion,
        f"""
        WITH tickets AS (
            SELECT
                fecha_venta, periodo_id, tienda_id, nro_venta,
                CAST(EXTRACT(HOUR FROM MIN(hora_venta)) AS INTEGER) AS hour,
                SUM(total_venta) AS net
            FROM {ventas}
            WHERE hora_venta IS NOT NULL
            GROUP BY 1, 2, 3, 4
        )
        SELECT
            CAST(fecha_venta AS DATE) AS "date",
            periodo_id AS "periodId",
            tienda_id AS "storeId",
            hour,
            CAST(COUNT(*) AS BIGINT) AS transactions,
            CAST(SUM(net) AS DOUBLE) AS net
        FROM tickets
        GROUP BY 1, 2, 3, 4
        ORDER BY 1, 3, 4
        """,
    )
    diario_trafico = filas(
        conexion,
        f"""
        SELECT fecha AS "date", tienda_id AS "storeId",
            CAST(SUM(CASE WHEN es_dato_valido THEN cantidad_personas ELSE 0 END) AS DOUBLE) AS traffic
        FROM {trafico}
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
    )
    diario_ingresos = filas(
        conexion,
        f"""
        SELECT fecha_ingreso AS "date", tienda_id AS "storeId",
            CAST(SUM(cantidad_recibida) AS DOUBLE) AS received
        FROM {ingresos}
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
    )

    # Para tiendas sin movimientos en FactIngresos, calculamos una reposición
    # conciliada: variación de stock entre cortes + unidades vendidas dentro del
    # mismo intervalo. Es una estimación basada íntegramente en los inputs, no
    # un cero de relleno. La UI siempre prefiere el ingreso directo cuando exista.
    ingresos_conciliados = filas(
        conexion,
        f"""
        WITH stock_cortes AS (
            SELECT tienda_id, fecha_corte, SUM(cantidad) AS stock_unidades
            FROM {stock_historico}
            WHERE fecha_corte IS NOT NULL
            GROUP BY 1, 2
        ), intervalos AS (
            SELECT
                tienda_id,
                fecha_corte,
                stock_unidades,
                LAG(fecha_corte) OVER (PARTITION BY tienda_id ORDER BY fecha_corte) AS corte_anterior,
                LAG(stock_unidades) OVER (PARTITION BY tienda_id ORDER BY fecha_corte) AS stock_anterior
            FROM stock_cortes
        ), conciliacion AS (
            SELECT
                i.tienda_id,
                i.fecha_corte,
                i.corte_anterior,
                i.stock_unidades,
                i.stock_anterior,
                COALESCE(SUM(CASE WHEN v.cantidad > 0 AND v.total_venta >= 0 THEN v.cantidad ELSE 0 END), 0) AS unidades_vendidas
            FROM intervalos i
            LEFT JOIN {ventas} v
                ON v.tienda_id = i.tienda_id
               AND v.fecha_venta > i.corte_anterior
               AND v.fecha_venta <= i.fecha_corte
            WHERE i.corte_anterior IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5
        )
        SELECT
            tienda_id AS "storeId",
            CAST(
                SUM(GREATEST(stock_unidades - stock_anterior + unidades_vendidas, 0))
                / NULLIF(SUM(DATE_DIFF('day', corte_anterior, fecha_corte)), 0)
                AS DOUBLE
            ) AS daily
        FROM conciliacion
        GROUP BY 1
        HAVING SUM(DATE_DIFF('day', corte_anterior, fecha_corte)) > 0
        ORDER BY 1
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
    personal_detalle = cargar_personal_detalle(conexion)

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
            {rubro_dashboard} AS category,
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

    desempeno_vendedores = filas(
        conexion,
        f"""
        SELECT periodo_id AS "periodId", tienda_id AS "storeId",
            {rubro_dashboard} AS category,
            COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
            COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
            COALESCE(NULLIF(TRIM(vendedor_nombre), ''), NULLIF(TRIM(vendedor_codigo), ''), 'SIN VENDEDOR') AS seller,
            CAST(SUM(total_venta) AS DOUBLE) AS net,
            CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS DOUBLE) AS units,
            CAST(COUNT(DISTINCT CAST(fecha_venta AS VARCHAR) || '|' || tienda_id || '|' || nro_venta) AS DOUBLE) AS transactions
        FROM {ventas}
        WHERE COALESCE(NULLIF(TRIM(vendedor_nombre), ''), NULLIF(TRIM(vendedor_codigo), '')) IS NOT NULL
        GROUP BY 1, 2, 3, 4, 5, 6
        HAVING SUM(total_venta) <> 0
        ORDER BY 1, 2, 6
        """,
    )

    desempeno_clientes = filas(
        conexion,
        f"""
        SELECT periodo_id AS "periodId", tienda_id AS "storeId",
            {rubro_dashboard} AS category,
            COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
            COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
            COALESCE(NULLIF(TRIM(cliente), ''), 'SIN CLIENTE') AS client,
            CAST(SUM(total_venta) AS DOUBLE) AS net,
            CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS DOUBLE) AS units,
            CAST(COUNT(DISTINCT CAST(fecha_venta AS VARCHAR) || '|' || tienda_id || '|' || nro_venta) AS DOUBLE) AS transactions
        FROM {ventas}
        WHERE NULLIF(TRIM(cliente), '') IS NOT NULL
        GROUP BY 1, 2, 3, 4, 5, 6
        HAVING SUM(total_venta) <> 0
        ORDER BY 1, 2, 6
        """,
    )

    rangos_precio = filas(
        conexion,
        f"""
        WITH ventas_positivas AS (
            SELECT
                periodo_id, tienda_id,
                {rubro_dashboard} AS category,
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
            {rubro_dashboard} AS category,
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
            WHERE fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 29 DAY
                                  AND DATE '{fecha_ancla_stock.isoformat()}'
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
            SELECT tienda_id, {rubro_dashboard} AS category,
                SUM(valor_stock) AS stock_value, SUM(cantidad) AS stock_units
            FROM {stock} GROUP BY 1, 2
        ), v30 AS (
            SELECT tienda_id, {rubro_dashboard} AS category,
                SUM(total_venta) AS sales30,
                SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units30
            FROM {ventas}
            WHERE fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 29 DAY
                                  AND DATE '{fecha_ancla_stock.isoformat()}'
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
                {rubro_dashboard} AS category,
                COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
                COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
                COALESCE(NULLIF(TRIM(marca), ''), 'SIN MARCA') AS brand,
                MAX(NULLIF(TRIM(CAST(codigo_nissei AS VARCHAR)), '')) AS product_code,
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
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 29 DAY
                                              AND DATE '{fecha_ancla_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units30,
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 29 DAY
                                              AND DATE '{fecha_ancla_stock.isoformat()}'
                         THEN total_venta ELSE 0 END) AS sales30,
                SUM(CASE WHEN fecha_venta > DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 12 MONTH
                         AND fecha_venta <= DATE '{fecha_ancla_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units12,
                SUM(CASE WHEN fecha_venta > DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 12 MONTH
                         AND fecha_venta <= DATE '{fecha_ancla_stock.isoformat()}'
                         THEN total_venta ELSE 0 END) AS sales12
            FROM {ventas}
            GROUP BY 1, 2
        )
        SELECT st.tienda_id AS "storeId", st.producto_id AS "productId", st.product_code AS "productCode", st.product,
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
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 59 DAY
                                              AND DATE '{fecha_ancla_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units60,
                SUM(CASE WHEN fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 89 DAY
                                              AND DATE '{fecha_ancla_stock.isoformat()}'
                         AND cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS units90
            FROM {ventas}
            WHERE producto_id IS NOT NULL
              AND fecha_venta BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 89 DAY
                                  AND DATE '{fecha_ancla_stock.isoformat()}'
            GROUP BY 1, 2
        ), merma_ventanas AS (
            SELECT tienda_id, producto_id,
                SUM(CASE WHEN fecha_analisis BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 29 DAY
                                                   AND DATE '{fecha_ancla_stock.isoformat()}'
                         THEN COALESCE(cantidad, 0) ELSE 0 END) AS merma30,
                SUM(CASE WHEN fecha_analisis BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 59 DAY
                                                   AND DATE '{fecha_ancla_stock.isoformat()}'
                         THEN COALESCE(cantidad, 0) ELSE 0 END) AS merma60,
                SUM(CASE WHEN fecha_analisis BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 89 DAY
                                                   AND DATE '{fecha_ancla_stock.isoformat()}'
                         THEN COALESCE(cantidad, 0) ELSE 0 END) AS merma90
            FROM {merma}
            WHERE producto_id IS NOT NULL
              AND fecha_analisis BETWEEN DATE '{fecha_ancla_stock.isoformat()}' - INTERVAL 89 DAY
                                     AND DATE '{fecha_ancla_stock.isoformat()}'
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

    cobertura_fuentes = reporte_cobertura.get("sources", [])
    advertencias_datos = [
        {"source": fuente.get("source", "Fuente"), "message": fuente.get("message", "")}
        for fuente in cobertura_fuentes
        if fuente.get("status") == "warning"
    ]
    advertencias_datos.extend(
        {"source": "Fecha de corte", "message": mensaje}
        for mensaje in reporte_cobertura.get("manualWarnings", [])
    )
    cobertura_por_nombre = {
        fuente.get("source"): fuente for fuente in cobertura_fuentes
    }
    ventas_hasta = cobertura_por_nombre.get("Ventas", {}).get("dataThrough")
    stock_hasta = cobertura_por_nombre.get("Stock", {}).get("dataThrough")
    anios = sorted({registro["year"] for registro in base_mensual})
    resultado = {
        "metadata": {
            "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "selectedCutoff": fecha_corte.isoformat(),
            "salesCutoff": fecha_corte.isoformat(),
            "salesDataThrough": ventas_hasta or (fecha_ultima_venta.isoformat() if fecha_ultima_venta else None),
            "stockCutoff": fecha_ancla_stock.isoformat(),
            "stockDataThrough": stock_hasta or (fecha_stock.isoformat() if fecha_stock else None),
            "dataWarnings": advertencias_datos,
            "sourceCoverage": cobertura_fuentes,
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
        "monthlyHourlySales": ventas_hora_mensual,
        "dailyStore": diario_tienda,
        "dailyHourlySales": ventas_hora_diaria,
        "dailyTraffic": diario_trafico,
        "dailyReceived": diario_ingresos,
        "inferredReceivedDaily": ingresos_conciliados,
        "monthlyPersonnelArea": personal_por_area,
        "personnelProfiles": personal_detalle,
        "monthlyCategory": por_rubro,
        "monthlyCategoryTarget": metas_por_rubro,
        "monthlyLine": por_linea,
        "monthlySubline": por_sublinea,
        "monthlyBrand": por_marca,
        "sellerPerformance": desempeno_vendedores,
        "clientPerformance": desempeno_clientes,
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
    # Los archivos grandes se sirven por demanda. El diario histórico único fue
    # reemplazado por particiones mensuales para que elegir un día no descargue
    # más de 500 MB antes de recalcular los indicadores.
    obsoletos = [
        SALIDA_PUBLICA.parent / "dashboard-stock.json",
        SALIDA_COMPILADA.parent / "dashboard-stock.json",
        SALIDA_PUBLICA.parent / "dashboard-daily.json",
        SALIDA_COMPILADA.parent / "dashboard-daily.json",
        SALIDA_PUBLICA.parent / "dashboard-sellers.json",
        SALIDA_COMPILADA.parent / "dashboard-sellers.json",
        SALIDA_PUBLICA.parent / "dashboard-brand.json",
        SALIDA_COMPILADA.parent / "dashboard-brand.json",
        SALIDA_PUBLICA.parent / "dashboard-subline.json",
        SALIDA_COMPILADA.parent / "dashboard-subline.json",
        SALIDA_PUBLICA.parent / "dashboard-price-range.json",
        SALIDA_COMPILADA.parent / "dashboard-price-range.json",
        *SALIDA_PUBLICA.parent.glob("dashboard-daily-????-??.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-daily-????-??.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-sellers-????.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-sellers-????.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-sellers-????-??.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-sellers-????-??.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-sellers-summary-????.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-sellers-summary-????.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-brand-????.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-brand-????.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-subline-????.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-subline-????.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-price-range-????.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-price-range-????.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-price-range-????-??.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-price-range-????-??.json"),
        *SALIDA_PUBLICA.parent.glob("dashboard-price-range-summary-????.json"),
        *SALIDA_COMPILADA.parent.glob("dashboard-price-range-summary-????.json"),
    ]
    for obsoleto in obsoletos:
        obsoleto.unlink(missing_ok=True)
    catalogo = sorted(
        {
            (registro["category"], registro["line"], registro["subline"])
            for registro in resultado["monthlySubline"]
        }
    )
    diario_por_mes: dict[str, list[dict]] = {}
    for registro in resultado["dailyStore"]:
        periodo = int(registro["periodId"])
        nombre = f"dashboard-daily-{periodo // 100:04d}-{periodo % 100:02d}.json"
        diario_por_mes.setdefault(nombre, []).append(registro)
    horas_por_mes: dict[str, list[dict]] = {}
    for registro in resultado["dailyHourlySales"]:
        periodo = int(registro["periodId"])
        nombre = f"dashboard-daily-{periodo // 100:04d}-{periodo % 100:02d}.json"
        horas_por_mes.setdefault(nombre, []).append(registro)

    archivos = {
        **{
            nombre: {"dailyStore": filas_mes, "hourlySales": horas_por_mes.get(nombre, [])}
            for nombre, filas_mes in sorted(diario_por_mes.items())
        },
        # Los detalles temporales se descargan por año. La interfaz conserva un
        # fallback a los monolitos antiguos para abrir publicaciones previas.
        **particionar_registros_anuales(resultado["sellerPerformance"], "dashboard-sellers", "sellerPerformance"),
        **particionar_registros_mensuales(resultado["sellerPerformance"], "dashboard-sellers", "sellerPerformance"),
        **particionar_registros_anuales(resumir_vendedores(resultado["sellerPerformance"]), "dashboard-sellers-summary", "sellerPerformance"),
        **particionar_registros_anuales(resultado["monthlyBrand"], "dashboard-brand", "monthlyBrand"),
        **particionar_registros_anuales(resultado["monthlySubline"], "dashboard-subline", "monthlySubline"),
        **particionar_registros_anuales(resultado["monthlyPriceRange"], "dashboard-price-range", "monthlyPriceRange"),
        **particionar_registros_mensuales(resultado["monthlyPriceRange"], "dashboard-price-range", "monthlyPriceRange"),
        **particionar_registros_anuales(resumir_rangos_precio(resultado["monthlyPriceRange"]), "dashboard-price-range-summary", "monthlyPriceRange"),
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
            if clave not in {
                "predictiveRows", "monthlyPriceRange", "dailyStore", "dailyHourlySales",
                "sellerPerformance", "clientPerformance",
            }
        },
        "hierarchyCatalog": [
            {"category": rubro, "line": linea, "subline": sublinea}
            for rubro, linea, sublinea in catalogo
        ],
        "monthlySubline": [],
        "monthlyBrand": resumir_marcas(resultado["monthlyBrand"]),
        "monthlyPriceRange": [],
        "sellerPerformance": [],
        "clientPerformance": [],
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
