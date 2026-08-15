from __future__ import annotations

"""Genera scripts TMDL desde los Parquet finales de Capa 2.

Este módulo no limpia, homologa ni modifica datos. Solo inspecciona los
esquemas ya publicados, define las particiones de importación y crea los
vínculos del modelo semántico.
"""

import argparse
import re
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt"
    ) from exc

from project_paths import CAPA2_DIR, POWERBI_DIR, PROJECT_ROOT
from kpis_modelo import MEDIDAS, cantidad_medidas, validar_columnas_kpi
BASE_DIR = PROJECT_ROOT
SALIDA_DIR = CAPA2_DIR
TMDL_COMPLETO = CAPA2_DIR / "Modelo_Dashboard.tmdl"

ARCHIVOS_LEGACY_MODELO = (
    "Enlaces_Dashboard.tmdl",
    "Relaciones_Dashboard.tmdl",
    "modelo_manifest.json",
    "ABRIR_EN_POWER_BI.txt",
)

# Tablas físicas que deben existir en Capa 2.
TABLAS_FISICAS = {
    "DimFecha": "DimFecha.parquet",
    "DimFechaOrigenStock": "DimFechaOrigenStock.parquet",
    "DimTiendas": "DimTiendas.parquet",
    "DimClasificacionProducto": "DimClasificacionProducto.parquet",
    "DimProducto": "DimProducto.parquet",
    "FactVentas": "FactVentas.parquet",
    "FactIngresos": "FactIngresos.parquet",
    "FactTransferencias": "FactTransferencias.parquet",
    "FactGuiasTransito": "FactGuiasTransito.parquet",
    "FactStock": "FactStock.parquet",
    "FactMerma": "FactMerma.parquet",
    "FactMetasTienda": "FactMetasTienda.parquet",
    "FactPersonalTienda": "FactPersonalTienda.parquet",
    "FactTraficoClientes": "FactTraficoClientes.parquet",
}

TABLAS_OBLIGATORIAS = {
    "DimFecha",
    "DimTiendas",
    "DimClasificacionProducto",
    "DimProducto",
}

# Dimensiones de rol. Son tablas lógicas pequeñas que leen los mismos Parquet
# que sus dimensiones base y permiten mantener todos los vínculos activos.
TABLAS_ROL = {
    "DimTiendaOrigen": "DimTiendas",
    "DimTiendaDestino": "DimTiendas",
    "DimFechaTransferenciaGuia": "DimFecha",
}

CLAVES_DIMENSION = {
    "DimFecha": "fecha_id",
    "DimFechaOrigenStock": "fecha_id",
    "DimFechaTransferenciaGuia": "fecha_id",
    "DimTiendas": "tienda_id",
    "DimTiendaOrigen": "tienda_id",
    "DimTiendaDestino": "tienda_id",
    "DimProducto": "producto_id",
    "DimClasificacionProducto": "clasificacion_producto_id",
}

COLUMNAS_ADITIVAS = {
    "cantidad",
    "cantidad_recibida",
    "cantidad_pendiente",
    "cantidad_personas",
    "cantidad_personal",
    "meta_ventas",
    "total_venta",
    "total_ingreso",
    "total_transferencia",
    "total_merma",
    "valor_stock",
    "descuento_soles",
}

COLUMNAS_TECNICAS_OCULTAS = {
    "total_fuente",
    "diferencia_total",
    "fuente_maestra",
    "es_total_consistente",
    "es_precio_cero",
    "es_periodo_origen_valido",
    "es_fecha_corte_inferida",
    "es_clasificacion_catalogada",
    "es_producto_valido",
    "es_dato_valido",
    "es_meta_valida",
    "es_valorizada",
}

IDS_DE_FILA = {
    "venta_linea_id",
    "ingreso_linea_id",
    "transferencia_linea_id",
    "guia_transito_id",
    "stock_id",
    "merma_id",
    "meta_tienda_id",
    "personal_tienda_id",
    "trafico_id",
}


