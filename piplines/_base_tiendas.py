from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from xlsx_staging import origen_xlsx_csv
from maestros import (
    TIENDAS_EQUIVALENCIAS as TIENDAS_EQUIVALENCIAS_MAESTRAS,
    TIENDA_IDS as TIENDA_IDS_MAESTRAS,
    sql_tienda_id as sql_tienda_id_maestro,
)
from typing import Any

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta instalar DuckDB. Activa el entorno virtual y ejecuta: "
        "python -m pip install -r requirements.txt"
    ) from exc


from project_paths import PROJECT_ROOT, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"
CAPA2_FINAL = CAPA2_DIR / "DimTiendas.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "DimTiendas_temporal.parquet"
HOJA_CAPA1 = "TIENDAS"

COLUMNAS_REQUERIDAS = [
    "tienda",
    "Alias",
    "tipo_ubicacion",
    "formato_tienda",
    "cluster",
    "metraje_m2",
    "departamento",
    "provincia",
    "distrito",
    "direccion",
    "fecha_apertura",
    "estado_operativo",
    "fecha_cierre",
]

COLUMNAS_CAPA2 = [
    "tienda_id",
    "tienda",
    "alias",
    "tipo_ubicacion",
    "formato_tienda",
    "cluster",
    "es_tienda",
    "metraje_m2",
    "capacidad_stock_unidades",
    "departamento",
    "provincia",
    "distrito",
    "direccion",
    "fecha_apertura",
    "fecha_cierre",
    "estado_operativo",
    "es_vigente",
]

TIENDAS_EQUIVALENCIAS = {
    "AGUAS VERDES": "TUMBES",
    "TUMBES": "TUMBES",
    "ALFONSO UGARTE": "ALFONSO UGARTE",
    "ALIPIO": "ALIPIO",
    "ANGAMOS": "ANGAMOS",
    "ARAMBURU": "ARAMBURU",
    "ARGENTINA": "ARGENTINA",
    "AYA": "AYACUCHO",
    "AYACUCHO": "AYACUCHO",
    "CALLAO": "CALLAO",
    "CD": "CD",
    "CHORRILLOS": "CHORRILLOS",
    "EMANCIPACION": "EMANCIPACIÓN",
    "EMANCIPACIÓN": "EMANCIPACIÓN",
    "INDEPENDENCIA": "INDEPENDENCIA",
    "LA MARINA": "MARINA",
    "MARINA": "MARINA",
    "ONLINE": "ONLINE",
    "ALMACEN VIRTUAL": "ONLINE",
    "ALMACÉN VIRTUAL": "ONLINE",
    "ALMACEN VIRUTAL": "ONLINE",
    "ALMACÉN VIRUTAL": "ONLINE",
    "PERSHING": "PERSHING",
    "PP": "PUENTE PIEDRA",
    "PTE PIEDRA": "PUENTE PIEDRA",
    "PUENTE PIEDRA": "PUENTE PIEDRA",
    "PU": "PZA UNIÓN",
    "PZA UNION": "PZA UNIÓN",
    "PZA UNIÓN": "PZA UNIÓN",
    "PLAZA UNION": "PZA UNIÓN",
    "PLAZA UNIÓN": "PZA UNIÓN",
    "PUNO": "PUNO",
    "UNION 797": "JR UNIÓN",
    "UNIÓN 797": "JR UNIÓN",
    "JIRON UNION": "JR UNIÓN",
    "JIRÓN UNIÓN": "JR UNIÓN",
    "JR UNION": "JR UNIÓN",
    "JR UNIÓN": "JR UNIÓN",
    "TRUJILLO": "TRUJILLO",
}

TIPOS_UBICACION_EQUIVALENCIAS = {
    "TIENDA FISICA": "TIENDA FÍSICA",
    "TIENDA FÍSICA": "TIENDA FÍSICA",
    "CENTRO DE DISTRIBUCION": "CENTRO DE DISTRIBUCIÓN",
    "CENTRO DE DISTRIBUCIÓN": "CENTRO DE DISTRIBUCIÓN",
    "CANAL DIGITAL": "CANAL DIGITAL",
}

ESTADOS_EQUIVALENCIAS = {
    "ACTIVA": "ACTIVA",
    "ACTIVO": "ACTIVA",
    "VIGENTE": "ACTIVA",
    "INACTIVA": "INACTIVA",
    "INACTIVO": "INACTIVA",
    "CERRADA": "INACTIVA",
    "CERRADO": "INACTIVA",
    "EN PROYECTO": "EN PROYECTO",
    "PROXIMA APERTURA": "EN PROYECTO",
    "PRÓXIMA APERTURA": "EN PROYECTO",
}

