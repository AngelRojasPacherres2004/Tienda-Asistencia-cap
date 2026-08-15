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
)
from typing import Any

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta instalar DuckDB. Activa el entorno virtual y ejecuta: "
        "python -m pip install -r requirements.txt"
    ) from exc


from project_paths import PROJECT_ROOT, WORK_INTERMEDIATE_DIR, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"
CAPA2_FINAL = WORK_INTERMEDIATE_DIR / "FactGuiasTransitoLimpio.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactGuiasTransitoLimpio_temporal.parquet"
HOJAS_PERMITIDAS = ("GUIAS_EN_TRANSITO_C1", "GUIAS_EN_TRANSITO")

COLUMNAS_CAPA1 = [
    "fecha_hora_transferencia",
    "estado_transferencia",
    "nro_guia",
    "tienda_origen",
    "tienda_destino",
    "codigo_nissei",
    "proveedor",
    "lote",
    "departamento_codigo",
    "rubro",
    "linea",
    "sub_linea",
    "marca",
    "modelo",
    "descripcion",
    "modelo_codigo",
    "cantidad",
    "precio_sugerido",
    "total_transferencia",
    "fecha_hora_creacion",
]

COLUMNAS_CAPA2 = [
    "fecha_hora_transferencia",
    "fecha_transferencia",
    "hora_transferencia",
    "dia_transferencia",
    "mes_numero_transferencia",
    "mes_nombre_transferencia",
    "trimestre_transferencia",
    "anio_transferencia",
    "semana_transferencia",
    "dia_semana_numero",
    "dia_semana_nombre",
    "estado_transferencia",
    "nro_guia",
    "tienda_origen",
    "tienda_destino",
    "codigo_nissei",
    "proveedor",
    "lote",
    "departamento_codigo",
    "rubro",
    "linea",
    "sub_linea",
    "marca",
    "modelo",
    "descripcion",
    "modelo_codigo",
    "cantidad",
    "precio_sugerido",
    "total_transferencia",
    "fecha_hora_creacion",
    "fecha_creacion",
]

TOKENS_NULOS = {"", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A", "X.ERROR"}

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
    "JR UNION": "JR UNIÓN",
    "JR UNIÓN": "JR UNIÓN",
    "TRUJILLO": "TRUJILLO",
}

ESTADOS_EQUIVALENCIAS = {
    "EN TRANSITO": "EN TRÁNSITO",
    "EN TRÁNSITO": "EN TRÁNSITO",
    "NO COMPLETO": "INCOMPLETO",
    "INCOMPLETO": "INCOMPLETO",
    "RECIBIDO": "RECIBIDO",
}

PROVEEDORES_EQUIVALENCIAS = {
    "CHILIA": "INVERSIONES CHILIA S.A.",
    "CHILIA S.A.": "INVERSIONES CHILIA S.A.",
    "INVERSIONES CHILIA S.A.": "INVERSIONES CHILIA S.A.",
    "INVERSIONIES CHILIA": "INVERSIONES CHILIA S.A.",
    "OROTEX NORTH AMERICA INC": "OROTEX NORTH AMERICA INC.",
    "OROTEX NORTH AMERICA INC.": "OROTEX NORTH AMERICA INC.",
    "ILAHI": "ILAHUI",
    "ILAHUI": "ILAHUI",
    "CORPORACION CARDINALE S.R.L.": "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACIÓN CARDENALES S.R.L.": "CORPORACIÓN CARDENALES S.R.L.",
    "DISTRIBUIDO DEPORTIVA PUMA S.A.C.": "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.": "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "MILAN INTERNATIONAL E.I.R.L": "MILAN INTERNATIONAL E.I.R.L.",
    "MILAN INTERNATIONAL E.I.R.L.": "MILAN INTERNATIONAL E.I.R.L.",
    "LG ELECTRONICS PERU S.A.": "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERÚ S.A": "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERÚ S.A.": "LG ELECTRONICS PERÚ S.A.",
    "TRIATHLON S.A.C": "TRIATHLON S.A.C.",
    "TRIATHLON S.A.C.": "TRIATHLON S.A.C.",
    "LA POSITIVASEGUROS Y REASEGUROS SA": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVA SEGUROS Y REASEGUROS SA": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVA SEGUROS Y REASEGUROS S.A.": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "FABRICA YLIS E.I.R.L.": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "ULTRA BRANDS S.A.C": "ULTRA BRANDS S.A.C.",
    "ULTRA BRANDS S.A.C.": "ULTRA BRANDS S.A.C.",
    "INTERSPORT S.A.C.": "INTER SPORT S.A.C.",
    "INTER SPORT S.A.C.": "INTER SPORT S.A.C.",
    "MARCIMEX S.A": "MARCIMEX S.A.",
    "MARCIMEX S.A.": "MARCIMEX S.A.",
}