@dataclass(frozen=True)
class Columna:
    nombre: str
    tipo_duckdb: str


@dataclass(frozen=True)
class Vinculo:
    tabla_muchos: str
    columna_muchos: str
    tabla_uno: str
    columna_uno: str

    @property
    def identificador(self) -> str:
        clave = (
            f"{self.tabla_muchos}.{self.columna_muchos}->"
            f"{self.tabla_uno}.{self.columna_uno}"
        )
        return str(uuid.uuid5(uuid.NAMESPACE_URL, clave))


VINCULOS_DESEADOS = [
    # Fecha principal.
    Vinculo("FactVentas", "fecha_id", "DimFecha", "fecha_id"),
    Vinculo("FactIngresos", "fecha_id", "DimFecha", "fecha_id"),
    Vinculo("FactTransferencias", "fecha_id", "DimFecha", "fecha_id"),
    Vinculo("FactGuiasTransito", "fecha_corte_id", "DimFecha", "fecha_id"),
    Vinculo("FactStock", "fecha_corte_id", "DimFecha", "fecha_id"),
    Vinculo("FactMerma", "fecha_id", "DimFecha", "fecha_id"),
    Vinculo("FactMetasTienda", "fecha_id", "DimFecha", "fecha_id"),
    Vinculo("FactPersonalTienda", "fecha_id", "DimFecha", "fecha_id"),
    Vinculo("FactTraficoClientes", "fecha_id", "DimFecha", "fecha_id"),

    # Fechas con un rol diferente al principal.
    Vinculo(
        "FactStock",
        "fecha_origen_id",
        "DimFechaOrigenStock",
        "fecha_id",
    ),
    Vinculo(
        "FactGuiasTransito",
        "fecha_transferencia_id",
        "DimFechaTransferenciaGuia",
        "fecha_id",
    ),

    # Tienda principal.
    Vinculo("FactVentas", "tienda_id", "DimTiendas", "tienda_id"),
    Vinculo("FactIngresos", "tienda_id", "DimTiendas", "tienda_id"),
    Vinculo("FactStock", "tienda_id", "DimTiendas", "tienda_id"),
    Vinculo("FactMerma", "tienda_id", "DimTiendas", "tienda_id"),
    Vinculo("FactMetasTienda", "tienda_id", "DimTiendas", "tienda_id"),
    Vinculo("FactPersonalTienda", "tienda_id", "DimTiendas", "tienda_id"),
    Vinculo("FactTraficoClientes", "tienda_id", "DimTiendas", "tienda_id"),

    # Origen y destino.
    Vinculo(
        "FactTransferencias",
        "tienda_origen_id",
        "DimTiendaOrigen",
        "tienda_id",
    ),
    Vinculo(
        "FactTransferencias",
        "tienda_destino_id",
        "DimTiendaDestino",
        "tienda_id",
    ),
    Vinculo(
        "FactGuiasTransito",
        "tienda_origen_id",
        "DimTiendaOrigen",
        "tienda_id",
    ),
    Vinculo(
        "FactGuiasTransito",
        "tienda_destino_id",
        "DimTiendaDestino",
        "tienda_id",
    ),

    # Producto y clasificación.
    Vinculo("FactVentas", "producto_id", "DimProducto", "producto_id"),
    Vinculo("FactIngresos", "producto_id", "DimProducto", "producto_id"),
    Vinculo(
        "FactTransferencias",
        "producto_id",
        "DimProducto",
        "producto_id",
    ),
    Vinculo(
        "FactGuiasTransito",
        "producto_id",
        "DimProducto",
        "producto_id",
    ),
    Vinculo("FactStock", "producto_id", "DimProducto", "producto_id"),
    Vinculo("FactMerma", "producto_id", "DimProducto", "producto_id"),
    Vinculo(
        "DimProducto",
        "clasificacion_producto_id",
        "DimClasificacionProducto",
        "clasificacion_producto_id",
    ),
]

