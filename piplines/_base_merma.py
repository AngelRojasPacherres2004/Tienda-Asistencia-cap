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


# ==========================================================
# 1. RUTAS Y ESQUEMAS
# ==========================================================

from project_paths import PROJECT_ROOT, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"

NOMBRE_CAPA1 = "MERMA.xlsx"
HOJAS_PERMITIDAS = ("MERMA", "MERMA_C1")

DIM_TIENDAS = CAPA2_DIR / "DimTiendas.parquet"
CAPA2_FINAL = CAPA2_DIR / "FactMerma.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactMerma_temporal.parquet"

COLUMNAS_CAPA1 = [
    "fecha_periodo",
    "fecha_ocurrencia",
    "anio",
    "mes_numero",
    "mes_nombre",
    "tienda",
    "area",
    "tipo_merma",
    "detalle_ocurrencia",
    "codigo_nissei",
    "descripcion",
    "cantidad",
    "precio_unitario",
    "total_merma",
]

COLUMNAS_CAPA2 = [
    "merma_id",
    "fecha_id",
    "periodo_id",
    "fecha_analisis",
    "fecha_periodo",
    "fecha_ocurrencia",
    "es_fecha_exacta",
    "anio",
    "mes_numero",
    "mes_nombre",
    "trimestre",
    "semana",
    "dia_semana_numero",
    "dia_semana_nombre",
    "tienda_id",
    "tienda",
    "area",
    "tipo_merma",
    "detalle_ocurrencia",
    "codigo_nissei",
    "descripcion",
    "cantidad",
    "precio_unitario",
    "total_merma",
    "moneda",
    "es_valorizada",
]

ANIO_MINIMO = ANIO_INICIO_MODELO
ANIO_MAXIMO = 9999

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


# ==========================================================
# 2. REGLAS DE NEGOCIO COMPARTIDAS
# ==========================================================