MARCAS_EQUIVALENCIAS = {
    "HI-TEC": "HI-TEC",
    "HITECH": "HI-TEC",
    "AIR WALK": "AIRWALK",
    "AIRWALK": "AIRWALK",
    "RALPH LAUREN": "RALPH LAUREN",
    "POLO RALPH LAUREN": "RALPH LAUREN",
    "BOSS": "HUGO BOSS",
    "HUGO BOSS": "HUGO BOSS",
    "APOLO": "APOLO",
    "MIA BY APOLO": "APOLO",
    "APOLITO": "APOLO",
    "LA COSTE": "LACOSTE",
    "LACOSTE": "LACOSTE",
}

LINEAS_EQUIVALENCIAS = {
    "MALETA/MOCHILA/CANGURO/MALETIN": "MALETA/MOCHILA/CANGURO/MALETÍN",
    "ELECTRODOMESTICOS": "ELECTRODOMÉSTICOS",
    "DECORACION": "DECORACIÓN",
    "PROTECCION": "PROTECCIÓN",
    "JOYERIA Y BISUTERIA": "JOYERÍA Y BISUTERÍA",
    "FILMACION & FOTOGRAFIA": "FILMACIÓN Y FOTOGRAFÍA",
    "CLIMATIZACION": "CLIMATIZACIÓN",
    "ILUMINACION": "ILUMINACIÓN",
    "ACCESORIO DE COMPUTO": "ACCESORIOS DE CÓMPUTO",
    "IPADS &TABLETS": "IPADS Y TABLETS",
    "LAPTOP'S": "LAPTOPS",
    "PC´S": "PCS",
    "COCCION": "COCCIÓN",
    "FRIO": "FRÍO",
}

SUBLINEAS_EQUIVALENCIAS = {
    "COMPLEMENTO": "COMPLEMENTOS",
    "COMPLEMENTOS": "COMPLEMENTOS",
    "LONCHERA": "LONCHERAS",
    "LONCHERAS": "LONCHERAS",
    "PELUCHE": "PELUCHES",
    "PELUCHES": "PELUCHES",
    "CORTINA": "CORTINAS",
    "CORTINAS": "CORTINAS",
    "SACACORCHO SET DE": "SET DE SACACORCHO",
    "SET DE SACACORCHO": "SET DE SACACORCHO",
    "COJIN": "COJÍN",
    "COJÍN": "COJÍN",
    "AQUA SHOES": "AQUASHOES",
    "AQUASHOES": "AQUASHOES",
}