ORDEN_TABLAS = [
    "DimFecha",
    "DimFechaOrigenStock",
    "DimFechaTransferenciaGuia",
    "DimTiendas",
    "DimTiendaOrigen",
    "DimTiendaDestino",
    "DimClasificacionProducto",
    "DimProducto",
    "FactVentas",
    "FactIngresos",
    "FactTransferencias",
    "FactGuiasTransito",
    "FactStock",
    "FactMerma",
    "FactMetasTienda",
    "FactPersonalTienda",
    "FactTraficoClientes",
]


def literal_sql(valor: str | Path) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def nombre_tmdl(nombre: str) -> str:
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", nombre):
        return nombre
    return "'" + nombre.replace("'", "''") + "'"


def texto_tmdl(valor: str) -> str:
    return '"' + valor.replace('"', '""') + '"'


def texto_m(valor: str) -> str:
    return '"' + valor.replace('"', '""') + '"'


def tipo_tmdl(tipo_duckdb: str) -> str:
    tipo = tipo_duckdb.upper()
    enteros = (
        "TINYINT",
        "SMALLINT",
        "INTEGER",
        "BIGINT",
        "HUGEINT",
        "UTINYINT",
        "USMALLINT",
        "UINTEGER",
        "UBIGINT",
    )
    if tipo.startswith(enteros):
        return "int64"
    if tipo.startswith("DECIMAL"):
        return "decimal"
    if tipo.startswith(("DOUBLE", "FLOAT", "REAL")):
        return "double"
    if tipo.startswith(("DATE", "TIMESTAMP", "TIME")):
        return "dateTime"
    if tipo.startswith("BOOLEAN"):
        return "boolean"
    if tipo.startswith(("BLOB", "BYTEA")):
        return "binary"
    return "string"


def columnas_parquet(
    con: duckdb.DuckDBPyConnection,
    archivo: Path,
) -> list[Columna]:
    ruta = literal_sql(archivo.as_posix())
    filas = con.execute(
        f"DESCRIBE SELECT * FROM read_parquet({ruta})"
    ).fetchall()
    return [Columna(str(fila[0]), str(fila[1])) for fila in filas]


def validar_clave_dimension(
    con: duckdb.DuckDBPyConnection,
    tabla: str,
    archivo: Path,
    clave: str,
) -> None:
    ruta = literal_sql(archivo.as_posix())
    clave_sql = '"' + clave.replace('"', '""') + '"'
    filas, distintas, nulos = con.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT {clave_sql}), "
        f"COUNT(*) FILTER (WHERE {clave_sql} IS NULL) "
        f"FROM read_parquet({ruta})"
    ).fetchone()
    if not filas or filas != distintas or nulos:
        raise RuntimeError(
            f"{tabla}: {clave} no es única. "
            f"filas={filas}, distintas={distintas}, nulos={nulos}"
        )


def cargar_esquemas(
    omitir_faltantes: bool,
) -> tuple[dict[str, Path], dict[str, list[Columna]]]:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    archivos: dict[str, Path] = {}
    esquemas: dict[str, list[Columna]] = {}
    try:
        for tabla, nombre_archivo in TABLAS_FISICAS.items():
            archivo = CAPA2_DIR / nombre_archivo
            if not archivo.exists():
                if tabla in TABLAS_OBLIGATORIAS or not omitir_faltantes:
                    raise FileNotFoundError(
                        f"Falta {archivo}. Ejecuta las pipelines antes de crear el modelo."
                    )
                print(f"[OMITIDA] {tabla}: no existe {nombre_archivo}")
                continue

            columnas = columnas_parquet(con, archivo)
            if not columnas:
                raise RuntimeError(f"{archivo.name} no contiene columnas.")

            archivos[tabla] = archivo.resolve()
            esquemas[tabla] = columnas

        for tabla_rol, tabla_base in TABLAS_ROL.items():
            if tabla_base not in archivos:
                continue
            archivos[tabla_rol] = archivos[tabla_base]
            esquemas[tabla_rol] = esquemas[tabla_base]

        for tabla, clave in CLAVES_DIMENSION.items():
            if tabla not in esquemas:
                continue
            nombres = {columna.nombre for columna in esquemas[tabla]}
            if clave not in nombres:
                raise RuntimeError(f"{tabla} no contiene la clave {clave}")
            validar_clave_dimension(con, tabla, archivos[tabla], clave)

        return archivos, esquemas
    finally:
        cerrar_duckdb_seguro(con)