TIENDAS_EQUIVALENCIAS = {
    "AGUAS VERDES": "TUMBES",
    "TUMBES": "TUMBES",
    "ALFONSO UGARTE": "ALFONSO UGARTE",
    "ALF UGARTE": "ALFONSO UGARTE",
    "ALF. UGARTE": "ALFONSO UGARTE",
    "ALIPIO": "ALIPIO",
    "ANGAMOS": "ANGAMOS",
    "ARAMBURU": "ARAMBURU",
    "ARAMBURÚ": "ARAMBURU",
    "ARGENTINA": "ARGENTINA",
    "ARGENT": "ARGENTINA",
    "AYA": "AYACUCHO",
    "AYACUCHO": "AYACUCHO",
    "AYACUCHO 1021 --- CUARTO PISO": "AYACUCHO",
    "CALLAO": "CALLAO",
    "CD": "CD",
    "CHORRILLOS": "CHORRILLOS",
    "EMANCIPACION": "EMANCIPACIÓN",
    "EMANCIPACIÓN": "EMANCIPACIÓN",
    "EMANCIP": "EMANCIPACIÓN",
    "INDEPENDENCIA": "INDEPENDENCIA",
    "INDEP": "INDEPENDENCIA",
    "LA MARINA": "MARINA",
    "MARINA": "MARINA",
    "PERSHING": "PERSHING",
    "PP": "PUENTE PIEDRA",
    "P. PIEDRA": "PUENTE PIEDRA",
    "PTE PIEDRA": "PUENTE PIEDRA",
    "PUENTE PIEDRA": "PUENTE PIEDRA",
    "PU": "PZA UNIÓN",
    "PZA UNION": "PZA UNIÓN",
    "PZA UNIÓN": "PZA UNIÓN",
    "PLAZA UNION": "PZA UNIÓN",
    "PLAZA UNIÓN": "PZA UNIÓN",
    "P. UNION": "PZA UNIÓN",
    "PUNO": "PUNO",
    "UNION 797": "JR UNIÓN",
    "UNIÓN 797": "JR UNIÓN",
    "JR. UNION 797": "JR UNIÓN",
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

AREAS_EQUIVALENCIAS = {
    "ELECTRO": "ELECTRO MENOR",
    "ELECTRO MENOR": "ELECTRO MENOR",
    "TECNOLOGIA": "TECNOLOGÍA",
    "TECNOLOGÍA": "TECNOLOGÍA",
    "TEXTIL": "TEXTIL",
    "CALZADO": "CALZADO",
    "HOGAR": "HOGAR",
    "MUEBLE": "MUEBLES",
    "MUEBLES": "MUEBLES",
    "BELLEZA": "BELLEZA",
    "VARIOS": "VARIOS",
    "OTROS": "VARIOS",
}

TIPOS_MERMA_EQUIVALENCIAS = {
    "ROBO": "ROBO",
    "HURTO": "ROBO",
    "ROBO EXTERNO": "ROBO",
    "FALTA": "FALTA",
    "FALTANTE": "FALTA",
    "DETERIORO": "DETERIORO",
    "DETERIORADO": "DETERIORO",
    "ROTO": "DETERIORO",
    "MALOGRADO": "DETERIORO",
    "NO FUNCIONA": "DETERIORO",
    "PRESENTA FALLA": "DETERIORO",
    "INCOMPLETO": "DETERIORO",
    "NO ESPECIFICADO": "NO ESPECIFICADO",
}

# Identificadores estables: son los mismos de Dim_Tiendas y de las demás facts.
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

TOKENS_NULOS = {
    "", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A", "S/F", "SIN FECHA"
}


# ==========================================================
# 3. UTILIDADES
# ==========================================================


def preparar_carpetas() -> None:
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def sql_texto(valor: Any) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def sql_identificador(nombre: str) -> str:
    return '"' + nombre.replace('"', '""') + '"'


def normalizar_clave_python(valor: Any) -> str:
    texto = "" if valor is None else str(valor)
    texto = unicodedata.normalize("NFKD", texto.upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_diccionario(diccionario: dict[str, str]) -> dict[str, str]:
    return {normalizar_clave_python(k): v for k, v in diccionario.items()}


def sql_clave(expresion: str) -> str:
    texto = f"upper(COALESCE(CAST({expresion} AS VARCHAR), ''))"
    for origen, destino in [
        ("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"),
        ("Ú", "U"), ("Ü", "U"), ("Ñ", "N"),
    ]:
        texto = f"replace({texto}, {sql_texto(origen)}, {sql_texto(destino)})"
    texto = f"regexp_replace({texto}, '[^A-Z0-9]+', ' ', 'g')"
    return f"trim(regexp_replace({texto}, '\\s+', ' ', 'g'))"


def sql_limpiar_texto(expresion: str, mayusculas: bool = True) -> str:
    texto = f"CAST({expresion} AS VARCHAR)"
    texto = f"replace({texto}, {sql_texto(chr(160))}, ' ')"
    texto = f"replace({texto}, {sql_texto(chr(8203))}, '')"
    texto = f"replace({texto}, '_x000a_', ' ')"
    texto = f"replace(replace({texto}, chr(13), ' '), chr(10), ' ')"
    texto = f"NULLIF(regexp_replace(trim({texto}), '\\s+', ' ', 'g'), '')"
    limpio = f"upper({texto})" if mayusculas else texto
    claves_nulas = ", ".join(sql_texto(normalizar_clave_python(x)) for x in sorted(TOKENS_NULOS))
    return f"CASE WHEN {sql_clave(limpio)} IN ({claves_nulas}) THEN NULL ELSE {limpio} END"


def sql_mapear(expresion: str, diccionario: dict[str, str], fallback: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_texto(clave)} THEN {sql_texto(valor)}"
        for clave, valor in sorted(normalizar_diccionario(diccionario).items())
    )
    return f"CASE {sql_clave(expresion)}\n{casos}\nELSE {fallback}\nEND"


def sql_numero(expresion: str) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"
    upper_raw = f"upper({raw})"
    nulos = ", ".join(sql_texto(x) for x in sorted(TOKENS_NULOS))
    limpio = f"regexp_replace({raw}, '[^0-9,\\.\\-\\(\\)]', '', 'g')"
    sin_parentesis = f"replace(replace({limpio}, '(', ''), ')', '')"
    firmado = (
        f"CASE WHEN {limpio} LIKE '(%' AND {limpio} LIKE '%)' "
        f"THEN '-' || {sin_parentesis} ELSE {sin_parentesis} END"
    )
    return f"""
    CASE
        WHEN {raw} IS NULL OR {upper_raw} IN ({nulos}) THEN NULL
        WHEN {firmado} = '' THEN NULL
        WHEN regexp_full_match({firmado}, '^-?[0-9]{{1,3}}(\\.[0-9]{{3}})+,[0-9]+$')
            THEN TRY_CAST(replace(replace({firmado}, '.', ''), ',', '.') AS DOUBLE)
        WHEN regexp_full_match({firmado}, '^-?[0-9]{{1,3}}(,[0-9]{{3}})+\\.[0-9]+$')
            THEN TRY_CAST(replace({firmado}, ',', '') AS DOUBLE)
        WHEN regexp_full_match({firmado}, '^-?[0-9]+,[0-9]+$')
            THEN TRY_CAST(replace({firmado}, ',', '.') AS DOUBLE)
        ELSE TRY_CAST(replace({firmado}, ',', '') AS DOUBLE)
    END
    """


def sql_entero(expresion: str) -> str:
    numero = sql_numero(expresion)
    return f"""
    CASE
        WHEN ({numero}) IS NULL THEN NULL
        WHEN ({numero}) = trunc({numero}) THEN TRY_CAST(({numero}) AS BIGINT)
        ELSE NULL
    END
    """


def sql_fecha_excel(expresion: str) -> str:
    raw = f"NULLIF(trim(CAST({expresion} AS VARCHAR)), '')"
    numero = f"TRY_CAST(replace({raw}, ',', '.') AS DOUBLE)"
    return f"""
    CASE
        WHEN {raw} IS NULL THEN NULL
        WHEN {sql_clave(raw)} IN ('N A', 'NA', 'NULL', 'NONE', 'S F', 'SIN FECHA') THEN NULL
        WHEN regexp_full_match({raw}, '^[0-9]+([.,][0-9]+)?$')
             AND {numero} BETWEEN 1 AND 100000
            THEN CAST(TIMESTAMP '1899-12-30' + ({numero} * INTERVAL '1 day') AS DATE)
        ELSE COALESCE(
            TRY_CAST({raw} AS DATE),
            CAST(try_strptime({raw}, '%d/%m/%Y') AS DATE),
            CAST(try_strptime({raw}, '%m/%d/%Y') AS DATE),
            CAST(try_strptime({raw}, '%Y-%m-%d') AS DATE),
            CAST(try_strptime({raw}, '%d-%m-%Y') AS DATE)
        )
    END
    """


def sql_limpiar_identificador(expresion: str) -> str:
    limpio = sql_limpiar_texto(expresion, mayusculas=True)
    return f"""
    CASE
        WHEN {limpio} IS NULL THEN NULL
        WHEN regexp_full_match({limpio}, '^[0-9]+\\.0+$')
            THEN regexp_replace({limpio}, '\\.0+$', '')
        WHEN regexp_full_match({limpio}, '^[0-9]{{1,3}}(,[0-9]{{3}})+$')
            THEN replace({limpio}, ',', '')
        ELSE {limpio}
    END
    """


def sql_nombre_mes(numero_expr: str) -> str:
    return f"""
    CASE {numero_expr}
        WHEN 1 THEN 'ENERO' WHEN 2 THEN 'FEBRERO' WHEN 3 THEN 'MARZO'
        WHEN 4 THEN 'ABRIL' WHEN 5 THEN 'MAYO' WHEN 6 THEN 'JUNIO'
        WHEN 7 THEN 'JULIO' WHEN 8 THEN 'AGOSTO' WHEN 9 THEN 'SEPTIEMBRE'
        WHEN 10 THEN 'OCTUBRE' WHEN 11 THEN 'NOVIEMBRE' WHEN 12 THEN 'DICIEMBRE'
        ELSE NULL
    END
    """


def sql_nombre_dia(numero_expr: str) -> str:
    return f"""
    CASE {numero_expr}
        WHEN 1 THEN 'LUNES' WHEN 2 THEN 'MARTES' WHEN 3 THEN 'MIÉRCOLES'
        WHEN 4 THEN 'JUEVES' WHEN 5 THEN 'VIERNES' WHEN 6 THEN 'SÁBADO'
        WHEN 7 THEN 'DOMINGO' ELSE NULL
    END
    """


def id_tienda_sql(tienda_expr: str) -> str:
    return sql_tienda_id_maestro(tienda_expr)


# ==========================================================
# 4. ARCHIVO, HOJA Y CONEXIÓN
# ==========================================================


def buscar_archivo_capa1() -> Path:
    preparar_carpetas()
    esperado = CAPA1_DIR / NOMBRE_CAPA1
    if esperado.exists():
        return esperado

    candidatos = sorted(
        archivo
        for archivo in CAPA1_DIR.glob("*.xlsx")
        if not archivo.name.startswith("~$")
        and "MERMA" in normalizar_clave_python(archivo.stem)
    )
    if not candidatos:
        raise FileNotFoundError(
            f"No se encontró {NOMBRE_CAPA1} dentro de {CAPA1_DIR}."
        )
    if len(candidatos) > 1:
        detalle = "\n".join(f"- {archivo.name}" for archivo in candidatos)
        raise RuntimeError(
            "Se encontró más de un Excel de merma en Capa 1. "
            "Deja solamente el archivo vigente o renómbralo como MERMA.xlsx:\n"
            + detalle
        )
    return candidatos[0]


def obtener_hojas_xlsx(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as libro:
        workbook = ET.fromstring(libro.read("xl/workbook.xml"))
        contenedor = workbook.find(f"{{{NS_MAIN}}}sheets")
        if contenedor is None:
            return []
        return [hoja.attrib["name"] for hoja in contenedor]


def buscar_hoja_capa1(archivo: Path) -> str:
    hojas = obtener_hojas_xlsx(archivo)
    for permitida in HOJAS_PERMITIDAS:
        if permitida in hojas:
            return permitida
    raise RuntimeError(
        "No se encontró una hoja válida de merma. "
        f"Se acepta: {', '.join(HOJAS_PERMITIDAS)}. "
        f"Hojas encontradas: {hojas}"
    )


def crear_conexion(cargar_excel: bool) -> duckdb.DuckDBPyConnection:
    conexion = duckdb.connect(database=":memory:")
    configurar_duckdb(conexion, BASE_DIR, preserve_insertion_order=False)
    return conexion


def consulta_excel(archivo: Path, hoja: str) -> str:
    return origen_xlsx_csv(archivo, hoja)


def obtener_columnas(
    conexion: duckdb.DuckDBPyConnection, archivo: Path, hoja: str
) -> list[str]:
    origen = consulta_excel(archivo, hoja)
    return [
        fila[0]
        for fila in conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    ]


# ==========================================================
# 5. SQL DE LIMPIEZA Y ENRIQUECIMIENTO
# ==========================================================


def construir_ctes(archivo: Path, hoja: str) -> str:
    origen = consulta_excel(archivo, hoja)

    tienda_mapeada = sql_mapear(
        "tienda_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen"
    )
    area_mapeada = sql_mapear(
        "area_origen", AREAS_EQUIVALENCIAS, "area_origen"
    )
    tipo_mapeado = sql_mapear(
        "tipo_merma_origen", TIPOS_MERMA_EQUIVALENCIAS, "tipo_merma_origen"
    )

    return f"""
    origen AS (
        SELECT
            *,
            row_number() OVER ()::BIGINT AS fila_origen
        FROM {origen}
        WHERE NOT (
            fecha_periodo IS NULL
            AND fecha_ocurrencia IS NULL
            AND anio IS NULL
            AND mes_numero IS NULL
            AND tienda IS NULL
            AND codigo_nissei IS NULL
            AND descripcion IS NULL
            AND cantidad IS NULL
            AND precio_unitario IS NULL
            AND total_merma IS NULL
        )
    ),
    tipado AS (
        SELECT
            fila_origen,
            {sql_fecha_excel('fecha_periodo')} AS fecha_periodo_origen,
            {sql_fecha_excel('fecha_ocurrencia')} AS fecha_ocurrencia,
            {sql_entero('anio')} AS anio_origen,
            {sql_entero('mes_numero')} AS mes_origen,
            {sql_limpiar_texto('tienda')} AS tienda_origen,
            {sql_limpiar_texto('area')} AS area_origen,
            {sql_limpiar_texto('tipo_merma')} AS tipo_merma_origen,
            {sql_limpiar_texto('detalle_ocurrencia')} AS detalle_ocurrencia,
            {sql_limpiar_identificador('codigo_nissei')} AS codigo_nissei,
            {sql_limpiar_texto('descripcion')} AS descripcion,
            {sql_numero('cantidad')} AS cantidad_numero,
            {sql_numero('precio_unitario')} AS precio_origen,
            {sql_numero('total_merma')} AS total_origen
        FROM origen
    ),
    calendario AS (
        SELECT
            *,
            COALESCE(
                anio_origen,
                date_part('year', fecha_periodo_origen)::INTEGER,
                date_part('year', fecha_ocurrencia)::INTEGER
            ) AS anio_calculado,
            COALESCE(
                mes_origen,
                date_part('month', fecha_periodo_origen)::INTEGER,
                date_part('month', fecha_ocurrencia)::INTEGER
            ) AS mes_calculado
        FROM tipado
    ),
    normalizado AS (
        SELECT
            fila_origen,
            COALESCE(
                fecha_periodo_origen,
                CASE
                    WHEN anio_calculado BETWEEN {ANIO_MINIMO} AND {ANIO_MAXIMO}
                         AND mes_calculado BETWEEN 1 AND 12
                    THEN make_date(anio_calculado, mes_calculado, 1)
                    ELSE NULL
                END
            ) AS fecha_periodo,
            fecha_ocurrencia,
            COALESCE({tienda_mapeada}, 'N/A') AS tienda,
            {area_mapeada} AS area,
            COALESCE({tipo_mapeado}, 'NO ESPECIFICADO') AS tipo_merma,
            detalle_ocurrencia,
            codigo_nissei,
            descripcion,
            CASE
                WHEN cantidad_numero IS NULL THEN NULL
                WHEN cantidad_numero = trunc(cantidad_numero)
                    THEN TRY_CAST(cantidad_numero AS BIGINT)
                ELSE NULL
            END AS cantidad,
            cantidad_numero,
            CASE
                WHEN precio_origen IS NOT NULL THEN precio_origen
                WHEN total_origen IS NOT NULL AND cantidad_numero > 0
                    THEN total_origen / cantidad_numero
                ELSE NULL
            END AS precio_unitario,
            CASE
                WHEN total_origen IS NOT NULL THEN total_origen
                WHEN cantidad_numero IS NOT NULL AND precio_origen IS NOT NULL
                    THEN cantidad_numero * precio_origen
                ELSE NULL
            END AS total_merma
        FROM calendario
    ),
    validos AS (
        SELECT *
        FROM normalizado
        WHERE fecha_periodo IS NOT NULL
          AND date_part('year', fecha_periodo)::INTEGER
              BETWEEN {ANIO_MINIMO} AND {ANIO_MAXIMO}
          AND tienda <> 'N/A'
          AND (
              codigo_nissei IS NOT NULL
              OR descripcion IS NOT NULL
              OR cantidad IS NOT NULL
              OR total_merma IS NOT NULL
          )
          AND (cantidad_numero IS NULL OR cantidad_numero >= 0)
          AND (precio_unitario IS NULL OR precio_unitario >= 0)
          AND (total_merma IS NULL OR total_merma >= 0)
    ),
    deduplicado AS (
        SELECT
            *,
            ROW_NUMBER() OVER (
                PARTITION BY
                    fecha_periodo,
                    fecha_ocurrencia,
                    tienda,
                    area,
                    tipo_merma,
                    detalle_ocurrencia,
                    codigo_nissei,
                    descripcion,
                    cantidad,
                    ROUND(precio_unitario, 4),
                    ROUND(total_merma, 4)
                ORDER BY fila_origen
            ) AS orden_duplicado
        FROM validos
    ),
    unicos AS (
        SELECT * EXCLUDE (orden_duplicado)
        FROM deduplicado
        WHERE orden_duplicado = 1
    ),
    conectado AS (
        SELECT
            *,
            {id_tienda_sql('tienda')} AS tienda_id,
            COALESCE(fecha_ocurrencia, fecha_periodo) AS fecha_analisis
        FROM unicos
    ),
    enriquecido AS (
        SELECT
            'M_' || upper(substr(sha256(concat_ws('|',
                CAST(fecha_periodo AS VARCHAR),
                COALESCE(CAST(fecha_ocurrencia AS VARCHAR), ''),
                tienda_id,
                COALESCE(area, ''),
                tipo_merma,
                COALESCE(detalle_ocurrencia, ''),
                COALESCE(codigo_nissei, ''),
                COALESCE(descripcion, ''),
                COALESCE(CAST(cantidad AS VARCHAR), ''),
                COALESCE(CAST(ROUND(precio_unitario, 4) AS VARCHAR), ''),
                COALESCE(CAST(ROUND(total_merma, 4) AS VARCHAR), '')
            )), 1, 16)) AS merma_id,
            CAST(strftime(fecha_analisis, '%Y%m%d') AS INTEGER) AS fecha_id,
            CAST(strftime(fecha_periodo, '%Y%m') AS INTEGER) AS periodo_id,
            fecha_analisis,
            fecha_periodo,
            fecha_ocurrencia,
            (fecha_ocurrencia IS NOT NULL) AS es_fecha_exacta,
            date_part('year', fecha_periodo)::INTEGER AS anio,
            date_part('month', fecha_periodo)::INTEGER AS mes_numero,
            {sql_nombre_mes("date_part('month', fecha_periodo)::INTEGER")} AS mes_nombre,
            date_part('quarter', fecha_periodo)::INTEGER AS trimestre,
            date_part('week', fecha_analisis)::INTEGER AS semana,
            date_part('isodow', fecha_analisis)::INTEGER AS dia_semana_numero,
            {sql_nombre_dia("date_part('isodow', fecha_analisis)::INTEGER")} AS dia_semana_nombre,
            tienda_id,
            tienda,
            area,
            tipo_merma,
            detalle_ocurrencia,
            codigo_nissei,
            descripcion,
            cantidad,
            TRY_CAST(ROUND(precio_unitario, 2) AS DECIMAL(18, 2)) AS precio_unitario,
            TRY_CAST(ROUND(total_merma, 2) AS DECIMAL(18, 2)) AS total_merma,
            'PEN'::VARCHAR AS moneda,
            (total_merma IS NOT NULL) AS es_valorizada,
            fila_origen
        FROM conectado
    )
    """


def construir_select_final(archivo: Path, hoja: str) -> str:
    return f"""
    WITH {construir_ctes(archivo, hoja)}
    SELECT
        merma_id,
        fecha_id,
        periodo_id,
        fecha_analisis,
        fecha_periodo,
        fecha_ocurrencia,
        es_fecha_exacta,
        anio,
        mes_numero,
        mes_nombre,
        trimestre,
        semana,
        dia_semana_numero,
        dia_semana_nombre,
        tienda_id,
        tienda,
        area,
        tipo_merma,
        detalle_ocurrencia,
        codigo_nissei,
        descripcion,
        cantidad,
        precio_unitario,
        total_merma,
        moneda,
        es_valorizada
    FROM enriquecido
    ORDER BY fecha_periodo, fecha_analisis, tienda_id, merma_id
    """


# ==========================================================
# 6. VERIFICACIÓN DE CAPA 1
# ==========================================================


def verificar_capa1() -> dict[str, int]:
    archivo = buscar_archivo_capa1()
    hoja = buscar_hoja_capa1(archivo)
    conexion = crear_conexion(cargar_excel=True)
    try:
        columnas = obtener_columnas(conexion, archivo, hoja)
        if columnas != COLUMNAS_CAPA1:
            faltan = [c for c in COLUMNAS_CAPA1 if c not in columnas]
            sobran = [c for c in columnas if c not in COLUMNAS_CAPA1]
            raise RuntimeError(
                "El esquema del Excel de merma no coincide.\n"
                f"Esperado: {COLUMNAS_CAPA1}\n"
                f"Obtenido: {columnas}\n"
                f"Faltan: {faltan}\nSobran: {sobran}\n"
                "No cambies los encabezados ni agregues columnas a la hoja principal."
            )

        origen = consulta_excel(archivo, hoja)
        total_origen = conexion.execute(
            f"""
            SELECT COUNT(*)
            FROM {origen}
            WHERE NOT (
                fecha_periodo IS NULL
                AND fecha_ocurrencia IS NULL
                AND anio IS NULL
                AND mes_numero IS NULL
                AND tienda IS NULL
                AND codigo_nissei IS NULL
                AND descripcion IS NULL
                AND cantidad IS NULL
                AND precio_unitario IS NULL
                AND total_merma IS NULL
            )
            """
        ).fetchone()[0]
        if total_origen == 0:
            raise RuntimeError("El Excel de Capa 1 no contiene registros.")

        resumen = conexion.execute(
            f"""
            WITH {construir_ctes(archivo, hoja)}
            SELECT
                (SELECT COUNT(*) FROM tipado) AS filas_origen,
                (SELECT COUNT(*) FROM validos) AS filas_validas,
                (SELECT COUNT(*) FROM unicos) AS filas_unicas,
                (SELECT COUNT(*) FROM tipado
                 WHERE fecha_periodo_origen IS NULL
                   AND (anio_origen IS NULL OR mes_origen IS NULL)) AS sin_periodo,
                (SELECT COUNT(*) FROM calendario
                 WHERE anio_calculado IS NOT NULL
                   AND anio_calculado NOT BETWEEN {ANIO_MINIMO} AND {ANIO_MAXIMO}) AS fuera_rango,
                (SELECT COUNT(*) FROM tipado
                 WHERE tienda_origen IS NULL) AS tiendas_vacias,
                (SELECT COUNT(*) FROM tipado
                 WHERE cantidad_numero IS NOT NULL
                   AND cantidad_numero <> trunc(cantidad_numero)) AS cantidades_decimales,
                (SELECT COUNT(*) FROM normalizado
                 WHERE cantidad_numero < 0
                    OR precio_unitario < 0
                    OR total_merma < 0) AS valores_negativos,
                (SELECT COUNT(*) FROM deduplicado
                 WHERE orden_duplicado > 1) AS duplicados_exactos,
                (SELECT COUNT(DISTINCT tienda) FROM unicos) AS tiendas,
                (SELECT COALESCE(SUM(cantidad), 0) FROM unicos) AS cantidad_total,
                (SELECT COALESCE(SUM(total_merma), 0) FROM unicos) AS importe_total
            """
        ).fetchone()

        resultado = {
            "filas_origen": int(resumen[0] or 0),
            "filas_validas": int(resumen[1] or 0),
            "filas_unicas": int(resumen[2] or 0),
            "sin_periodo": int(resumen[3] or 0),
            "fuera_rango": int(resumen[4] or 0),
            "tiendas_vacias": int(resumen[5] or 0),
            "cantidades_decimales": int(resumen[6] or 0),
            "valores_negativos": int(resumen[7] or 0),
            "duplicados_exactos": int(resumen[8] or 0),
            "tiendas": int(resumen[9] or 0),
            "cantidad_total": int(resumen[10] or 0),
            "importe_total": float(resumen[11] or 0),
        }

        print("\n" + "=" * 72)
        print("VERIFICACIÓN DE MERMA - CAPA 1")
        print("=" * 72)
        print(f"Archivo                       : {archivo}")
        print(f"Hoja                          : {hoja}")
        print(f"Registros de origen           : {resultado['filas_origen']:,}")
        print(f"Registros válidos             : {resultado['filas_validas']:,}")
        print(f"Registros únicos              : {resultado['filas_unicas']:,}")
        print(f"Tiendas                       : {resultado['tiendas']:,}")
        print(f"Cantidad total                : {resultado['cantidad_total']:,}")
        print(f"Importe total                 : S/ {resultado['importe_total']:,.2f}")
        print(f"Duplicados exactos a eliminar : {resultado['duplicados_exactos']:,}")
        print(f"Filas sin periodo utilizable  : {resultado['sin_periodo']:,}")
        print(f"Filas fuera del rango permitido      : {resultado['fuera_rango']:,}")
        print(f"Filas sin tienda              : {resultado['tiendas_vacias']:,}")
        print(f"Cantidades no enteras         : {resultado['cantidades_decimales']:,}")
        print(f"Valores negativos             : {resultado['valores_negativos']:,}")
        print("=" * 72)

        # Los vacíos opcionales no detienen la pipeline. Estos errores sí implican
        # que el registro no puede conectarse o contiene un valor imposible.
        errores_graves = (
            resultado["cantidades_decimales"]
            + resultado["valores_negativos"]
        )
        if resultado["filas_unicas"] == 0:
            raise RuntimeError(
                "No quedó ningún registro válido para publicar en Capa 2."
            )
        if errores_graves:
            raise RuntimeError(
                "La Capa 1 contiene cantidades decimales o valores negativos. "
                "Corrige esos registros antes de generar el Parquet."
            )

        if resultado["sin_periodo"] or resultado["fuera_rango"] or resultado["tiendas_vacias"]:
            print(
                "\nADVERTENCIA: las filas sin periodo, fuera del rango permitido o sin "
                "tienda no se publicarán. Los demás campos vacíos se conservan como NULL."
            )

        return resultado
    finally:
        cerrar_duckdb_seguro(conexion)


# ==========================================================
# 7. GENERACIÓN Y VALIDACIÓN DE CAPA 2
# ==========================================================


def crear_capa2() -> None:
    archivo = buscar_archivo_capa1()
    hoja = buscar_hoja_capa1(archivo)
    verificar_capa1()
    preparar_carpetas()
    CAPA2_TEMP.unlink(missing_ok=True)

    conexion = crear_conexion(cargar_excel=True)
    try:
        copiar_sql = f"""
        COPY (
            {construir_select_final(archivo, hoja)}
        )
        TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
        """
        print("\nGenerando FactMerma.parquet...")
        conexion.execute(copiar_sql)
    except Exception:
        CAPA2_TEMP.unlink(missing_ok=True)
        raise
    finally:
        cerrar_duckdb_seguro(conexion)

    verificar_capa2(CAPA2_TEMP)
    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    print(f"\nResultado publicado: {CAPA2_FINAL}")


def validar_con_dim_tiendas(
    conexion: duckdb.DuckDBPyConnection, origen_parquet: str
) -> None:
    if not DIM_TIENDAS.exists() or DIM_TIENDAS.stat().st_size == 0:
        print(
            "\nAviso: DimTiendas.parquet todavía no existe. "
            "Fact_Merma se publicará con IDs estables y podrá relacionarse cuando "
            "generes la dimensión."
        )
        return

    dim = f"read_parquet({sql_texto(DIM_TIENDAS.as_posix())})"
    columnas_dim = [
        fila[0]
        for fila in conexion.execute(f"DESCRIBE SELECT * FROM {dim}").fetchall()
    ]
    faltan = sorted({"tienda_id", "tienda"} - set(columnas_dim))
    if faltan:
        print(
            "\nAdvertencia: DimTiendas.parquet no contiene: " + ", ".join(faltan)
        )
        return

    faltantes = conexion.execute(
        f"""
        SELECT DISTINCT f.tienda_id, f.tienda
        FROM {origen_parquet} AS f
        LEFT JOIN {dim} AS d
          ON f.tienda_id = d.tienda_id
         AND f.tienda = d.tienda
        WHERE d.tienda_id IS NULL
        ORDER BY f.tienda
        """
    ).fetchall()
    if faltantes:
        print("\nADVERTENCIA: tiendas de merma sin coincidencia exacta en Dim_Tiendas:")
        for tienda_id, tienda in faltantes:
            print(f"  - {tienda_id} | {tienda}")
    else:
        print("Relación con Dim_Tiendas: correcta.")


def verificar_capa2(archivo: Path | None = None) -> dict[str, int]:
    objetivo = archivo or CAPA2_FINAL
    if not objetivo.exists() or objetivo.stat().st_size == 0:
        raise FileNotFoundError(f"No existe un Parquet válido en: {objetivo}")

    conexion = crear_conexion(cargar_excel=False)
    try:
        origen = f"read_parquet({sql_texto(objetivo.as_posix())})"
        columnas = [
            fila[0]
            for fila in conexion.execute(
                f"DESCRIBE SELECT * FROM {origen}"
            ).fetchall()
        ]
        if columnas != COLUMNAS_CAPA2:
            raise RuntimeError(
                "El esquema de Capa 2 no coincide.\n"
                f"Esperado: {COLUMNAS_CAPA2}\nObtenido: {columnas}"
            )

        resumen = conexion.execute(
            f"""
            SELECT
                COUNT(*) AS filas,
                COUNT(DISTINCT merma_id) AS ids,
                COUNT(DISTINCT tienda_id) AS tiendas,
                COALESCE(SUM(cantidad), 0) AS cantidad_total,
                COALESCE(SUM(total_merma), 0) AS importe_total,
                SUM(CASE WHEN fecha_id IS NULL OR periodo_id IS NULL
                         THEN 1 ELSE 0 END) AS fechas_invalidas,
                SUM(CASE WHEN anio NOT BETWEEN {ANIO_MINIMO} AND {ANIO_MAXIMO}
                         THEN 1 ELSE 0 END) AS anios_invalidos,
                SUM(CASE WHEN tienda_id IS NULL OR tienda IS NULL
                         THEN 1 ELSE 0 END) AS tiendas_invalidas,
                SUM(CASE WHEN cantidad < 0 OR precio_unitario < 0 OR total_merma < 0
                         THEN 1 ELSE 0 END) AS importes_invalidos,
                SUM(CASE WHEN moneda <> 'PEN' THEN 1 ELSE 0 END) AS monedas_invalidas
            FROM {origen}
            """
        ).fetchone()

        duplicados = conexion.execute(
            f"""
            SELECT COUNT(*)
            FROM (
                SELECT merma_id, COUNT(*) AS repeticiones
                FROM {origen}
                GROUP BY merma_id
                HAVING COUNT(*) > 1
            )
            """
        ).fetchone()[0]

        resultado = {
            "filas": int(resumen[0] or 0),
            "ids": int(resumen[1] or 0),
            "tiendas": int(resumen[2] or 0),
            "cantidad_total": int(resumen[3] or 0),
            "importe_total": float(resumen[4] or 0),
            "fechas_invalidas": int(resumen[5] or 0),
            "anios_invalidos": int(resumen[6] or 0),
            "tiendas_invalidas": int(resumen[7] or 0),
            "importes_invalidos": int(resumen[8] or 0),
            "monedas_invalidas": int(resumen[9] or 0),
            "ids_duplicados": int(duplicados or 0),
        }

        errores = sum(
            resultado[clave]
            for clave in (
                "fechas_invalidas",
                "anios_invalidos",
                "tiendas_invalidas",
                "importes_invalidos",
                "monedas_invalidas",
                "ids_duplicados",
            )
        )
        if (
            resultado["filas"] == 0
            or resultado["filas"] != resultado["ids"]
            or errores
        ):
            raise RuntimeError(f"La validación de Capa 2 falló: {resultado}")

        print("\n" + "=" * 72)
        print("FACT_MERMA VERIFICADA CORRECTAMENTE")
        print("=" * 72)
        print(f"Parquet          : {objetivo}")
        print(f"Registros        : {resultado['filas']:,}")
        print(f"Tiendas          : {resultado['tiendas']:,}")
        print(f"Cantidad total   : {resultado['cantidad_total']:,}")
        print(f"Importe total    : S/ {resultado['importe_total']:,.2f}")
        print(f"IDs duplicados   : {resultado['ids_duplicados']:,}")
        print("=" * 72)

        validar_con_dim_tiendas(conexion, origen)
        return resultado
    finally:
        cerrar_duckdb_seguro(conexion)


# ==========================================================
# 8. EJECUCIÓN
# ==========================================================


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Pipeline de Merma: Excel manual de Capa 1 -> "
            "FactMerma.parquet de Capa 2."
        )
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument(
        "--verificar-capa1",
        action="store_true",
        help="Valida el Excel manual sin generar el Parquet.",
    )
    grupo.add_argument(
        "--solo-capa2",
        action="store_true",
        help="Genera FactMerma.parquet.",
    )
    grupo.add_argument(
        "--verificar-capa2",
        action="store_true",
        help="Valida FactMerma.parquet.",
    )
    return parser


def main() -> int:
    args = crear_parser().parse_args()
    preparar_carpetas()
    try:
        if args.verificar_capa1:
            verificar_capa1()
        elif args.verificar_capa2:
            verificar_capa2()
        else:
            crear_capa2()
        return 0
    except KeyboardInterrupt:
        print("\nProceso cancelado por el usuario.", file=sys.stderr)
        CAPA2_TEMP.unlink(missing_ok=True)
        return 130
    except Exception as exc:
        print("\n" + "=" * 72, file=sys.stderr)
        print("ERROR EN LA PIPELINE DE MERMA", file=sys.stderr)
        print("=" * 72, file=sys.stderr)
        print(str(exc), file=sys.stderr)
        CAPA2_TEMP.unlink(missing_ok=True)
        return 1


# La homologación final usa el maestro único del proyecto. Se conservan
# equivalencias locales antiguas, pero nunca se pierden alias nuevos del maestro.
TIENDAS_EQUIVALENCIAS = {**TIENDAS_EQUIVALENCIAS_MAESTRAS, **TIENDAS_EQUIVALENCIAS}
TIENDA_IDS = dict(TIENDA_IDS_MAESTRAS)

if __name__ == "__main__":
    finalizar_proceso(main())
