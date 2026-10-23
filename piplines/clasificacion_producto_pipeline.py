from __future__ import annotations

import argparse
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from xlsx_staging import origen_xlsx_csv

try:
    import duckdb
except ImportError as exc:
    raise SystemExit("Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt") from exc

from maestros import (
    DEPARTAMENTO_RUBRO,
    sql_clasificacion_id,
    sql_codigo,
    sql_linea,
    sql_linea_id,
    sql_literal,
    sql_rubro,
    sql_rubro_codigo,
    sql_rubro_id,
    sql_sublinea,
    sql_sublinea_id,
)

from project_paths import PROJECT_ROOT, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"
ENTRADA_PREFERIDA = CAPA1_DIR / "CATALOGO_TIENDAS.xlsx"
SALIDA = CAPA2_DIR / "DimClasificacionProducto.parquet"
TEMP = WORK_TEMP_DIR / "DimClasificacionProducto_temporal.parquet"
HOJAS = ("CATALOGO", "CATALOGO_RLS_C1", "CATALOGO_RLS")
REQUERIDAS = ["rls_codigo", "rubro_codigo", "rubro", "linea", "sub_linea", "jerarquia_original"]
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def preparar() -> None:
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def conectar(excel: bool = True):
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def buscar_archivo() -> Path:
    preparar()
    if ENTRADA_PREFERIDA.exists():
        return ENTRADA_PREFERIDA
    candidatos = sorted(
        p for p in CAPA1_DIR.glob("*.xlsx")
        if not p.name.startswith("~$") and "CATALOGO" in p.stem.upper() and "TIENDA" in p.stem.upper()
    )
    if len(candidatos) == 1:
        return candidatos[0]
    if not candidatos:
        raise FileNotFoundError(f"No se encontró {ENTRADA_PREFERIDA}")
    raise RuntimeError("Hay varios Excel de catálogo. Deja solamente el vigente.")


def hojas(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        nodo = wb.find(f"{{{NS}}}sheets")
        return [] if nodo is None else [x.attrib["name"] for x in nodo]


def buscar_hoja(archivo: Path) -> str:
    disponibles = hojas(archivo)
    for nombre in HOJAS:
        if nombre in disponibles:
            return nombre
    candidatas = [x for x in disponibles if "CATALOGO" in x.upper()]
    if len(candidatas) == 1:
        return candidatas[0]
    raise RuntimeError(f"No se encontró la hoja catálogo. Hojas: {disponibles}")


def origen(archivo: Path, hoja: str) -> str:
    return origen_xlsx_csv(archivo, hoja)


def sql_rubro_por_codigo(codigo_expr: str, fallback_expr: str) -> str:
    casos = "\n".join(
        f"WHEN {codigo} THEN {sql_literal(rubro)}"
        for codigo, rubro in sorted(DEPARTAMENTO_RUBRO.items())
    )
    return f"CASE TRY_CAST({codigo_expr} AS INTEGER)\n{casos}\nELSE {fallback_expr}\nEND"


def consulta(archivo: Path, hoja: str, tiene_estado: bool = False) -> str:
    src = origen(archivo, hoja)
    rubro_fallback = sql_rubro('"rubro"')
    rubro = sql_rubro_por_codigo('"rubro_codigo"', rubro_fallback)
    linea = sql_linea('"linea"')
    sublinea = sql_sublinea('"sub_linea"')
    rls = sql_codigo('"rls_codigo"')
    estado_expr = (
        "CASE WHEN upper(trim(COALESCE(CAST(\"estado_catalogo\" AS VARCHAR), 'ACTIVO'))) "
        "IN ('INACTIVO','INACTIVA','NO VIGENTE') THEN 'INACTIVO' ELSE 'ACTIVO' END"
        if tiene_estado else "'ACTIVO'"
    )
    return f"""
    WITH raw AS (
        SELECT
            {rls} AS rls_codigo,
            TRY_CAST("rubro_codigo" AS INTEGER) AS rubro_codigo_fuente,
            {rubro} AS rubro,
            {linea} AS linea,
            {sublinea} AS sub_linea,
            upper(NULLIF(trim(CAST("jerarquia_original" AS VARCHAR)), '')) AS jerarquia_original,
            {estado_expr} AS estado_catalogo
        FROM {src}
        WHERE COALESCE(CAST("rls_codigo" AS VARCHAR), CAST("rubro" AS VARCHAR), CAST("linea" AS VARCHAR), CAST("sub_linea" AS VARCHAR)) IS NOT NULL
    ), agrupado AS (
        SELECT
            rubro, linea, sub_linea,
            {sql_rubro_codigo('rubro')} AS rubro_codigo,
            MIN(rls_codigo) AS rls_codigo_principal,
            string_agg(DISTINCT rls_codigo, ' | ' ORDER BY rls_codigo) AS rls_codigos,
            COUNT(DISTINCT rls_codigo)::INTEGER AS cantidad_codigos_rls,
            CASE WHEN BOOL_OR(estado_catalogo='ACTIVO') THEN 'ACTIVO' ELSE 'INACTIVO' END AS estado_clasificacion
        FROM raw
        GROUP BY rubro, linea, sub_linea
    )
    SELECT
        {sql_clasificacion_id('rubro','linea','sub_linea')} AS clasificacion_producto_id,
        {sql_rubro_id('rubro')} AS rubro_id,
        rubro_codigo,
        rubro,
        {sql_linea_id('rubro','linea')} AS linea_id,
        linea,
        {sql_sublinea_id('rubro','linea','sub_linea')} AS sub_linea_id,
        sub_linea,
        rubro || ' > ' || linea || ' > ' || sub_linea AS jerarquia_producto,
        rls_codigo_principal,
        rls_codigos,
        cantidad_codigos_rls,
        estado_clasificacion,
        estado_clasificacion='ACTIVO' AS es_vigente
    FROM agrupado
    ORDER BY rubro_codigo, linea, sub_linea
    """


def verificar_capa1() -> None:
    archivo = buscar_archivo()
    hoja = buscar_hoja(archivo)
    con = conectar(True)
    try:
        cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {origen(archivo, hoja)}").fetchall()]
        faltan = [c for c in REQUERIDAS if c not in cols]
        if faltan:
            raise RuntimeError(f"Faltan columnas: {faltan}. Encontradas: {cols}")
        filas, rls, clases = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT rls_codigo_principal), COUNT(*) FROM ({consulta(archivo, hoja, 'estado_catalogo' in cols)})"
        ).fetchone()
        if not filas:
            raise RuntimeError("La hoja catálogo no contiene registros.")
        print("\nCAPA 1 DE CLASIFICACIÓN VERIFICADA")
        print(f"Archivo         : {archivo}")
        print(f"Hoja            : {hoja}")
        print(f"Clasificaciones : {filas:,}")
    finally:
        cerrar_duckdb_seguro(con)


