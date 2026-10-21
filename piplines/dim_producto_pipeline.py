from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso

try:
    import duckdb
except ImportError as exc:
    raise SystemExit("Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt") from exc

from maestros import (
    sql_clasificacion_id,
    sql_codigo,
    sql_linea,
    sql_linea_id,
    sql_literal,
    sql_marca,
    sql_marca_id,
    sql_producto_id,
    sql_proveedor,
    sql_proveedor_id,
    sql_rubro,
    sql_rubro_codigo,
    sql_rubro_id,
    sql_sublinea,
    sql_sublinea_id,
)

from project_paths import PROJECT_ROOT, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA2_DIR = BASE_DIR / "capa2"
SALIDA = CAPA2_DIR / "DimProducto.parquet"
TEMP = WORK_TEMP_DIR / "DimProducto_temporal.parquet"
DIM_CLASIFICACION = CAPA2_DIR / "DimClasificacionProducto.parquet"
DIM_CLASIFICACION_TEMP = WORK_TEMP_DIR / "DimClasificacionProducto_ampliada_temporal.parquet"

FUENTES = [
    ("FactStock.parquet", 1, "STOCK"),
    ("FactIngresos.parquet", 2, "INGRESOS"),
    ("FactVentas.parquet", 3, "VENTAS"),
    ("FactTransferencias.parquet", 4, "TRANSFERENCIAS"),
    ("FactGuiasTransito.parquet", 5, "GUÍAS"),
    ("FactMerma.parquet", 6, "MERMA"),
]


