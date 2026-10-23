from __future__ import annotations

"""Valida la integridad referencial de Capa 2 con una lectura por archivo grande.

Modo normal:
- PK/FK obligatorias no nulas.
- Todas las relaciones sin claves huérfanas.
- Dimensiones con PK única.

Modo estricto (ocasional): agrega COUNT(DISTINCT) de las PK de todas las facts.
Activación: --estricto o ETL_VALIDACION_ESTRICTA=1.
"""

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt"
    ) from exc

from maestros import ANIO_INICIO_MODELO, FECHA_INICIO_MODELO, TIENDA_IDS, sql_literal
from project_paths import PROJECT_ROOT

BASE_DIR = PROJECT_ROOT
CAPA2_DIR = BASE_DIR / "capa2"

DIMENSIONES = {
    "tienda": (CAPA2_DIR / "DimTiendas.parquet", "tienda_id"),
    "fecha": (CAPA2_DIR / "DimFecha.parquet", "fecha_id"),
    "fecha_origen_stock": (CAPA2_DIR / "DimFechaOrigenStock.parquet", "fecha_id"),
    "producto": (CAPA2_DIR / "DimProducto.parquet", "producto_id"),
    "clasificacion": (
        CAPA2_DIR / "DimClasificacionProducto.parquet",
        "clasificacion_producto_id",
    ),
}

# archivo fact, FK, dimensión, permite NULL
VINCULOS = [
    ("FactVentas.parquet", "tienda_id", "tienda", False),
    ("FactVentas.parquet", "fecha_id", "fecha", False),
    ("FactVentas.parquet", "producto_id", "producto", False),
    ("FactIngresos.parquet", "tienda_id", "tienda", False),
    ("FactIngresos.parquet", "fecha_id", "fecha", False),
    ("FactIngresos.parquet", "producto_id", "producto", False),
    ("FactTransferencias.parquet", "tienda_origen_id", "tienda", False),
    ("FactTransferencias.parquet", "tienda_destino_id", "tienda", False),
    ("FactTransferencias.parquet", "fecha_id", "fecha", False),
    ("FactTransferencias.parquet", "producto_id", "producto", False),
    ("FactGuiasTransito.parquet", "tienda_origen_id", "tienda", False),
    ("FactGuiasTransito.parquet", "tienda_destino_id", "tienda", False),
    ("FactGuiasTransito.parquet", "fecha_corte_id", "fecha", False),
    ("FactGuiasTransito.parquet", "fecha_transferencia_id", "fecha", True),
    ("FactGuiasTransito.parquet", "producto_id", "producto", True),
    ("FactStock.parquet", "tienda_id", "tienda", False),
    ("FactStock.parquet", "fecha_corte_id", "fecha", False),
    ("FactStock.parquet", "fecha_origen_id", "fecha_origen_stock", True),
    ("FactStock.parquet", "producto_id", "producto", False),
    ("FactMerma.parquet", "tienda_id", "tienda", False),
    ("FactMerma.parquet", "fecha_id", "fecha", False),
    ("FactMerma.parquet", "producto_id", "producto", True),
    ("FactMetasTienda.parquet", "tienda_id", "tienda", False),
    ("FactMetasTienda.parquet", "fecha_id", "fecha", False),
    ("FactPersonalTienda.parquet", "tienda_id", "tienda", False),
    ("FactPersonalTienda.parquet", "fecha_id", "fecha", False),
    ("FactTraficoClientes.parquet", "tienda_id", "tienda", False),
    ("FactTraficoClientes.parquet", "fecha_id", "fecha", False),
    ("DimProducto.parquet", "clasificacion_producto_id", "clasificacion", False),
]

CLAVES_FACT = {
    "FactVentas.parquet": "venta_linea_id",
    "FactIngresos.parquet": "ingreso_linea_id",
    "FactTransferencias.parquet": "transferencia_linea_id",
    "FactGuiasTransito.parquet": "guia_transito_id",
    "FactStock.parquet": "stock_id",
    "FactMerma.parquet": "merma_id",
    "FactMetasTienda.parquet": "meta_tienda_id",
    "FactPersonalTienda.parquet": "personal_tienda_id",
    "FactTraficoClientes.parquet": "trafico_id",
}


