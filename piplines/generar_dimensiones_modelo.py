from __future__ import annotations

"""Genera y valida las dimensiones que no provienen de un único reporte.

Orden:
1. DimFecha: calendario completo del modelo.
2. Validación de DimTiendas y DimClasificacionProducto ya generadas.
3. DimProducto: unión maestra de los productos presentes en todas las facts.
"""

import argparse
import subprocess
import sys
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt"
    ) from exc

from maestros import (
    ANIO_FIN_MODELO,
    ANIO_INICIO_MODELO,
    FECHA_INICIO_MODELO,
    TIENDA_IDS,
    sql_literal,
)

from project_paths import PROJECT_ROOT, SCRIPT_DIR
BASE_DIR = PROJECT_ROOT
SCRIPT_BASE = SCRIPT_DIR
CAPA2_DIR = BASE_DIR / "capa2"


COLUMNAS_FECHA_FACT = {
    "FactVentas.parquet": ("fecha_id",),
    "FactIngresos.parquet": ("fecha_id",),
    "FactTransferencias.parquet": ("fecha_id",),
    "FactGuiasTransito.parquet": ("fecha_corte_id", "fecha_transferencia_id"),
    "FactStock.parquet": ("fecha_corte_id",),
    "FactMerma.parquet": ("fecha_id",),
    "FactMetasTienda.parquet": ("fecha_id",),
    "FactPersonalTienda.parquet": ("fecha_id",),
    "FactTraficoClientes.parquet": ("fecha_id",),
}

# fecha_origen_id es una fecha de rol histórica: puede ser anterior al inicio
# comercial del modelo (2024) y por eso usa una dimensión propia.
COLUMNA_FECHA_ORIGEN_STOCK = ("FactStock.parquet", "fecha_origen_id")