def conectar():
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def columnas(con, archivo: Path) -> set[str]:
    return {
        r[0]
        for r in con.execute(
            f"DESCRIBE SELECT * FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchall()
    }


def expresion_columna(cols: set[str], nombre: str, fallback: str = "NULL") -> str:
    return f'"{nombre}"' if nombre in cols else fallback


def _texto_limpio_fact(cols: set[str], nombre: str, default: str) -> str:
    if nombre not in cols:
        return sql_literal(default)
    return (
        f"COALESCE(NULLIF(trim(CAST(\"{nombre}\" AS VARCHAR)), ''), "
        f"{sql_literal(default)})"
    )


def select_fuente(con, archivo: Path, prioridad: int, nombre_fuente: str) -> str:
    """Reduce cada fact a combinaciones de producto distintas antes del UNION.

    Las facts ya contienen textos homologados. Volver a ejecutar regex y CASE
    sobre millones de filas no cambia el resultado y era uno de los principales
    cuellos de botella de la creación de DimProducto.
    """
    cols = columnas(con, archivo)
    if "codigo_nissei" not in cols:
        raise RuntimeError(f"{archivo.name} no contiene codigo_nissei")
    codigo = "NULLIF(trim(CAST(\"codigo_nissei\" AS VARCHAR)), '')"
    proveedor = _texto_limpio_fact(cols, "proveedor", "SIN PROVEEDOR")
    rubro = _texto_limpio_fact(cols, "rubro", "SIN CLASIFICACIÓN")
    linea = _texto_limpio_fact(cols, "linea", "SIN CLASIFICACIÓN")
    sublinea = _texto_limpio_fact(cols, "sub_linea", "SIN CLASIFICACIÓN")
    marca = _texto_limpio_fact(cols, "marca", "SIN MARCA")
    modelo = expresion_columna(cols, "modelo", "NULL")
    descripcion = expresion_columna(cols, "descripcion", "NULL")
    ruta = sql_literal(archivo.as_posix())
    return f"""
    SELECT DISTINCT
        {codigo} AS codigo_nissei,
        {proveedor} AS proveedor,
        {rubro} AS rubro,
        {linea} AS linea,
        {sublinea} AS sub_linea,
        {marca} AS marca,
        upper(NULLIF(trim(CAST({modelo} AS VARCHAR)), '')) AS modelo,
        upper(NULLIF(trim(CAST({descripcion} AS VARCHAR)), '')) AS descripcion,
        {prioridad}::INTEGER AS prioridad_fuente,
        {sql_literal(nombre_fuente)} AS fuente_maestra
    FROM read_parquet({ruta})
    WHERE {codigo} IS NOT NULL
    """


def consulta(con) -> str:
    selects = []
    for nombre, prioridad, fuente in FUENTES:
        archivo = CAPA2_DIR / nombre
        if archivo.exists():
            selects.append(select_fuente(con, archivo, prioridad, fuente))
    if not selects:
        raise FileNotFoundError(
            "No existe ninguna fact modelo para construir DimProducto. "
            "Ejecuta primero las pipelines de Stock/Ventas/Ingresos."
        )
    union = "\nUNION ALL\n".join(selects)
    return f"""
    WITH candidatos AS (
        {union}
    ), puntuado_base AS (
        SELECT *,
            (CASE WHEN proveedor <> 'SIN PROVEEDOR' THEN 1 ELSE 0 END
             + CASE WHEN rubro <> 'SIN CLASIFICACIÓN' THEN 1 ELSE 0 END
             + CASE WHEN linea <> 'SIN CLASIFICACIÓN' THEN 1 ELSE 0 END
             + CASE WHEN sub_linea <> 'SIN CLASIFICACIÓN' THEN 1 ELSE 0 END
             + CASE WHEN marca <> 'SIN MARCA' THEN 1 ELSE 0 END
             + CASE WHEN modelo IS NOT NULL THEN 1 ELSE 0 END
             + CASE WHEN descripcion IS NOT NULL THEN 2 ELSE 0 END) AS completitud
        FROM candidatos
    ), puntuado AS (
        SELECT *,
            ROW_NUMBER() OVER (
                PARTITION BY codigo_nissei
                ORDER BY prioridad_fuente ASC, completitud DESC,
                         descripcion NULLS LAST, proveedor, rubro, linea, sub_linea
            ) AS rn
        FROM puntuado_base
    ), maestro AS (
        SELECT * EXCLUDE (rn, completitud)
        FROM puntuado
        WHERE rn = 1
    )
    SELECT
        {sql_producto_id('codigo_nissei')} AS producto_id,
        codigo_nissei,
        {sql_proveedor_id('proveedor')} AS proveedor_id,
        proveedor,
        {sql_clasificacion_id('rubro','linea','sub_linea')} AS clasificacion_producto_id,
        {sql_rubro_id('rubro')} AS rubro_id,
        {sql_rubro_codigo('rubro')} AS rubro_codigo,
        rubro,
        {sql_linea_id('rubro','linea')} AS linea_id,
        linea,
        {sql_sublinea_id('rubro','linea','sub_linea')} AS sub_linea_id,
        sub_linea,
        {sql_marca_id('marca')} AS marca_id,
        marca,
        modelo,
        descripcion,
        (rubro='SERVICIOS' OR codigo_nissei='ENVIO') AS es_servicio,
        fuente_maestra,
        (codigo_nissei IS NOT NULL AND descripcion IS NOT NULL) AS es_producto_valido
    FROM maestro
    ORDER BY codigo_nissei
    """



def verificar_dim_clasificacion() -> None:
    """Garantiza una fila por clasificación después de ampliar el catálogo."""
    if not DIM_CLASIFICACION.exists():
        raise FileNotFoundError(f"No existe {DIM_CLASIFICACION}")
    con = conectar()
    try:
        filas, distintas, nulos = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT clasificacion_producto_id), "
            f"COUNT(*) FILTER (WHERE clasificacion_producto_id IS NULL "
            f"OR rubro_id IS NULL OR linea_id IS NULL OR sub_linea_id IS NULL) "
            f"FROM read_parquet({sql_literal(DIM_CLASIFICACION.as_posix())})"
        ).fetchone()
        if not filas or filas != distintas or nulos:
            muestras = con.execute(
                f"SELECT clasificacion_producto_id, COUNT(*) AS filas, "
                f"string_agg(DISTINCT rubro || ' > ' || linea || ' > ' || sub_linea, ' || ') AS variantes "
                f"FROM read_parquet({sql_literal(DIM_CLASIFICACION.as_posix())}) "
                f"GROUP BY clasificacion_producto_id HAVING COUNT(*) > 1 "
                f"ORDER BY filas DESC LIMIT 10"
            ).fetchall()
            raise RuntimeError(
                "DimClasificacionProducto inválida después de ampliarla: "
                f"filas={filas}, distintas={distintas}, nulos={nulos}, "
                f"duplicados_muestra={muestras}"
            )
    finally:
        cerrar_duckdb_seguro(con)