def columnas(con: duckdb.DuckDBPyConnection, archivo: Path) -> set[str]:
    return {
        str(fila[0])
        for fila in con.execute(
            f"DESCRIBE SELECT * FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchall()
    }


def validar_dimension(
    con: duckdb.DuckDBPyConnection,
    nombre: str,
    archivo: Path,
    clave: str,
) -> dict[str, int]:
    if not archivo.exists():
        raise FileNotFoundError(f"Falta dimensión {nombre}: {archivo}")
    cols = columnas(con, archivo)
    if clave not in cols:
        raise RuntimeError(f"{archivo.name} no contiene {clave}")
    filas, distintas, nulos = con.execute(
        f'SELECT COUNT(*), COUNT(DISTINCT "{clave}"), '
        f'COUNT(*) FILTER (WHERE "{clave}" IS NULL) '
        f"FROM read_parquet({sql_literal(archivo.as_posix())})"
    ).fetchone()
    if not filas or filas != distintas or nulos:
        raise RuntimeError(
            f"{archivo.name}: clave {clave} inválida. "
            f"filas={filas}, distintas={distintas}, nulos={nulos}"
        )
    if nombre == "fecha":
        inicio, anteriores = con.execute(
            f"SELECT MIN(fecha), COUNT(*) FILTER "
            f"(WHERE fecha < DATE {sql_literal(FECHA_INICIO_MODELO)}) "
            f"FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchone()
        if anteriores or getattr(inicio, "year", None) != ANIO_INICIO_MODELO:
            raise RuntimeError(
                f"DimFecha debe iniciar en {FECHA_INICIO_MODELO}; "
                f"inicio={inicio}, anteriores={anteriores}."
            )
    return {"filas": int(filas), "columnas": len(cols)}


def validar_universo_tiendas(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    archivo, _ = DIMENSIONES["tienda"]
    obtenidas = {
        str(nombre): str(tienda_id)
        for tienda_id, nombre in con.execute(
            f"SELECT tienda_id, tienda FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchall()
    }
    historicas = dict(TIENDA_IDS)
    faltantes = sorted(set(historicas) - set(obtenidas))
    ids_distintos = sorted(
        nombre
        for nombre in set(historicas) & set(obtenidas)
        if historicas[nombre] != obtenidas[nombre]
    )
    if faltantes or ids_distintos:
        raise RuntimeError(
            "DimTiendas perdió compatibilidad histórica. "
            f"Faltantes={faltantes}; IDs distintos={ids_distintos}"
        )
    return {"total": len(obtenidas), "nuevas": len(set(obtenidas) - set(historicas))}


def vinculos_por_archivo() -> dict[str, list[tuple[str, str, bool]]]:
    resultado: dict[str, list[tuple[str, str, bool]]] = defaultdict(list)
    for archivo, fk, dimension, permite_nulo in VINCULOS:
        resultado[archivo].append((fk, dimension, permite_nulo))
    return dict(resultado)


def validar_archivo_relacional(
    con: duckdb.DuckDBPyConnection,
    archivo: Path,
    clave_fila: str | None,
    vinculos: list[tuple[str, str, bool]],
    estricto: bool,
) -> dict[str, int]:
    cols = columnas(con, archivo)
    requeridas = ([clave_fila] if clave_fila else []) + [v[0] for v in vinculos]
    faltan = [c for c in requeridas if c and c not in cols]
    if faltan:
        raise RuntimeError(f"{archivo.name} no contiene columnas requeridas: {faltan}")

    selectores = ["COUNT(*) AS filas"]
    if clave_fila:
        selectores.append(
            f'COUNT(*) FILTER (WHERE f."{clave_fila}" IS NULL) AS pk_nulos'
        )
        if estricto:
            selectores.append(f'COUNT(DISTINCT f."{clave_fila}") AS pk_distintas')

    joins: list[str] = []
    metadatos: list[tuple[str, bool, str]] = []
    for indice, (fk, dim_nombre, permite_nulo) in enumerate(vinculos):
        dimension, pk = DIMENSIONES[dim_nombre]
        alias = f"d{indice}"
        joins.append(
            f"LEFT JOIN read_parquet({sql_literal(dimension.as_posix())}) {alias} "
            f'ON f."{fk}" = {alias}."{pk}"'
        )
        selectores.append(
            f'COUNT(*) FILTER (WHERE f."{fk}" IS NULL) AS fk_nulos_{indice}'
        )
        selectores.append(
            f'COUNT(*) FILTER (WHERE f."{fk}" IS NOT NULL '
            f'AND {alias}."{pk}" IS NULL) AS fk_huerfanas_{indice}'
        )
        if dim_nombre == "fecha":
            selectores.append(
                f'COUNT(*) FILTER (WHERE f."{fk}" IS NOT NULL AND '
                f'CAST(f."{fk}" AS BIGINT) < {ANIO_INICIO_MODELO}0101) '
                f'AS fecha_anterior_{indice}'
            )
        metadatos.append((fk, permite_nulo, dim_nombre))

    consulta = (
        "SELECT\n  "
        + ",\n  ".join(selectores)
        + f"\nFROM read_parquet({sql_literal(archivo.as_posix())}) f\n"
        + "\n".join(joins)
    )
    valores = list(con.execute(consulta).fetchone())
    pos = 0
    filas = int(valores[pos] or 0)
    pos += 1
    if filas <= 0:
        raise RuntimeError(f"{archivo.name} está vacío")

    if clave_fila:
        pk_nulos = int(valores[pos] or 0)
        pos += 1
        if pk_nulos:
            raise RuntimeError(f"{archivo.name}.{clave_fila} tiene {pk_nulos:,} NULL")
        if estricto:
            distintas = int(valores[pos] or 0)
            pos += 1
            if distintas != filas:
                raise RuntimeError(
                    f"{archivo.name}.{clave_fila} no es única: "
                    f"filas={filas:,}, distintas={distintas:,}"
                )

    for fk, permite_nulo, dim_nombre in metadatos:
        nulos = int(valores[pos] or 0)
        huerfanas = int(valores[pos + 1] or 0)
        pos += 2
        anteriores = 0
        if dim_nombre == "fecha":
            anteriores = int(valores[pos] or 0)
            pos += 1
        if nulos and not permite_nulo:
            raise RuntimeError(f"{archivo.name}.{fk} tiene {nulos:,} NULL")
        if anteriores:
            raise RuntimeError(
                f"{archivo.name}.{fk} tiene {anteriores:,} fechas anteriores "
                f"a {FECHA_INICIO_MODELO}."
            )
        if huerfanas:
            dimension, pk = DIMENSIONES[dim_nombre]
            raise RuntimeError(
                f"{archivo.name}.{fk} tiene {huerfanas:,} filas sin coincidencia "
                f"en {dimension.name}.{pk}"
            )

    return {"filas": filas, "relaciones": len(vinculos)}


def validar_modelo(omitir_faltantes: bool = False, estricto: bool = False) -> None:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    try:
        print("=" * 78)
        print("VALIDACIÓN DEL MODELO RELACIONAL")
        print("Modo:", "ESTRICTO" if estricto else "RÁPIDO (una lectura por fact)")
        print("=" * 78)

        for nombre, (archivo, clave) in DIMENSIONES.items():
            if not archivo.exists() and omitir_faltantes:
                print(f"[OMITIDA] {archivo.name}")
                continue
            resultado = validar_dimension(con, nombre, archivo, clave)
            print(f"[OK] {archivo.name}: {resultado['filas']:,} filas | PK {clave}")

        if DIMENSIONES["tienda"][0].exists():
            resumen = validar_universo_tiendas(con)
            print(
                f"[OK] DimTiendas: {resumen['total']:,} tiendas/canales | "
                f"nuevas={resumen['nuevas']:,}"
            )

        agrupados = vinculos_por_archivo()
        nombres_archivos = list(dict.fromkeys([*CLAVES_FACT, *agrupados]))
        for nombre in nombres_archivos:
            archivo = CAPA2_DIR / nombre
            if not archivo.exists():
                if omitir_faltantes:
                    print(f"[OMITIDA] {nombre}")
                    continue
                raise FileNotFoundError(f"Falta {archivo}")
            # Las dimensiones destino deben existir antes de armar los joins.
            faltan_dims = [
                DIMENSIONES[d][0]
                for _, d, _ in agrupados.get(nombre, [])
                if not DIMENSIONES[d][0].exists()
            ]
            if faltan_dims:
                if omitir_faltantes:
                    print(f"[OMITIDA] relaciones de {nombre}")
                    continue
                raise FileNotFoundError(f"Falta {faltan_dims[0]}")
            resultado = validar_archivo_relacional(
                con,
                archivo,
                CLAVES_FACT.get(nombre),
                agrupados.get(nombre, []),
                estricto,
            )
            print(
                f"[OK] {nombre}: {resultado['filas']:,} filas | "
                f"relaciones={resultado['relaciones']}"
            )

        print("=" * 78)
        print("MODELO LISTO PARA POWER BI")
        print("=" * 78)
    finally:
        cerrar_duckdb_seguro(con)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Valida dimensiones, facts y relaciones de Capa 2."
    )
    parser.add_argument("--omitir-faltantes", action="store_true")
    parser.add_argument(
        "--estricto",
        action="store_true",
        help="Agrega validación de unicidad completa sobre las facts.",
    )
    args = parser.parse_args()
    estricto = args.estricto or os.getenv("ETL_VALIDACION_ESTRICTA", "0") == "1"
    try:
        validar_modelo(args.omitir_faltantes, estricto)
        return 0
    except Exception as exc:
        print("\nERROR DE INTEGRIDAD DEL MODELO", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