def detectar_rango_real_fechas() -> tuple[int | None, int | None]:
    """Obtiene el mínimo y máximo año realmente usado por todas las facts."""
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    minimos: list[int] = []
    maximos: list[int] = []
    try:
        for nombre, candidatas in COLUMNAS_FECHA_FACT.items():
            archivo = CAPA2_DIR / nombre
            if not archivo.exists():
                continue
            ruta = sql_literal(archivo.as_posix())
            disponibles = {
                str(f[0])
                for f in con.execute(
                    f"DESCRIBE SELECT * FROM read_parquet({ruta})"
                ).fetchall()
            }
            for columna in candidatas:
                if columna not in disponibles:
                    continue
                columna_sql = '"' + columna.replace('"', '""') + '"'
                minimo, maximo = con.execute(
                    f"SELECT MIN(CAST({columna_sql} AS BIGINT)), "
                    f"MAX(CAST({columna_sql} AS BIGINT)) "
                    f"FROM read_parquet({ruta}) WHERE {columna_sql} IS NOT NULL"
                ).fetchone()
                if minimo is not None:
                    minimos.append(int(minimo) // 10000)
                if maximo is not None:
                    maximos.append(int(maximo) // 10000)
        return (
            min(minimos) if minimos else None,
            max(maximos) if maximos else None,
        )
    finally:
        cerrar_duckdb_seguro(con)


def detectar_rango_columna(nombre_archivo: str, columna: str) -> tuple[int | None, int | None]:
    archivo = CAPA2_DIR / nombre_archivo
    if not archivo.exists():
        return None, None
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    try:
        disponibles = {
            str(f[0])
            for f in con.execute(
                f"DESCRIBE SELECT * FROM read_parquet({sql_literal(archivo.as_posix())})"
            ).fetchall()
        }
        if columna not in disponibles:
            return None, None
        columna_sql = '"' + columna.replace('"', '""') + '"'
        minimo, maximo = con.execute(
            f"SELECT MIN(CAST({columna_sql} AS BIGINT)), "
            f"MAX(CAST({columna_sql} AS BIGINT)) "
            f"FROM read_parquet({sql_literal(archivo.as_posix())}) "
            f"WHERE {columna_sql} IS NOT NULL"
        ).fetchone()
        return (
            int(minimo) // 10000 if minimo is not None else None,
            int(maximo) // 10000 if maximo is not None else None,
        )
    finally:
        cerrar_duckdb_seguro(con)

DIMENSIONES_EXISTENTES = {
    "DimTiendas.parquet": "tienda_id",
    "DimClasificacionProducto.parquet": "clasificacion_producto_id",
    "DimFechaOrigenStock.parquet": "fecha_id",
}


def ejecutar(script: str, argumentos: list[str] | None = None) -> None:
    comando = [sys.executable, str(SCRIPT_BASE / script), *(argumentos or [])]
    print("\nEJECUTANDO:", " ".join(comando))
    resultado = subprocess.run(comando, cwd=SCRIPT_BASE)
    if resultado.returncode != 0:
        raise RuntimeError(f"{script} terminó con código {resultado.returncode}")


def validar_dimension(archivo: Path, clave: str) -> None:
    if not archivo.exists():
        raise FileNotFoundError(
            f"Falta {archivo.name}. Ejecuta primero su pipeline de origen."
        )
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    try:
        columnas = {
            fila[0]
            for fila in con.execute(
                f"DESCRIBE SELECT * FROM read_parquet({sql_literal(archivo.as_posix())})"
            ).fetchall()
        }
        if clave not in columnas:
            raise RuntimeError(f"{archivo.name} no contiene {clave}")
        filas, distintas, nulos = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT \"{clave}\"), "
            f"COUNT(*) FILTER (WHERE \"{clave}\" IS NULL) "
            f"FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchone()
        if not filas or filas != distintas or nulos:
            raise RuntimeError(
                f"{archivo.name} no tiene clave única {clave}: "
                f"filas={filas}, distintas={distintas}, nulos={nulos}"
            )
        if archivo.name == "DimTiendas.parquet":
            datos = {
                str(nombre): str(tienda_id)
                for tienda_id, nombre in con.execute(
                    f"SELECT tienda_id, tienda FROM read_parquet({sql_literal(archivo.as_posix())})"
                ).fetchall()
            }
            historicas = dict(TIENDA_IDS)
            faltantes = sorted(set(historicas) - set(datos))
            ids_distintos = sorted(
                nombre for nombre in set(historicas) & set(datos)
                if historicas[nombre] != datos[nombre]
            )
            if faltantes or ids_distintos:
                raise RuntimeError(
                    "DimTiendas perdió tiendas o IDs históricos. "
                    f"Faltantes={faltantes}; IDs distintos={ids_distintos}"
                )
        print(f"[OK] {archivo.name}: {filas:,} filas")
    finally:
        cerrar_duckdb_seguro(con)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Genera DimFecha y DimProducto y valida las dimensiones maestras."
    )
    parser.add_argument("--anio-inicio", type=int, default=ANIO_INICIO_MODELO)
    parser.add_argument("--anio-fin", type=int, default=ANIO_FIN_MODELO)
    args = parser.parse_args()

    try:
        if args.anio_inicio < ANIO_INICIO_MODELO:
            raise ValueError(
                f"El modelo no admite fechas anteriores a {FECHA_INICIO_MODELO}. "
                f"anio_inicio recibido={args.anio_inicio}."
            )
        anio_minimo_datos, anio_maximo_datos = detectar_rango_real_fechas()
        if anio_minimo_datos is not None and anio_minimo_datos < args.anio_inicio:
            raise RuntimeError(
                "Capa 2 contiene fechas comerciales anteriores al inicio del modelo: "
                f"mínimo detectado={anio_minimo_datos}, permitido desde={args.anio_inicio}."
            )
        anio_inicio_efectivo = args.anio_inicio
        anio_fin_efectivo = max(
            args.anio_fin,
            anio_maximo_datos if anio_maximo_datos is not None else args.anio_fin,
        )
        print(
            f"Rango de DimFecha: {anio_inicio_efectivo}-{anio_fin_efectivo} "
            f"(mínimo fijo del modelo; datos detectados: "
            f"{anio_minimo_datos}-{anio_maximo_datos})"
        )
        ejecutar(
            "dim_fecha_pipeline.py",
            [
                "--anio-inicio", str(anio_inicio_efectivo),
                "--anio-fin", str(anio_fin_efectivo),
            ],
        )

        archivo_stock, columna_stock = COLUMNA_FECHA_ORIGEN_STOCK
        anio_min_stock, anio_max_stock = detectar_rango_columna(
            archivo_stock, columna_stock
        )
        if anio_min_stock is not None:
            anio_fin_stock = max(
                anio_fin_efectivo,
                anio_max_stock if anio_max_stock is not None else anio_fin_efectivo,
            )
            print(
                f"Rango de DimFechaOrigenStock: {anio_min_stock}-{anio_fin_stock} "
                f"(histórico real del stock)"
            )
            ejecutar(
                "dim_fecha_pipeline.py",
                [
                    "--anio-inicio", str(anio_min_stock),
                    "--anio-fin", str(anio_fin_stock),
                    "--salida", "DimFechaOrigenStock.parquet",
                    "--permitir-anterior-modelo",
                ],
            )
        else:
            (CAPA2_DIR / "DimFechaOrigenStock.parquet").unlink(missing_ok=True)

        for nombre, clave in DIMENSIONES_EXISTENTES.items():
            validar_dimension(CAPA2_DIR / nombre, clave)

        ejecutar("dim_producto_pipeline.py")
        # DimProducto puede ampliar DimClasificacionProducto con valores reales
        # encontrados en las facts. Se vuelven a validar ambas dimensiones para
        # impedir que una ampliación introduzca claves duplicadas u huérfanas.
        validar_dimension(
            CAPA2_DIR / "DimClasificacionProducto.parquet",
            "clasificacion_producto_id",
        )
        validar_dimension(CAPA2_DIR / "DimProducto.parquet", "producto_id")
        print("\nDIMENSIONES DEL MODELO GENERADAS Y VALIDADAS.")
        return 0
    except Exception as exc:
        print("\nERROR AL GENERAR DIMENSIONES", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