def crear_capa2() -> None:
    archivo = buscar_archivo()
    hoja = buscar_hoja(archivo)
    verificar_capa1()
    con = conectar(True)
    TEMP.unlink(missing_ok=True)
    try:
        cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {origen(archivo, hoja)}").fetchall()]
        con.execute(
            f"COPY ({consulta(archivo, hoja, 'estado_catalogo' in cols)}) TO {sql_literal(TEMP.as_posix())} "
            "(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)"
        )
    except Exception:
        TEMP.unlink(missing_ok=True)
        raise
    finally:
        cerrar_duckdb_seguro(con)
    os.replace(TEMP, SALIDA)
    verificar_capa2()


def verificar_capa2() -> None:
    if not SALIDA.exists():
        raise FileNotFoundError(f"No existe {SALIDA}")
    con = conectar(False)
    try:
        filas, ids, nulos = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT clasificacion_producto_id), "
            f"COUNT(*) FILTER (WHERE clasificacion_producto_id IS NULL OR rubro_id IS NULL OR linea_id IS NULL OR sub_linea_id IS NULL) "
            f"FROM read_parquet({sql_literal(SALIDA.as_posix())})"
        ).fetchone()
        if not filas or filas != ids or nulos:
            raise RuntimeError(f"Dimensión inválida: filas={filas}, ids={ids}, nulos={nulos}")
        print("\nDIM_CLASIFICACION_PRODUCTO VERIFICADA")
        print(f"Filas   : {filas:,}")
        print(f"Archivo : {SALIDA}")
    finally:
        cerrar_duckdb_seguro(con)


def main() -> int:
    parser = argparse.ArgumentParser()
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    grupo.add_argument("--solo-capa2", action="store_true")
    args = parser.parse_args()
    try:
        if args.verificar_capa1:
            verificar_capa1()
        elif args.verificar_capa2:
            verificar_capa2()
        else:
            crear_capa2()
        return 0
    except Exception as exc:
        print("\nERROR EN CLASIFICACIÓN DE PRODUCTO", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