TIENDA_IDS = {
    "MARINA": "T001",
    "ARAMBURU": "T002",
    "EMANCIPACIÓN": "T003",
    "INDEPENDENCIA": "T004",
    "ALFONSO UGARTE": "T005",
    "ANGAMOS": "T006",
    "PERSHING": "T007",
    "ALIPIO": "T008",
    "CHORRILLOS": "T009",
    "TRUJILLO": "T010",
    "PUENTE PIEDRA": "T011",
    "AYACUCHO": "T012",
    "CALLAO": "T013",
    "TUMBES": "T014",
    "PZA UNIÓN": "T015",
    "JR UNIÓN": "T016",
    "ARGENTINA": "T017",
    "PUNO": "T018",
    "CD": "T019",
    "ONLINE": "T020",
}

TOKENS_NULOS = {"", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A"}


def preparar_carpetas() -> None:
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def sql_texto(valor: Any) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def normalizar_clave_python(valor: Any) -> str:
    texto = "" if valor is None else str(valor)
    texto = unicodedata.normalize("NFKD", texto.upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_diccionario(diccionario: dict[str, str]) -> dict[str, str]:
    return {normalizar_clave_python(k): v for k, v in diccionario.items()}


def sql_limpiar_texto(expresion: str, mayusculas: bool = True) -> str:
    texto = f"CAST({expresion} AS VARCHAR)"
    texto = f"replace({texto}, {sql_texto(chr(160))}, ' ')"
    texto = f"replace({texto}, {sql_texto(chr(8203))}, '')"
    texto = f"replace(replace({texto}, chr(13), ' '), chr(10), ' ')"
    texto = f"NULLIF(regexp_replace(trim({texto}), '\\s+', ' ', 'g'), '')"
    clave = f"upper(COALESCE({texto}, ''))"
    lista = ", ".join(sql_texto(x) for x in sorted(TOKENS_NULOS))
    base = f"CASE WHEN {clave} IN ({lista}) THEN NULL ELSE {texto} END"
    return f"upper({base})" if mayusculas else base


def sql_clave(expresion: str) -> str:
    texto = f"upper(COALESCE(CAST({expresion} AS VARCHAR), ''))"
    for origen, destino in [
        ("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"),
        ("Ú", "U"), ("Ü", "U"), ("Ñ", "N"),
    ]:
        texto = f"replace({texto}, {sql_texto(origen)}, {sql_texto(destino)})"
    texto = f"regexp_replace({texto}, '[^A-Z0-9]+', ' ', 'g')"
    return f"trim(regexp_replace({texto}, '\\s+', ' ', 'g'))"


def sql_mapear(expresion: str, diccionario: dict[str, str], fallback: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_texto(k)} THEN {sql_texto(v)}"
        for k, v in sorted(normalizar_diccionario(diccionario).items())
    )
    return f"CASE {sql_clave(expresion)}\n{casos}\nELSE {fallback}\nEND"


def sql_numero(expresion: str) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"
    limpio = f"regexp_replace({raw}, '[^0-9,\\.\\-]', '', 'g')"
    return f"""
    CASE
        WHEN {raw} IS NULL OR upper({raw}) IN ('', 'N/A', 'NA', 'NULL', 'NONE', '-', '--', '#N/A') THEN NULL
        WHEN regexp_full_match({limpio}, '^-?[0-9]{{1,3}}(\\.[0-9]{{3}})+,[0-9]+$')
            THEN TRY_CAST(replace(replace({limpio}, '.', ''), ',', '.') AS DECIMAL(14,2))
        WHEN regexp_full_match({limpio}, '^-?[0-9]{{1,3}}(,[0-9]{{3}})+\\.[0-9]+$')
            THEN TRY_CAST(replace({limpio}, ',', '') AS DECIMAL(14,2))
        WHEN regexp_full_match({limpio}, '^-?[0-9]+,[0-9]+$')
            THEN TRY_CAST(replace({limpio}, ',', '.') AS DECIMAL(14,2))
        ELSE TRY_CAST(replace({limpio}, ',', '') AS DECIMAL(14,2))
    END
    """


def sql_fecha_excel(expresion: str) -> str:
    raw = f"NULLIF(trim(CAST({expresion} AS VARCHAR)), '')"
    numero = f"TRY_CAST(replace({raw}, ',', '.') AS DOUBLE)"
    return f"""
    CASE
        WHEN {raw} IS NULL OR upper({raw}) IN ('N/A','NA','NULL','NONE','-','--','#N/A') THEN NULL
        WHEN regexp_full_match({raw}, '^[0-9]+([.,][0-9]+)?$') AND {numero} BETWEEN 1 AND 100000
            THEN CAST(TIMESTAMP '1899-12-30' + ({numero} * INTERVAL '1 day') AS DATE)
        ELSE COALESCE(
            TRY_CAST({raw} AS DATE),
            CAST(try_strptime({raw}, '%d/%m/%Y') AS DATE),
            CAST(try_strptime({raw}, '%Y-%m-%d') AS DATE),
            CAST(try_strptime({raw}, '%d-%m-%Y') AS DATE)
        )
    END
    """


def id_sql(tienda_expr: str) -> str:
    return sql_tienda_id_maestro(tienda_expr)


def encontrar_excel_capa1() -> Path:
    preferido = CAPA1_DIR / "TIENDAS.xlsx"
    if preferido.exists():
        return preferido
    candidatos = sorted(
        p for p in CAPA1_DIR.glob("TIENDAS*.xlsx")
        if not p.name.startswith("~$")
    )
    if len(candidatos) == 1:
        return candidatos[0]
    if not candidatos:
        raise FileNotFoundError(f"No se encontró TIENDAS.xlsx dentro de {CAPA1_DIR}.")
    raise RuntimeError(
        "Hay varios Excel de tiendas en capa1. Conserva uno solo o renombra "
        "el definitivo como TIENDAS.xlsx."
    )


def crear_conexion(cargar_excel: bool) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def origen_excel(archivo: Path) -> str:
    return origen_xlsx_csv(archivo, HOJA_CAPA1)


def obtener_columnas(con: duckdb.DuckDBPyConnection, archivo: Path) -> list[str]:
    return [
        fila[0]
        for fila in con.execute(
            f"DESCRIBE SELECT * FROM {origen_excel(archivo)}"
        ).fetchall()
    ]


def construir_sql_capa2(archivo: Path, columnas_disponibles: list[str] | None = None) -> str:
    origen = origen_excel(archivo)
    columnas_disponibles = columnas_disponibles or []
    mapa_columnas = {normalizar_clave_python(c): c for c in columnas_disponibles}

    def columna_opcional(*candidatos: str) -> str | None:
        for candidato in candidatos:
            encontrada = mapa_columnas.get(normalizar_clave_python(candidato))
            if encontrada:
                return encontrada
        return None

    columna_capacidad = columna_opcional(
        "capacidad_stock_unidades",
        "capacidad_stock_unid",
        "capacidad unidades",
        "capacidad stock unid",
        "capacidad_stock",
        "capacidad stock",
        "capacidad",
    )
    capacidad_expr = (
        sql_numero('"' + columna_capacidad.replace('"', '""') + '"')
        if columna_capacidad
        else "CAST(NULL AS DECIMAL(14,2))"
    )

    tienda_limpia = sql_limpiar_texto('"tienda"')
    tienda = sql_mapear("tienda_limpia", TIENDAS_EQUIVALENCIAS, "tienda_limpia")
    tipo_limpio = sql_limpiar_texto('"tipo_ubicacion"')
    tipo_mapeado = sql_mapear("tipo_limpio", TIPOS_UBICACION_EQUIVALENCIAS, "tipo_limpio")
    estado_limpio = sql_limpiar_texto('"estado_operativo"')
    estado_mapeado = sql_mapear("estado_limpio", ESTADOS_EQUIVALENCIAS, "estado_limpio")

    return f"""
    WITH raw AS (
        SELECT
            {tienda_limpia} AS tienda_limpia,
            {sql_limpiar_texto('"Alias"')} AS alias,
            {tipo_limpio} AS tipo_limpio,
            {sql_limpiar_texto('"formato_tienda"')} AS formato_tienda,
            {sql_limpiar_texto('"cluster"')} AS cluster,
            {sql_numero('"metraje_m2"')} AS metraje_m2,
            {capacidad_expr} AS capacidad_stock_unidades,
            {sql_limpiar_texto('"departamento"')} AS departamento,
            {sql_limpiar_texto('"provincia"')} AS provincia,
            {sql_limpiar_texto('"distrito"')} AS distrito,
            {sql_limpiar_texto('"direccion"', mayusculas=False)} AS direccion,
            {sql_fecha_excel('"fecha_apertura"')} AS fecha_apertura,
            {estado_limpio} AS estado_limpio,
            {sql_fecha_excel('"fecha_cierre"')} AS fecha_cierre
        FROM {origen}
        WHERE {tienda_limpia} IS NOT NULL
    ), normalizado_pre AS (
        SELECT
            {tienda} AS tienda,
            alias,
            {tipo_mapeado} AS tipo_ubicacion_origen,
            formato_tienda,
            cluster,
            metraje_m2,
            capacidad_stock_unidades,
            departamento,
            provincia,
            distrito,
            direccion,
            fecha_apertura,
            {estado_mapeado} AS estado_operativo_origen,
            fecha_cierre
        FROM raw
    ), normalizado AS (
        SELECT
            tienda,
            alias,
            CASE
                WHEN tienda = 'ONLINE' THEN 'CANAL DIGITAL'
                WHEN tienda = 'CD' THEN 'CENTRO DE DISTRIBUCIÓN'
                WHEN tipo_ubicacion_origen IS NULL THEN 'TIENDA FÍSICA'
                ELSE tipo_ubicacion_origen
            END AS tipo_ubicacion,
            formato_tienda,
            cluster,
            CASE WHEN tienda IN ('ONLINE', 'CD') THEN NULL ELSE metraje_m2 END AS metraje_m2,
            CASE WHEN tienda IN ('ONLINE', 'CD') THEN NULL ELSE capacidad_stock_unidades END AS capacidad_stock_unidades,
            departamento,
            provincia,
            distrito,
            direccion,
            fecha_apertura,
            CASE WHEN tienda = 'ONLINE' THEN NULL ELSE fecha_cierre END AS fecha_cierre,
            CASE
                WHEN tienda = 'ONLINE' THEN 'ACTIVA'
                ELSE estado_operativo_origen
            END AS estado_operativo
        FROM normalizado_pre
    )
    SELECT
        {id_sql('tienda')} AS tienda_id,
        tienda,
        alias,
        tipo_ubicacion,
        formato_tienda,
        cluster,
        (tipo_ubicacion = 'TIENDA FÍSICA') AS es_tienda,
        CAST(metraje_m2 AS DECIMAL(14,2)) AS metraje_m2,
        CAST(capacidad_stock_unidades AS DECIMAL(14,2)) AS capacidad_stock_unidades,
        departamento,
        provincia,
        distrito,
        direccion,
        fecha_apertura,
        fecha_cierre,
        estado_operativo,
        COALESCE(estado_operativo = 'ACTIVA', FALSE) AS es_vigente
    FROM normalizado
    """


def verificar_capa1(con: duckdb.DuckDBPyConnection, archivo: Path) -> dict[str, int]:
    columnas = obtener_columnas(con, archivo)
    faltan = [c for c in COLUMNAS_REQUERIDAS if c not in columnas]
    if faltan:
        raise RuntimeError(
            "El Excel TIENDAS no contiene todas las columnas requeridas.\n"
            f"Faltan: {faltan}\nEncontradas: {columnas}"
        )

    sql = construir_sql_capa2(archivo, columnas)
    filas = con.execute(f"SELECT COUNT(*) FROM ({sql})").fetchone()[0]
    if filas == 0:
        raise RuntimeError("El Excel de tiendas no contiene registros utilizables.")

    duplicados = con.execute(
        f"""
        SELECT tienda, COUNT(*)
        FROM ({sql})
        GROUP BY tienda
        HAVING COUNT(*) > 1
        ORDER BY tienda
        """
    ).fetchall()
    if duplicados:
        detalle = ", ".join(f"{t} ({c})" for t, c in duplicados)
        raise RuntimeError(f"Hay tiendas duplicadas después de normalizar: {detalle}")

    alias_invalidos = con.execute(
        f"""
        SELECT
            COUNT(*) FILTER (WHERE alias IS NULL),
            COUNT(*) - COUNT(DISTINCT alias)
        FROM ({sql})
        """
    ).fetchone()
    if alias_invalidos[0]:
        raise RuntimeError(
            f"TIENDAS.xlsx contiene {int(alias_invalidos[0])} alias vacíos. "
            "Cada tienda debe tener un alias."
        )
    if alias_invalidos[1]:
        raise RuntimeError(
            f"TIENDAS.xlsx contiene {int(alias_invalidos[1])} alias duplicados. "
            "Los alias deben ser únicos para usarlos en filtros y botones."
        )

    advertencias = con.execute(
        f"""
        SELECT
            COUNT(*) FILTER (WHERE tipo_ubicacion = 'TIENDA FÍSICA' AND metraje_m2 IS NULL),
            COUNT(*) FILTER (WHERE tipo_ubicacion = 'TIENDA FÍSICA' AND capacidad_stock_unidades IS NULL),
            COUNT(*) FILTER (WHERE fecha_apertura IS NULL),
            COUNT(*) FILTER (WHERE estado_operativo IS NULL),
            COUNT(*) FILTER (WHERE estado_operativo = 'INACTIVA' AND fecha_cierre IS NULL),
            COUNT(*) FILTER (WHERE direccion IS NULL)
        FROM ({sql})
        """
    ).fetchone()

    print("\nCAPA 1 DE TIENDAS VERIFICADA")
    print(f"Archivo                         : {archivo}")
    print(f"Registros                       : {filas}")
    print(f"Tiendas físicas sin metraje     : {advertencias[0]}")
    print(f"Tiendas físicas sin capacidad   : {advertencias[1]}")
    print(f"Fechas de apertura vacías       : {advertencias[2]}")
    print(f"Estados operativos vacíos       : {advertencias[3]}")
    print(f"Inactivas sin fecha de cierre   : {advertencias[4]}")
    print(f"Direcciones vacías              : {advertencias[5]}")
    print("Los campos vacíos opcionales se publicarán como NULL y no detienen la pipeline.")
    return {"filas": int(filas), "columnas": len(columnas)}


def crear_capa2(con: duckdb.DuckDBPyConnection, archivo: Path) -> None:
    columnas = obtener_columnas(con, archivo)
    verificar_capa1(con, archivo)
    CAPA2_TEMP.unlink(missing_ok=True)
    sql = construir_sql_capa2(archivo, columnas)
    con.execute(
        f"""
        COPY (
            SELECT * FROM ({sql}) ORDER BY tienda_id
        ) TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY)
        """
    )


def validar_y_publicar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_TEMP.exists() or CAPA2_TEMP.stat().st_size == 0:
        raise RuntimeError("No se generó un Parquet temporal válido.")
    origen = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError(f"Esquema inesperado. Esperado: {COLUMNAS_CAPA2}; obtenido: {columnas}")
    filas, ids, tiendas = con.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT tienda_id), COUNT(DISTINCT tienda) FROM {origen}"
    ).fetchone()
    if filas == 0 or filas != ids or filas != tiendas:
        raise RuntimeError("La dimensión no tiene una fila e identificador único por tienda.")
    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    return {"filas": int(filas), "columnas": len(columnas), "tamano_bytes": CAPA2_FINAL.stat().st_size}