def es_columna_oculta(tabla: str, columna: str) -> bool:
    if columna in COLUMNAS_TECNICAS_OCULTAS:
        return True
    if columna.endswith("_id"):
        return True
    if columna in IDS_DE_FILA:
        return True
    return False


def resumen_columna(tabla: str, columna: Columna) -> str:
    if tabla.startswith("Fact") and columna.nombre in COLUMNAS_ADITIVAS:
        return "sum"
    return "none"


def formato_columna(columna: Columna) -> str | None:
    nombre = columna.nombre
    tipo = tipo_tmdl(columna.tipo_duckdb)
    if tipo == "dateTime":
        return "dd/MM/yyyy"
    if nombre.startswith(("precio_", "total_")):
        return "#,0.00"
    if nombre in {
        "meta_ventas",
        "valor_stock",
        "descuento_soles",
        "diferencia_total",
    }:
        return "#,0.00"
    return None


def bloque_tabla(
    tabla: str,
    archivo: Path,
    columnas: list[Columna],
    indentacion_raiz: str = "\t",
) -> str:
    i1 = indentacion_raiz
    i2 = i1 + "\t"
    i3 = i2 + "\t"
    i4 = i3 + "\t"
    i5 = i4 + "\t"

    lineas = [f"{i1}table {nombre_tmdl(tabla)}"]
    clave = CLAVES_DIMENSION.get(tabla)

    for columna in columnas:
        lineas.append("")
        lineas.append(f"{i2}column {nombre_tmdl(columna.nombre)}")
        lineas.append(f"{i3}dataType: {tipo_tmdl(columna.tipo_duckdb)}")
        if columna.nombre == clave:
            lineas.append(f"{i3}isKey")
        if es_columna_oculta(tabla, columna.nombre):
            lineas.append(f"{i3}isHidden")
        lineas.append(f"{i3}sourceColumn: {texto_tmdl(columna.nombre)}")
        lineas.append(f"{i3}summarizeBy: {resumen_columna(tabla, columna)}")
        formato = formato_columna(columna)
        if formato:
            lineas.append(f"{i3}formatString: {formato}")

    nombre_archivo = texto_m(archivo.name)
    lineas.extend(
        [
            "",
            f"{i2}partition {nombre_tmdl(tabla + '_Parquet')} = m",
            f"{i3}mode: import",
            f"{i3}source =",
            f"{i4}let",
            f"{i5}Source = Parquet.Document(File.Contents(RutaCapa2 & {nombre_archivo}))",
            f"{i4}in",
            f"{i5}Source",
        ]
    )
    return "\n".join(lineas)