DEPARTAMENTO_RUBRO = {
    "1": "TEXTIL", "2": "CALZADO", "3": "MOCHILA/MALETA/MALETÍN/CARTERA",
    "4": "DEPORTE", "5": "RECREACIÓN", "6": "HOGAR", "7": "CAMPING",
    "8": "PRODUCTOS VARIOS", "9": "JUGUETES", "10": "TEMPORADA",
    "11": "BAÑO Y LAVANDERÍA", "12": "AUDIO Y VIDEO", "13": "ELECTRO MENOR",
    "14": "CÓMPUTO", "15": "LÍNEA BLANCA", "16": "MUEBLE",
    "17": "FERRETERÍA", "18": "ALIMENTOS Y BEBIDAS", "19": "VARIOS",
    "20": "SERVICIOS", "21": "JOYAS", "22": "ACCESORIOS DE DEPORTE",
    "23": "TECNOLOGÍA", "24": "AUTOMOTRIZ", "25": "BELLEZA", "26": "JOYERÍA",
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


def sql_limpiar_texto(expresion: str, mayusculas: bool = True) -> str:
    texto = f"CAST({expresion} AS VARCHAR)"
    texto = f"replace({texto}, {sql_texto(chr(160))}, ' ')"
    texto = f"replace({texto}, {sql_texto(chr(8203))}, '')"
    texto = f"replace(replace({texto}, chr(13), ' '), chr(10), ' ')"
    texto = f"NULLIF(regexp_replace(trim({texto}), '\\s+', ' ', 'g'), '')"
    lista = ", ".join(sql_texto(x) for x in sorted(TOKENS_NULOS))
    base = f"CASE WHEN upper(COALESCE({texto}, '')) IN ({lista}) THEN NULL ELSE {texto} END"
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
    limpio = f"regexp_replace({raw}, '[^0-9,\\.\\-\\(\\)]', '', 'g')"
    sin_parentesis = f"replace(replace({limpio}, '(', ''), ')', '')"
    firmado = f"CASE WHEN {limpio} LIKE '(%' AND {limpio} LIKE '%)' THEN '-' || {sin_parentesis} ELSE {sin_parentesis} END"
    return f"""
    CASE
        WHEN {raw} IS NULL OR upper({raw}) IN ('', 'N/A', 'NA', 'NULL', 'NONE', '-', '--', '#N/A', 'X.ERROR') THEN NULL
        WHEN regexp_full_match({firmado}, '^-?[0-9]{{1,3}}(\\.[0-9]{{3}})+,[0-9]+$')
            THEN TRY_CAST(replace(replace({firmado}, '.', ''), ',', '.') AS DOUBLE)
        WHEN regexp_full_match({firmado}, '^-?[0-9]{{1,3}}(,[0-9]{{3}})+\\.[0-9]+$')
            THEN TRY_CAST(replace({firmado}, ',', '') AS DOUBLE)
        WHEN regexp_full_match({firmado}, '^-?[0-9]+,[0-9]+$')
            THEN TRY_CAST(replace({firmado}, ',', '.') AS DOUBLE)
        ELSE TRY_CAST(replace({firmado}, ',', '') AS DOUBLE)
    END
    """


def sql_fecha_excel(expresion: str) -> str:
    raw = f"NULLIF(trim(CAST({expresion} AS VARCHAR)), '')"
    numero = f"TRY_CAST(replace({raw}, ',', '.') AS DOUBLE)"
    return f"""
    CASE
        WHEN {raw} IS NULL OR upper({raw}) IN ('N/A','NA','NULL','NONE','-','--','#N/A') THEN NULL
        WHEN regexp_full_match({raw}, '^[0-9]+([.,][0-9]+)?$') AND {numero} BETWEEN 1 AND 100000
            THEN TIMESTAMP '1899-12-30' + ({numero} * INTERVAL '1 day')
        ELSE COALESCE(
            TRY_CAST({raw} AS TIMESTAMP),
            try_strptime({raw}, '%d/%m/%Y %H:%M:%S'),
            try_strptime({raw}, '%d/%m/%Y %H:%M'),
            try_strptime({raw}, '%d/%m/%Y'),
            try_strptime({raw}, '%Y-%m-%d %H:%M:%S'),
            try_strptime({raw}, '%Y-%m-%d')
        )
    END
    """


def sql_rubro_departamento(expr: str, fallback: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_texto(k)} THEN {sql_texto(v)}"
        for k, v in sorted(DEPARTAMENTO_RUBRO.items(), key=lambda x: int(x[0]))
    )
    return f"CASE CAST({expr} AS VARCHAR)\n{casos}\nELSE {fallback}\nEND"


