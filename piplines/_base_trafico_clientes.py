from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from xlsx_staging import origen_xlsx_csv
from maestros import (
    ANIO_INICIO_MODELO,
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
CAPA2_FINAL = CAPA2_DIR / "FactTraficoClientes.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactTraficoClientes_temporal.parquet"
HOJAS_PERMITIDAS = ("TRAFICO_CLIENTE", "TRAFICO_CLIENTES_C1")

COLUMNAS_MINIMAS = ["fecha", "tienda", "cantidad_personas", "estado_registro"]
COLUMNAS_COMPLETAS = COLUMNAS_MINIMAS + [
    "tipo_conteo", "fuente_conteo", "unidad_medida"
]

COLUMNAS_CAPA2 = [
    "trafico_id",
    "fecha_id",
    "periodo_id",
    "fecha",
    "anio",
    "mes_numero",
    "mes_nombre",
    "trimestre",
    "semana",
    "dia_semana_numero",
    "dia_semana_nombre",
    "tienda_id",
    "tienda",
    "cantidad_personas",
    "estado_registro",
    "es_dato_valido",
    "tipo_conteo",
    "fuente_conteo",
    "unidad_medida",
]

TOKENS_NULOS = {"", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A", "S/N"}

TIENDAS_EQUIVALENCIAS = {
    "AGUAS VERDES": "TUMBES",
    "TUMBES": "TUMBES",
    "A UGARTE": "ALFONSO UGARTE",
    "A. UGARTE": "ALFONSO UGARTE",
    "A.UGARTE": "ALFONSO UGARTE",
    "ALF UGARTE": "ALFONSO UGARTE",
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
    "PERSHING": "PERSHING",
    "P PIEDRA": "PUENTE PIEDRA",
    "P. PIEDRA": "PUENTE PIEDRA",
    "P. PIEDRA.": "PUENTE PIEDRA",
    "PTE PIEDRA": "PUENTE PIEDRA",
    "PP": "PUENTE PIEDRA",
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
    "ONLINE": "ONLINE",
    "ALMACEN VIRTUAL": "ONLINE",
    "ALMACÉN VIRTUAL": "ONLINE",
    "ALMACEN VIRUTAL": "ONLINE",
    "ALMACÉN VIRUTAL": "ONLINE",
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

ESTADOS_EQUIVALENCIAS = {
    "REGISTRADO": "REGISTRADO",
    "CON DATO": "REGISTRADO",
    "SIN INFORMACION": "SIN INFORMACIÓN",
    "SIN INFORMACIÓN": "SIN INFORMACIÓN",
    "SIN DATO": "SIN INFORMACIÓN",
    "CERRADO": "CERRADO",
    "FERIADO": "FERIADO",
}

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


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


def sql_limpiar_texto(expresion: str) -> str:
    texto = f"CAST({expresion} AS VARCHAR)"
    texto = f"replace({texto}, {sql_texto(chr(160))}, ' ')"
    texto = f"replace({texto}, {sql_texto(chr(8203))}, '')"
    texto = f"replace(replace({texto}, chr(13), ' '), chr(10), ' ')"
    texto = f"NULLIF(regexp_replace(trim({texto}), '\\s+', ' ', 'g'), '')"
    lista = ", ".join(sql_texto(x) for x in sorted(TOKENS_NULOS))
    return f"CASE WHEN upper(COALESCE({texto}, '')) IN ({lista}) THEN NULL ELSE upper({texto}) END"


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
        WHEN {raw} IS NULL OR upper({raw}) IN ('', 'N/A', 'NA', 'NULL', 'NONE', '-', '--', '#N/A', 'S/N') THEN NULL
        WHEN regexp_full_match({limpio}, '^-?[0-9]{{1,3}}(\\.[0-9]{{3}})+,[0-9]+$')
            THEN TRY_CAST(replace(replace({limpio}, '.', ''), ',', '.') AS DOUBLE)
        WHEN regexp_full_match({limpio}, '^-?[0-9]{{1,3}}(,[0-9]{{3}})+\\.[0-9]+$')
            THEN TRY_CAST(replace({limpio}, ',', '') AS DOUBLE)
        WHEN regexp_full_match({limpio}, '^-?[0-9]+,[0-9]+$')
            THEN TRY_CAST(replace({limpio}, ',', '.') AS DOUBLE)
        ELSE TRY_CAST(replace({limpio}, ',', '') AS DOUBLE)
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


def buscar_archivo_capa1() -> Path:
    preparar_carpetas()
    preferido = CAPA1_DIR / "TRAFICO_CLIENTES.xlsx"
    if preferido.exists():
        return preferido
    candidatos = sorted(
        p for p in CAPA1_DIR.glob("*.xlsx")
        if not p.name.startswith("~$")
        and "TRAFICO" in normalizar_clave_python(p.stem)
        and "CLIENT" in normalizar_clave_python(p.stem)
    )
    if len(candidatos) == 1:
        return candidatos[0]
    if not candidatos:
        raise FileNotFoundError(f"No se encontró TRAFICO_CLIENTES.xlsx dentro de {CAPA1_DIR}.")
    raise RuntimeError("Hay varios Excel de tráfico en capa1. Conserva solamente el vigente.")


def nombres_hojas(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        contenedor = wb.find(f"{{{NS_MAIN}}}sheets")
        if contenedor is None:
            return []
        return [s.attrib["name"] for s in contenedor]


def encontrar_hoja(archivo: Path) -> str:
    hojas = nombres_hojas(archivo)
    for nombre in HOJAS_PERMITIDAS:
        if nombre in hojas:
            return nombre
    raise RuntimeError(
        f"No se encontró una hoja válida. Se acepta {HOJAS_PERMITIDAS}; encontradas: {hojas}"
    )


def crear_conexion(cargar_excel: bool) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def consulta_excel(archivo: Path, hoja: str) -> str:
    return origen_xlsx_csv(archivo, hoja)


def detectar_esquema(con: duckdb.DuckDBPyConnection, origen: str) -> tuple[str, list[str]]:
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    faltan = [c for c in COLUMNAS_MINIMAS if c not in columnas]
    if faltan:
        raise RuntimeError(f"Faltan columnas mínimas en el Excel de tráfico: {faltan}")
    return ("COMPLETO" if all(c in columnas for c in COLUMNAS_COMPLETAS) else "MINIMO", columnas)


def construir_sql_capa2(archivo: Path, hoja: str, esquema: str) -> str:
    origen = consulta_excel(archivo, hoja)
    tipo = sql_limpiar_texto('"tipo_conteo"') if esquema == "COMPLETO" else "NULL"
    fuente = sql_limpiar_texto('"fuente_conteo"') if esquema == "COMPLETO" else "NULL"
    unidad = sql_limpiar_texto('"unidad_medida"') if esquema == "COMPLETO" else "NULL"
    tienda_mapeada = sql_mapear("tienda_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen")
    estado_mapeado = sql_mapear("estado_origen", ESTADOS_EQUIVALENCIAS, "estado_origen")

    return f"""
    WITH raw AS (
        SELECT
            row_number() OVER () AS fila_origen,
            {sql_fecha_excel('"fecha"')} AS fecha,
            {sql_limpiar_texto('"tienda"')} AS tienda_origen,
            TRY_CAST(({sql_numero('"cantidad_personas"')}) AS INTEGER) AS cantidad_origen,
            {sql_limpiar_texto('"estado_registro"')} AS estado_origen,
            {tipo} AS tipo_origen,
            {fuente} AS fuente_origen,
            {unidad} AS unidad_origen
        FROM {origen}
        WHERE NOT (
            "fecha" IS NULL AND "tienda" IS NULL
            AND "cantidad_personas" IS NULL AND "estado_registro" IS NULL
        )
    ), normalizado_pre AS (
        SELECT
            fila_origen,
            fecha,
            {tienda_mapeada} AS tienda,
            cantidad_origen,
            {estado_mapeado} AS estado_origen,
            tipo_origen,
            fuente_origen,
            unidad_origen
        FROM raw
    ), normalizado AS (
        SELECT
            fila_origen,
            fecha,
            tienda,
            CASE
                WHEN estado_origen = 'SIN INFORMACIÓN' THEN NULL
                WHEN estado_origen IN ('CERRADO', 'FERIADO') THEN COALESCE(cantidad_origen, 0)
                ELSE cantidad_origen
            END AS cantidad_personas,
            CASE
                WHEN estado_origen IS NOT NULL THEN estado_origen
                WHEN cantidad_origen IS NULL THEN 'SIN INFORMACIÓN'
                ELSE 'REGISTRADO'
            END AS estado_registro,
            COALESCE(tipo_origen, 'ENTRADA DE CLIENTES') AS tipo_conteo,
            COALESCE(fuente_origen, 'SEGURIDAD') AS fuente_conteo,
            COALESCE(unidad_origen, 'PERSONAS') AS unidad_medida
        FROM normalizado_pre
    ), enriquecido AS (
        SELECT
            CASE
                WHEN fecha IS NULL OR tienda IS NULL THEN NULL
                ELSE CAST(strftime(fecha, '%Y%m%d') || '_' || {id_sql('tienda')} AS VARCHAR)
            END AS trafico_id,
            CASE WHEN fecha IS NULL THEN NULL ELSE CAST(strftime(fecha, '%Y%m%d') AS INTEGER) END AS fecha_id,
            CASE WHEN fecha IS NULL THEN NULL ELSE CAST(strftime(fecha, '%Y%m') AS INTEGER) END AS periodo_id,
            fecha,
            date_part('year', fecha)::INTEGER AS anio,
            date_part('month', fecha)::INTEGER AS mes_numero,
            CASE date_part('month', fecha)::INTEGER
                WHEN 1 THEN 'ENERO' WHEN 2 THEN 'FEBRERO' WHEN 3 THEN 'MARZO'
                WHEN 4 THEN 'ABRIL' WHEN 5 THEN 'MAYO' WHEN 6 THEN 'JUNIO'
                WHEN 7 THEN 'JULIO' WHEN 8 THEN 'AGOSTO' WHEN 9 THEN 'SEPTIEMBRE'
                WHEN 10 THEN 'OCTUBRE' WHEN 11 THEN 'NOVIEMBRE' WHEN 12 THEN 'DICIEMBRE'
                ELSE NULL
            END AS mes_nombre,
            date_part('quarter', fecha)::INTEGER AS trimestre,
            date_part('week', fecha)::INTEGER AS semana,
            date_part('isodow', fecha)::INTEGER AS dia_semana_numero,
            CASE date_part('isodow', fecha)::INTEGER
                WHEN 1 THEN 'LUNES' WHEN 2 THEN 'MARTES' WHEN 3 THEN 'MIÉRCOLES'
                WHEN 4 THEN 'JUEVES' WHEN 5 THEN 'VIERNES' WHEN 6 THEN 'SÁBADO'
                WHEN 7 THEN 'DOMINGO' ELSE NULL
            END AS dia_semana_nombre,
            {id_sql('tienda')} AS tienda_id,
            tienda,
            cantidad_personas,
            estado_registro,
            CASE
                WHEN fecha IS NULL OR tienda IS NULL THEN FALSE
                WHEN estado_registro = 'REGISTRADO' AND cantidad_personas IS NOT NULL AND cantidad_personas >= 0 THEN TRUE
                WHEN estado_registro IN ('CERRADO','FERIADO') AND cantidad_personas = 0 THEN TRUE
                WHEN estado_registro = 'SIN INFORMACIÓN' AND cantidad_personas IS NULL THEN FALSE
                ELSE FALSE
            END AS es_dato_valido,
            tipo_conteo,
            fuente_conteo,
            unidad_medida,
            fila_origen
        FROM normalizado
        WHERE fecha >= make_date({ANIO_INICIO_MODELO}, 1, 1)
    ), deduplicado AS (
        SELECT * EXCLUDE (fila_origen, orden_fecha_tienda)
        FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY fecha, tienda
                ORDER BY fila_origen
            ) AS orden_fecha_tienda
            FROM enriquecido
        )
        WHERE orden_fecha_tienda = 1
    )
    SELECT
        trafico_id,
        fecha_id,
        periodo_id,
        fecha,
        anio,
        mes_numero,
        mes_nombre,
        trimestre,
        semana,
        dia_semana_numero,
        dia_semana_nombre,
        tienda_id,
        tienda,
        cantidad_personas,
        estado_registro,
        es_dato_valido,
        tipo_conteo,
        fuente_conteo,
        unidad_medida
    FROM deduplicado
    """


def verificar_capa1(con: duckdb.DuckDBPyConnection, archivo: Path, hoja: str) -> dict[str, int]:
    origen = consulta_excel(archivo, hoja)
    esquema, columnas = detectar_esquema(con, origen)
    sql = construir_sql_capa2(archivo, hoja, esquema)
    resumen = con.execute(
        f"""
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE fecha IS NULL),
            COUNT(*) FILTER (WHERE tienda IS NULL),
            COUNT(*) FILTER (WHERE cantidad_personas IS NULL),
            COUNT(*) FILTER (WHERE cantidad_personas < 0),
            COUNT(*) FILTER (WHERE estado_registro IS NULL),
            COUNT(*) FILTER (WHERE NOT es_dato_valido),
            COUNT(DISTINCT tienda),
            COALESCE(SUM(cantidad_personas) FILTER (WHERE estado_registro='REGISTRADO'), 0)
        FROM ({sql})
        """
    ).fetchone()
    if resumen[0] == 0:
        raise RuntimeError("El Excel de tráfico no contiene registros utilizables.")

    duplicados_originales = con.execute(
        f"""
        WITH d AS (
            SELECT {sql_fecha_excel('"fecha"')} AS fecha,
                   {sql_mapear(sql_limpiar_texto('"tienda"'), TIENDAS_EQUIVALENCIAS, sql_limpiar_texto('"tienda"'))} AS tienda
            FROM {origen}
            WHERE NOT ("fecha" IS NULL AND "tienda" IS NULL)
        )
        SELECT COUNT(*) FROM (
            SELECT fecha, tienda, COUNT(*)
            FROM d GROUP BY fecha, tienda HAVING COUNT(*) > 1
        )
        """
    ).fetchone()[0]

    print("\nCAPA 1 DE TRÁFICO VERIFICADA")
    print(f"Archivo                       : {archivo}")
    print(f"Hoja                          : {hoja}")
    print(f"Formato                       : {esquema}")
    print(f"Registros finales             : {resumen[0]}")
    print(f"Tiendas                       : {resumen[7]}")
    print(f"Total personas registradas    : {resumen[8]}")
    print(f"Fechas vacías                 : {resumen[1]}")
    print(f"Tiendas vacías                : {resumen[2]}")
    print(f"Cantidades NULL               : {resumen[3]}")
    print(f"Cantidades negativas          : {resumen[4]}")
    print(f"Estados vacíos                : {resumen[5]}")
    print(f"Registros no válidos          : {resumen[6]}")
    print(f"Fechas/tiendas duplicadas     : {duplicados_originales}")
    print("Los conteos vacíos con SIN INFORMACIÓN se conservan como NULL.")
    print("Esta versión genera tienda_id sin depender de DimTiendas.parquet.")
    return {"filas": int(resumen[0]), "columnas": len(columnas)}


def crear_capa2(con: duckdb.DuckDBPyConnection, archivo: Path, hoja: str) -> None:
    origen = consulta_excel(archivo, hoja)
    esquema, _ = detectar_esquema(con, origen)
    verificar_capa1(con, archivo, hoja)
    CAPA2_TEMP.unlink(missing_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT * FROM ({construir_sql_capa2(archivo, hoja, esquema)})
            ORDER BY fecha, tienda_id
        ) TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY)
        """
    )


def validar_y_publicar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_TEMP.exists():
        raise RuntimeError("No se generó el Parquet temporal de tráfico.")
    origen = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError(f"Esquema inesperado. Esperado: {COLUMNAS_CAPA2}; obtenido: {columnas}")
    filas = con.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas == 0:
        raise RuntimeError("El Parquet de tráfico quedó vacío.")
    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    return {"filas": int(filas), "columnas": len(columnas)}


def verificar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_FINAL.exists():
        raise FileNotFoundError(f"No existe {CAPA2_FINAL}")
    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError("FactTraficoClientes.parquet tiene un esquema inesperado.")
    resumen = con.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT tienda_id), COALESCE(SUM(cantidad_personas),0) FROM {origen}"
    ).fetchone()
    print("\nFACT_TRAFICO_CLIENTES VERIFICADA")
    print(f"Registros      : {resumen[0]}")
    print(f"Tiendas        : {resumen[1]}")
    print(f"Total personas : {resumen[2]}")
    return {"filas": int(resumen[0]), "columnas": len(columnas)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Excel manual de tráfico -> capa2/FactTraficoClientes.parquet"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--solo-capa2", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    args = parser.parse_args()

    preparar_carpetas()
    con = None
    try:
        if args.verificar_capa2:
            con = crear_conexion(False)
            verificar_capa2(con)
            return 0

        archivo = buscar_archivo_capa1()
        hoja = encontrar_hoja(archivo)
        con = crear_conexion(True)
        if args.verificar_capa1:
            verificar_capa1(con, archivo, hoja)
            return 0

        crear_capa2(con, archivo, hoja)
        resumen = validar_y_publicar_capa2(con)
        print("\nFACT_TRAFICO_CLIENTES GENERADA CORRECTAMENTE")
        print(f"Registros : {resumen['filas']}")
        print(f"Resultado : {CAPA2_FINAL}")
        return 0
    except Exception as exc:
        print("\nERROR EN LA PIPELINE DE TRÁFICO DE CLIENTES", file=sys.stderr)
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