def bloque_tabla_parametros_kpi(indentacion_raiz: str = "\t") -> str:
    i1 = indentacion_raiz
    i2 = i1 + "\t"
    i3 = i2 + "\t"
    i4 = i3 + "\t"
    i5 = i4 + "\t"
    columnas = [
        ("costo_ordenar", "double"),
        ("costo_mantener_unidad_anio", "double"),
        ("porcentaje_no_vendible", "double"),
        ("ict_promedio", "double"),
        ("lead_time_dias", "double"),
        ("unidades_por_m2_capacidad", "double"),
    ]
    lineas = [f"{i1}table ParametrosKPI"]
    for nombre, tipo in columnas:
        lineas.extend([
            "",
            f"{i2}column {nombre_tmdl(nombre)}",
            f"{i3}dataType: {tipo}",
            f"{i3}sourceColumn: {texto_tmdl(nombre)}",
            f"{i3}summarizeBy: none",
        ])
    lineas.extend([
        "",
        f"{i2}partition ParametrosKPI_Interna = m",
        f"{i3}mode: import",
        f"{i3}source =",
        f"{i4}let",
        f"{i5}Source = #table(",
        f"{i5}\ttype table [",
        f"{i5}\t\tcosto_ordenar = nullable number,",
        f"{i5}\t\tcosto_mantener_unidad_anio = nullable number,",
        f"{i5}\t\tporcentaje_no_vendible = nullable number,",
        f"{i5}\t\tict_promedio = nullable number,",
        f"{i5}\t\tlead_time_dias = nullable number,",
        f"{i5}\t\tunidades_por_m2_capacidad = nullable number",
        f"{i5}\t],",
        f"{i5}\t{{{{null, null, null, null, null, null}}}}",
        f"{i5})",
        f"{i4}in",
        f"{i5}Source",
    ])
    return "\n".join(lineas)


def bloque_tabla_medidas(indentacion_raiz: str = "\t") -> str:
    i1 = indentacion_raiz
    i2 = i1 + "\t"
    i3 = i2 + "\t"
    i4 = i3 + "\t"
    i5 = i4 + "\t"
    lineas = [f"{i1}table Medidas", "", f"{i2}column Control"]
    lineas.extend([
        f"{i3}dataType: int64",
        f"{i3}isHidden",
        f"{i3}sourceColumn: {texto_tmdl('Control')}",
        f"{i3}summarizeBy: none",
    ])
    for medida in MEDIDAS:
        lineas.append("")
        lineas.append(
            f"{i2}measure {nombre_tmdl(medida.nombre)} = {medida.expresion}"
        )
        lineas.append(f"{i3}formatString: {medida.formato}")
        lineas.append(f"{i3}displayFolder: {texto_tmdl(medida.carpeta)}")
        if medida.oculta:
            lineas.append(f"{i3}isHidden")
    lineas.extend([
        "",
        f"{i2}partition Medidas_Interna = m",
        f"{i3}mode: import",
        f"{i3}source =",
        f"{i4}let",
        f"{i5}Source = #table(type table [Control = Int64.Type], {{{{1}}}})",
        f"{i4}in",
        f"{i5}Source",
    ])
    return "\n".join(lineas)

def bloque_parametro_ruta_capa2(indentacion_raiz: str = "\t") -> str:
    ruta_local = CAPA2_DIR.resolve().as_posix().rstrip("/") + "/"
    ruta = texto_m(ruta_local)
    return (
        f"{indentacion_raiz}expression RutaCapa2 = {ruta} "
        "meta [IsParameterQuery=true, Type=\"Text\", "
        "IsParameterQueryRequired=true]"
    )


def vinculos_disponibles(
    esquemas: dict[str, list[Columna]],
) -> list[Vinculo]:
    disponibles: list[Vinculo] = []
    for vinculo in VINCULOS_DESEADOS:
        if (
            vinculo.tabla_muchos not in esquemas
            or vinculo.tabla_uno not in esquemas
        ):
            continue

        columnas_muchos = {
            columna.nombre for columna in esquemas[vinculo.tabla_muchos]
        }
        columnas_uno = {
            columna.nombre for columna in esquemas[vinculo.tabla_uno]
        }
        if vinculo.columna_muchos not in columnas_muchos:
            raise RuntimeError(
                f"Falta {vinculo.tabla_muchos}.{vinculo.columna_muchos}"
            )
        if vinculo.columna_uno not in columnas_uno:
            raise RuntimeError(
                f"Falta {vinculo.tabla_uno}.{vinculo.columna_uno}"
            )
        disponibles.append(vinculo)
    return disponibles