def buscar_archivo_capa1() -> Path:
    preparar_carpetas()
    preferido = CAPA1_DIR / "GUIAS_EN_TRANSITO.xlsx"
    if preferido.exists():
        return preferido
    candidatos = sorted(
        p for p in CAPA1_DIR.glob("*.xlsx")
        if not p.name.startswith("~$")
        and "GUIAS" in normalizar_clave_python(p.stem)
        and "TRANSITO" in normalizar_clave_python(p.stem)
    )
    if len(candidatos) == 1:
        return candidatos[0]
    if not candidatos:
        raise FileNotFoundError(f"No se encontró GUIAS_EN_TRANSITO.xlsx dentro de {CAPA1_DIR}.")
    raise RuntimeError("Hay varios Excel de guías en tránsito en capa1. Conserva solamente el vigente.")


def nombres_hojas(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        contenedor = wb.find(f"{{{NS_MAIN}}}sheets")
        return [] if contenedor is None else [s.attrib["name"] for s in contenedor]


def encontrar_hoja(archivo: Path) -> str:
    hojas = nombres_hojas(archivo)
    for nombre in HOJAS_PERMITIDAS:
        if nombre in hojas:
            return nombre
    raise RuntimeError(f"No se encontró la hoja de guías. Permitidas: {HOJAS_PERMITIDAS}; encontradas: {hojas}")


def crear_conexion(cargar_excel: bool) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def consulta_excel(archivo: Path, hoja: str) -> str:
    return origen_xlsx_csv(archivo, hoja)


def obtener_columnas(con: duckdb.DuckDBPyConnection, archivo: Path, hoja: str) -> list[str]:
    return [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {consulta_excel(archivo, hoja)}").fetchall()]


def construir_sql_capa2(archivo: Path, hoja: str) -> str:
    origen = consulta_excel(archivo, hoja)
    tienda_o = sql_mapear("tienda_origen_raw", TIENDAS_EQUIVALENCIAS, "tienda_origen_raw")
    tienda_d = sql_mapear("tienda_destino_raw", TIENDAS_EQUIVALENCIAS, "tienda_destino_raw")
    estado = sql_mapear("estado_raw", ESTADOS_EQUIVALENCIAS, "estado_raw")
    proveedor = sql_mapear("proveedor_raw", PROVEEDORES_EQUIVALENCIAS, "proveedor_raw")
    marca = sql_mapear("marca_raw", MARCAS_EQUIVALENCIAS, "marca_raw")
    linea = sql_mapear("linea_raw", LINEAS_EQUIVALENCIAS, "linea_raw")
    sublinea = sql_mapear("sub_linea_raw", SUBLINEAS_EQUIVALENCIAS, "sub_linea_raw")

    return f"""
    WITH raw AS (
        SELECT
            row_number() OVER () AS fila_origen,
            {sql_fecha_excel('"fecha_hora_transferencia"')} AS fecha_hora_transferencia,
            {sql_limpiar_texto('"estado_transferencia"')} AS estado_raw,
            {sql_limpiar_texto('"nro_guia"')} AS nro_guia,
            {sql_limpiar_texto('"tienda_origen"')} AS tienda_origen_raw,
            {sql_limpiar_texto('"tienda_destino"')} AS tienda_destino_raw,
            {sql_limpiar_texto('"codigo_nissei"')} AS codigo_nissei,
            {sql_limpiar_texto('"proveedor"')} AS proveedor_raw,
            {sql_limpiar_texto('"lote"')} AS lote,
            TRY_CAST(({sql_numero('"departamento_codigo"')}) AS INTEGER) AS departamento_codigo,
            {sql_limpiar_texto('"rubro"')} AS rubro_raw,
            {sql_limpiar_texto('"linea"')} AS linea_raw,
            {sql_limpiar_texto('"sub_linea"')} AS sub_linea_raw,
            {sql_limpiar_texto('"marca"')} AS marca_raw,
            {sql_limpiar_texto('"modelo"')} AS modelo,
            {sql_limpiar_texto('"descripcion"')} AS descripcion,
            {sql_limpiar_texto('"modelo_codigo"')} AS modelo_codigo,
            TRY_CAST(({sql_numero('"cantidad"')}) AS INTEGER) AS cantidad,
            TRY_CAST(({sql_numero('"precio_sugerido"')}) AS DECIMAL(20,4)) AS precio_sugerido,
            TRY_CAST(({sql_numero('"total_transferencia"')}) AS DECIMAL(20,4)) AS total_origen,
            {sql_fecha_excel('"fecha_hora_creacion"')} AS fecha_hora_creacion
        FROM {origen}
        WHERE NOT (
            "fecha_hora_transferencia" IS NULL AND "estado_transferencia" IS NULL
            AND "nro_guia" IS NULL AND "tienda_origen" IS NULL
            AND "tienda_destino" IS NULL AND "codigo_nissei" IS NULL
            AND "cantidad" IS NULL AND "precio_sugerido" IS NULL
        )
    ), normalizado AS (
        SELECT
            fila_origen,
            fecha_hora_transferencia,
            {estado} AS estado_transferencia,
            nro_guia,
            {tienda_o} AS tienda_origen,
            {tienda_d} AS tienda_destino,
            codigo_nissei,
            {proveedor} AS proveedor,
            lote,
            departamento_codigo,
            {sql_rubro_departamento('departamento_codigo', 'rubro_raw')} AS rubro,
            {linea} AS linea,
            {sublinea} AS sub_linea,
            {marca} AS marca,
            modelo,
            descripcion,
            modelo_codigo,
            cantidad,
            precio_sugerido,
            CASE
                WHEN cantidad IS NOT NULL AND precio_sugerido IS NOT NULL
                    THEN CAST(ROUND(cantidad * precio_sugerido, 4) AS DECIMAL(20,4))
                ELSE total_origen
            END AS total_transferencia,
            fecha_hora_creacion
        FROM raw
        WHERE CAST(fecha_hora_transferencia AS DATE) >= make_date({ANIO_INICIO_MODELO}, 1, 1)
    ), enriquecido AS (
        SELECT
            fecha_hora_transferencia,
            CAST(fecha_hora_transferencia AS DATE) AS fecha_transferencia,
            CAST(fecha_hora_transferencia AS TIME) AS hora_transferencia,
            date_part('day', fecha_hora_transferencia)::INTEGER AS dia_transferencia,
            date_part('month', fecha_hora_transferencia)::INTEGER AS mes_numero_transferencia,
            CASE date_part('month', fecha_hora_transferencia)::INTEGER
                WHEN 1 THEN 'ENERO' WHEN 2 THEN 'FEBRERO' WHEN 3 THEN 'MARZO'
                WHEN 4 THEN 'ABRIL' WHEN 5 THEN 'MAYO' WHEN 6 THEN 'JUNIO'
                WHEN 7 THEN 'JULIO' WHEN 8 THEN 'AGOSTO' WHEN 9 THEN 'SEPTIEMBRE'
                WHEN 10 THEN 'OCTUBRE' WHEN 11 THEN 'NOVIEMBRE' WHEN 12 THEN 'DICIEMBRE'
                ELSE NULL
            END AS mes_nombre_transferencia,
            date_part('quarter', fecha_hora_transferencia)::INTEGER AS trimestre_transferencia,
            date_part('year', fecha_hora_transferencia)::INTEGER AS anio_transferencia,
            date_part('week', fecha_hora_transferencia)::INTEGER AS semana_transferencia,
            date_part('isodow', fecha_hora_transferencia)::INTEGER AS dia_semana_numero,
            CASE date_part('isodow', fecha_hora_transferencia)::INTEGER
                WHEN 1 THEN 'LUNES' WHEN 2 THEN 'MARTES' WHEN 3 THEN 'MIÉRCOLES'
                WHEN 4 THEN 'JUEVES' WHEN 5 THEN 'VIERNES' WHEN 6 THEN 'SÁBADO'
                WHEN 7 THEN 'DOMINGO' ELSE NULL
            END AS dia_semana_nombre,
            estado_transferencia,
            nro_guia,
            tienda_origen,
            tienda_destino,
            codigo_nissei,
            proveedor,
            lote,
            departamento_codigo,
            rubro,
            linea,
            sub_linea,
            marca,
            modelo,
            descripcion,
            modelo_codigo,
            cantidad,
            precio_sugerido,
            total_transferencia,
            fecha_hora_creacion,
            CAST(fecha_hora_creacion AS DATE) AS fecha_creacion,
            fila_origen
        FROM normalizado
    ), deduplicado AS (
        SELECT * EXCLUDE (fila_origen, orden_duplicado)
        FROM (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY
                    fecha_hora_transferencia, estado_transferencia, nro_guia,
                    tienda_origen, tienda_destino, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo, descripcion, modelo_codigo, cantidad,
                    precio_sugerido, total_transferencia, fecha_hora_creacion
                ORDER BY fila_origen
            ) AS orden_duplicado
            FROM enriquecido
        )
        WHERE orden_duplicado = 1
    )
    SELECT
        fecha_hora_transferencia,
        fecha_transferencia,
        hora_transferencia,
        dia_transferencia,
        mes_numero_transferencia,
        mes_nombre_transferencia,
        trimestre_transferencia,
        anio_transferencia,
        semana_transferencia,
        dia_semana_numero,
        dia_semana_nombre,
        estado_transferencia,
        nro_guia,
        tienda_origen,
        tienda_destino,
        codigo_nissei,
        proveedor,
        lote,
        departamento_codigo,
        rubro,
        linea,
        sub_linea,
        marca,
        modelo,
        descripcion,
        modelo_codigo,
        cantidad,
        precio_sugerido,
        total_transferencia,
        CASE
            WHEN fecha_creacion >= make_date({ANIO_INICIO_MODELO}, 1, 1)
                THEN fecha_hora_creacion
            ELSE NULL
        END AS fecha_hora_creacion,
        CASE
            WHEN fecha_creacion >= make_date({ANIO_INICIO_MODELO}, 1, 1)
                THEN fecha_creacion
            ELSE NULL
        END AS fecha_creacion
    FROM deduplicado
    """


def verificar_capa1(con: duckdb.DuckDBPyConnection, archivo: Path, hoja: str) -> dict[str, int]:
    columnas = obtener_columnas(con, archivo, hoja)
    faltan = [c for c in COLUMNAS_CAPA1 if c not in columnas]
    if faltan:
        raise RuntimeError(f"El Excel de guías no contiene las columnas requeridas. Faltan: {faltan}")

    sql = construir_sql_capa2(archivo, hoja)
    resumen = con.execute(
        f"""
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE fecha_hora_transferencia IS NULL),
            COUNT(*) FILTER (WHERE tienda_origen IS NULL),
            COUNT(*) FILTER (WHERE tienda_destino IS NULL),
            COUNT(*) FILTER (WHERE codigo_nissei IS NULL),
            COUNT(*) FILTER (WHERE cantidad IS NULL),
            COUNT(*) FILTER (WHERE precio_sugerido IS NULL),
            COUNT(*) FILTER (WHERE fecha_hora_creacion IS NULL)
        FROM ({sql})
        """
    ).fetchone()
    filas_anteriores = con.execute(
        f"""
        SELECT COUNT(*)
        FROM {consulta_excel(archivo, hoja)}
        WHERE CAST({sql_fecha_excel('"fecha_hora_transferencia"')} AS DATE)
              < make_date({ANIO_INICIO_MODELO}, 1, 1)
        """
    ).fetchone()[0]
    if resumen[0] == 0:
        raise RuntimeError("El Excel de guías no contiene registros utilizables.")

    print("\nCAPA 1 DE GUÍAS EN TRÁNSITO VERIFICADA")
    print(f"Archivo                    : {archivo}")
    print(f"Hoja                       : {hoja}")
    print(f"Registros finales          : {resumen[0]}")
    print(f"Filas anteriores a {ANIO_INICIO_MODELO} excluidas: {int(filas_anteriores):,}")
    print(f"Fecha transferencia NULL   : {resumen[1]}")
    print(f"Tienda origen NULL         : {resumen[2]}")
    print(f"Tienda destino NULL        : {resumen[3]}")
    print(f"Código Nissei NULL         : {resumen[4]}")
    print(f"Cantidad NULL              : {resumen[5]}")
    print(f"Precio sugerido NULL       : {resumen[6]}")
    print(f"Fecha creación NULL        : {resumen[7]}")
    print("Los campos vacíos se publicarán como NULL y no detienen la pipeline.")
    print("No se registran funciones Python en DuckDB, por lo que numpy no es necesario.")
    return {"filas": int(resumen[0]), "columnas": len(columnas)}


def crear_capa2(con: duckdb.DuckDBPyConnection, archivo: Path, hoja: str) -> None:
    verificar_capa1(con, archivo, hoja)
    CAPA2_TEMP.unlink(missing_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT * FROM ({construir_sql_capa2(archivo, hoja)})
            ORDER BY fecha_hora_transferencia, nro_guia, codigo_nissei
        ) TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
        """
    )


def validar_y_publicar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_TEMP.exists() or CAPA2_TEMP.stat().st_size == 0:
        raise RuntimeError("No se generó el Parquet temporal de guías.")
    origen = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError(f"Esquema inesperado. Esperado: {COLUMNAS_CAPA2}; obtenido: {columnas}")
    filas = con.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas == 0:
        raise RuntimeError("El Parquet de guías quedó vacío.")
    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    return {"filas": int(filas), "columnas": len(columnas)}


def verificar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_FINAL.exists():
        raise FileNotFoundError(f"No existe {CAPA2_FINAL}")
    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError("FactGuiasTransitoLimpio.parquet tiene un esquema inesperado.")
    resumen = con.execute(
        f"SELECT COUNT(*), COUNT(*) FILTER (WHERE fecha_hora_transferencia IS NULL), COUNT(*) FILTER (WHERE cantidad IS NULL) FROM {origen}"
    ).fetchone()
    print("\nFACT_GUIAS_TRANSITO VERIFICADA")
    print(f"Registros        : {resumen[0]}")
    print(f"Fechas NULL      : {resumen[1]}")
    print(f"Cantidades NULL  : {resumen[2]}")
    return {"filas": int(resumen[0]), "columnas": len(columnas)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Excel manual de guías en tránsito -> .etl_work/intermedios/FactGuiasTransitoLimpio.parquet"
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
        print("\nFACT_GUIAS_TRANSITO GENERADA CORRECTAMENTE")
        print(f"Registros : {resumen['filas']}")
        print(f"Resultado : {CAPA2_FINAL}")
        return 0
    except Exception as exc:
        print("\nERROR EN LA PIPELINE DE GUÍAS EN TRÁNSITO", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        CAPA2_TEMP.unlink(missing_ok=True)
        return 1
    finally:
        if con is not None:
            cerrar_duckdb_seguro(con)


# Incorpora todos los alias vigentes del maestro central.
TIENDAS_EQUIVALENCIAS = {**TIENDAS_EQUIVALENCIAS_MAESTRAS, **TIENDAS_EQUIVALENCIAS}

if __name__ == "__main__":
    finalizar_proceso(main())