def verificar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_FINAL.exists():
        raise FileNotFoundError(f"No existe {CAPA2_FINAL}")
    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError("DimTiendas.parquet tiene un esquema inesperado.")
    filas = con.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    print("\nDIM_TIENDAS VERIFICADA")
    print(f"Parquet  : {CAPA2_FINAL}")
    print(f"Registros: {filas}")
    for fila in con.execute(
        f"SELECT tienda_id, tienda, estado_operativo, fecha_cierre FROM {origen} ORDER BY tienda_id"
    ).fetchall():
        print("  ", fila)
    return {"filas": int(filas), "columnas": len(columnas)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Excel manual de tiendas -> capa2/DimTiendas.parquet"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    args = parser.parse_args()

    preparar_carpetas()
    con = None
    try:
        if args.verificar_capa2:
            con = crear_conexion(False)
            verificar_capa2(con)
            return 0

        archivo = encontrar_excel_capa1()
        con = crear_conexion(True)
        if args.verificar_capa1:
            verificar_capa1(con, archivo)
            return 0

        crear_capa2(con, archivo)
        resumen = validar_y_publicar_capa2(con)
        print("\nDIM_TIENDAS GENERADA CORRECTAMENTE")
        print(f"Registros : {resumen['filas']}")
        print(f"Columnas  : {resumen['columnas']}")
        print(f"Resultado : {CAPA2_FINAL}")
        return 0
    except Exception as exc:
        print("\nERROR EN LA PIPELINE DE TIENDAS", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        CAPA2_TEMP.unlink(missing_ok=True)
        return 1
    finally:
        if con is not None:
            cerrar_duckdb_seguro(con)


# La homologación final usa el maestro único del proyecto. Se conservan
# equivalencias locales antiguas, pero nunca se pierden alias nuevos del maestro.
TIENDAS_EQUIVALENCIAS = {**TIENDAS_EQUIVALENCIAS_MAESTRAS, **TIENDAS_EQUIVALENCIAS}
TIENDA_IDS = dict(TIENDA_IDS_MAESTRAS)

if __name__ == "__main__":
    finalizar_proceso(main())