def bloque_vinculo(vinculo: Vinculo, indentacion_raiz: str = "\t") -> str:
    i1 = indentacion_raiz
    i2 = i1 + "\t"
    desde = (
        f"{nombre_tmdl(vinculo.tabla_muchos)}."
        f"{nombre_tmdl(vinculo.columna_muchos)}"
    )
    hacia = (
        f"{nombre_tmdl(vinculo.tabla_uno)}."
        f"{nombre_tmdl(vinculo.columna_uno)}"
    )
    return "\n".join(
        [
            f"{i1}relationship {vinculo.identificador}",
            f"{i2}fromColumn: {desde}",
            f"{i2}toColumn: {hacia}",
        ]
    )


def limpiar_tmdl(texto: str) -> str:
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.S)
    lineas = []
    for linea in texto.splitlines():
        limpia = linea.lstrip()
        if limpia.startswith(("//", "#", "--")):
            continue
        if re.match(r"description\s*:", limpia, flags=re.I):
            continue
        lineas.append(linea.rstrip())
    return "\n".join(lineas).strip() + "\n"


def escribir_tmdl_sin_comentarios(ruta: Path, lineas: list[str]) -> None:
    ruta.write_text(limpiar_tmdl("\n".join(lineas)), encoding="utf-8")


def limpiar_salidas_anteriores() -> None:
    SALIDA_DIR.mkdir(parents=True, exist_ok=True)
    for nombre in ARCHIVOS_LEGACY_MODELO:
        (CAPA2_DIR / nombre).unlink(missing_ok=True)
        (POWERBI_DIR / nombre).unlink(missing_ok=True)
    (POWERBI_DIR / TMDL_COMPLETO.name).unlink(missing_ok=True)
    if POWERBI_DIR.exists():
        try:
            POWERBI_DIR.rmdir()
        except OSError:
            pass


def generar_tmdl(
    archivos: dict[str, Path],
    esquemas: dict[str, list[Columna]],
    vinculos: list[Vinculo],
    incluir_kpis: bool = True,
) -> None:
    limpiar_salidas_anteriores()
    completo = ["createOrReplace", "", bloque_parametro_ruta_capa2()]
    for tabla in ORDEN_TABLAS:
        if tabla not in esquemas:
            continue
        completo.extend(
            ["", bloque_tabla(tabla, archivos[tabla], esquemas[tabla])]
        )
    if incluir_kpis:
        validar_columnas_kpi(esquemas)
        completo.extend(["", bloque_tabla_parametros_kpi()])
        completo.extend(["", bloque_tabla_medidas()])
    for vinculo in vinculos:
        completo.extend(["", bloque_vinculo(vinculo)])
    escribir_tmdl_sin_comentarios(TMDL_COMPLETO, completo)



def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Genera los scripts TMDL usando solamente los Parquet finales "
            "de Capa 2. No transforma datos."
        )
    )
    parser.add_argument(
        "--omitir-faltantes",
        action="store_true",
        help=(
            "Crea el modelo con las facts disponibles. "
            "Las cuatro dimensiones principales siguen siendo obligatorias."
        ),
    )
    parser.add_argument(
        "--sin-kpis",
        action="store_true",
        help="Genera solamente tablas y relaciones, sin la tabla Medidas.",
    )
    args = parser.parse_args()

    try:
        archivos, esquemas = cargar_esquemas(args.omitir_faltantes)
        vinculos = vinculos_disponibles(esquemas)
        generar_tmdl(archivos, esquemas, vinculos, incluir_kpis=not args.sin_kpis)

        print("\nMODELO TMDL ÚNICO GENERADO")
        tablas_generadas = len(esquemas) + (0 if args.sin_kpis else 2)
        print(f"Tablas   : {tablas_generadas:,}")
        print(f"Vínculos : {len(vinculos):,}")
        print(f"Medidas  : {0 if args.sin_kpis else cantidad_medidas():,}")
        print(f"Archivo  : {TMDL_COMPLETO}")
        print(f"Ruta M   : {CAPA2_DIR.resolve().as_posix()}/")
        return 0
    except Exception as exc:
        print("\nERROR AL GENERAR EL MODELO TMDL", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