def actualizar_dim_clasificacion() -> None:
    """Amplía el catálogo y consolida equivalencias en una sola fila por ID.

    Distintos textos pueden normalizarse a la misma clave semántica
    (acentos, signos, espacios o abreviaturas). El ID debe seguir siendo el
    mismo; por eso se conserva una única fila canónica, dando prioridad al
    catálogo estructurado y usando las facts solo para clasificaciones nuevas.
    """
    if not SALIDA.exists():
        raise FileNotFoundError(f"No existe {SALIDA}")
    con = conectar()
    DIM_CLASIFICACION_TEMP.unlink(missing_ok=True)
    try:
        productos = sql_literal(SALIDA.as_posix())
        if DIM_CLASIFICACION.exists():
            existente = sql_literal(DIM_CLASIFICACION.as_posix())
            base_sql = f"SELECT * FROM read_parquet({existente})"
        else:
            base_sql = """
            SELECT NULL::VARCHAR AS clasificacion_producto_id, NULL::VARCHAR AS rubro_id,
                   NULL::INTEGER AS rubro_codigo, NULL::VARCHAR AS rubro,
                   NULL::VARCHAR AS linea_id, NULL::VARCHAR AS linea,
                   NULL::VARCHAR AS sub_linea_id, NULL::VARCHAR AS sub_linea,
                   NULL::VARCHAR AS jerarquia_producto, NULL::VARCHAR AS rls_codigo_principal,
                   NULL::VARCHAR AS rls_codigos, NULL::INTEGER AS cantidad_codigos_rls,
                   NULL::VARCHAR AS estado_clasificacion, NULL::BOOLEAN AS es_vigente
            WHERE FALSE
            """
        consulta = f"""
        WITH existente AS (
            SELECT * FROM ({base_sql})
            WHERE clasificacion_producto_id IS NOT NULL
        ),
        reales AS (
            SELECT DISTINCT
                clasificacion_producto_id, rubro_id, rubro_codigo, rubro,
                linea_id, linea, sub_linea_id, sub_linea,
                rubro || ' > ' || linea || ' > ' || sub_linea AS jerarquia_producto,
                NULL::VARCHAR AS rls_codigo_principal,
                NULL::VARCHAR AS rls_codigos,
                0::INTEGER AS cantidad_codigos_rls,
                'ACTIVO' AS estado_clasificacion, TRUE AS es_vigente
            FROM read_parquet({productos})
            WHERE clasificacion_producto_id IS NOT NULL
        ),
        candidatos AS (
            SELECT e.*, 0::INTEGER AS prioridad_origen
            FROM existente e
            UNION ALL
            SELECT r.*, 1::INTEGER AS prioridad_origen
            FROM reales r
        ),
        puntuado_base AS (
            SELECT *,
                (CASE WHEN rubro <> 'SIN CLASIFICACIÓN' THEN 4 ELSE 0 END
                 + CASE WHEN linea <> 'SIN CLASIFICACIÓN' THEN 2 ELSE 0 END
                 + CASE WHEN sub_linea <> 'SIN CLASIFICACIÓN' THEN 1 ELSE 0 END
                 + CASE WHEN rubro_codigo IS NOT NULL THEN 1 ELSE 0 END) AS completitud
            FROM candidatos
        ),
        puntuado AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY clasificacion_producto_id
                    ORDER BY prioridad_origen ASC, completitud DESC,
                             cantidad_codigos_rls DESC, rubro_codigo NULLS LAST,
                             rubro, linea, sub_linea
                ) AS rn
            FROM puntuado_base
        )
        SELECT * EXCLUDE (prioridad_origen, completitud, rn)
        FROM puntuado
        WHERE rn = 1
        ORDER BY rubro_codigo NULLS LAST, rubro, linea, sub_linea
        """
        con.execute(
            f"COPY ({consulta}) TO {sql_literal(DIM_CLASIFICACION_TEMP.as_posix())} "
            "(FORMAT PARQUET, COMPRESSION SNAPPY)"
        )
        filas, distintas, nulos = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT clasificacion_producto_id), "
            f"COUNT(*) FILTER (WHERE clasificacion_producto_id IS NULL) "
            f"FROM read_parquet({sql_literal(DIM_CLASIFICACION_TEMP.as_posix())})"
        ).fetchone()
        if not filas or filas != distintas or nulos:
            raise RuntimeError(
                "No se pudo consolidar DimClasificacionProducto: "
                f"filas={filas}, distintas={distintas}, nulos={nulos}"
            )
    except Exception:
        DIM_CLASIFICACION_TEMP.unlink(missing_ok=True)
        raise
    finally:
        cerrar_duckdb_seguro(con)
    os.replace(DIM_CLASIFICACION_TEMP, DIM_CLASIFICACION)
    verificar_dim_clasificacion()

def crear() -> None:
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)
    con = conectar()
    TEMP.unlink(missing_ok=True)
    try:
        con.execute(
            f"COPY ({consulta(con)}) TO {sql_literal(TEMP.as_posix())} "
            "(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)"
        )
    except Exception:
        TEMP.unlink(missing_ok=True)
        raise
    finally:
        cerrar_duckdb_seguro(con)
    os.replace(TEMP, SALIDA)
    actualizar_dim_clasificacion()
    verificar()


def verificar() -> None:
    if not SALIDA.exists():
        raise FileNotFoundError(f"No existe {SALIDA}")
    con = conectar()
    try:
        filas, ids, codigos, nulos = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT producto_id), COUNT(DISTINCT codigo_nissei), "
            f"COUNT(*) FILTER (WHERE producto_id IS NULL OR codigo_nissei IS NULL) "
            f"FROM read_parquet({sql_literal(SALIDA.as_posix())})"
        ).fetchone()
        if not filas or filas != ids or filas != codigos or nulos:
            raise RuntimeError(
                f"DimProducto inválida: filas={filas}, ids={ids}, códigos={codigos}, nulos={nulos}"
            )
        print("\nDIM_PRODUCTO VERIFICADA")
        print(f"Productos : {filas:,}")
        print(f"Archivo   : {SALIDA}")
    finally:
        cerrar_duckdb_seguro(con)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verificar-capa2", action="store_true")
    args = parser.parse_args()
    try:
        if args.verificar_capa2:
            verificar()
        else:
            crear()
        return 0
    except Exception as exc:
        print("\nERROR EN DIM_PRODUCTO", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
