from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from typing import Any

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta DuckDB. Activa el entorno virtual y ejecuta:\n"
        "python -m pip install -r requirements.txt"
    ) from exc


# ==========================================================
# 1. RUTAS DEL PROYECTO
# ==========================================================

from project_paths import PROJECT_ROOT, WORK_INTERMEDIATE_DIR, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
INPUT_DIR = BASE_DIR / "input"
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"

ARCHIVO_EXCEL_PREFERIDO = INPUT_DIR / "STOCK ACTUAL.xlsx"

CAPA1_FINAL = CAPA1_DIR / "Fact_Stock.parquet"
CAPA1_TEMP = WORK_TEMP_DIR / "Fact_Stock_temporal.parquet"

FACT_STOCK_FINAL = WORK_INTERMEDIATE_DIR / "FactStockBase.parquet"
FACT_STOCK_TEMP = WORK_TEMP_DIR / "FactStockBase_temporal.parquet"

DIM_PRODUCTO_FINAL = WORK_INTERMEDIATE_DIR / "DimProductoStockBase.parquet"
DIM_PRODUCTO_TEMP = WORK_TEMP_DIR / "DimProductoStockBase_temporal.parquet"

DIM_TIENDAS = CAPA2_DIR / "DimTiendas.parquet"
DIM_CLASIFICACION = CAPA2_DIR / "DimClasificacionProducto.parquet"


# ==========================================================
# 2. ESQUEMAS
# ==========================================================


# El historial de origen del STOCK no debe heredar el inicio del modelo comercial (2024).
# Se conserva cualquier año de origen razonable; las fechas posteriores al corte se invalidan más adelante.
ANIO_MINIMO_ORIGEN_STOCK = 1900

COLUMNAS_EXCEL_REQUERIDAS = [
    "TIENDA",
    "CODIGO NISSEI",
    "PROVEEDOR",
    "LOTE",
    "RUB",
    "LINEA",
    "SUB LINEA",
    "MARCA",
    "MODELO",
    "DESCRIPCION",
    "SERIE",
    "CANT",
    "PRECIO SUGERIDO",
    "TOTAL",
    "ESTADO",
    "MES",
    "AÑO",
]

COLUMNAS_CAPA1 = [
    "fecha_corte",
    "es_fecha_corte_inferida",
    "archivo_origen",
    "tienda",
    "codigo_nissei",
    "proveedor",
    "lote",
    "rubro",
    "linea",
    "sub_linea",
    "marca",
    "modelo",
    "descripcion",
    "serie",
    "cantidad",
    "precio_sugerido",
    "total_fuente",
    "estado",
    "mes",
    "anio",
]

COLUMNAS_DIM_PRODUCTO = [
    "producto_id",
    "codigo_nissei",
    "proveedor_id",
    "proveedor",
    "lote",
    "clasificacion_producto_id",
    "rubro_id",
    "rubro_codigo",
    "rubro",
    "linea_id",
    "linea",
    "sub_linea_id",
    "sub_linea",
    "marca_id",
    "marca",
    "modelo",
    "descripcion",
    "serie",
    "es_servicio",
    "es_producto_valido",
]

COLUMNAS_FACT_STOCK = [
    "stock_id",
    "fecha_corte_id",
    "periodo_corte_id",
    "fecha_corte",
    "anio_corte",
    "mes_corte_numero",
    "mes_corte_nombre",
    "trimestre_corte",
    "es_fecha_corte_inferida",
    "fecha_origen_id",
    "periodo_origen_id",
    "fecha_origen",
    "anio_origen",
    "mes_origen_numero",
    "mes_origen_nombre",
    "es_periodo_origen_valido",
    "edad_stock_meses",
    "tienda_id",
    "tienda",
    "producto_id",
    "codigo_nissei",
    "clasificacion_producto_id",
    "estado_stock",
    "estado_grupo",
    "cantidad",
    "precio_sugerido",
    "valor_stock",
    "total_fuente",
    "diferencia_total",
    "es_total_consistente",
    "es_precio_cero",
    "es_clasificacion_catalogada",
    "unidad_medida",
    "moneda",
]


# ==========================================================
# 3. REGLAS MAESTRAS
# ==========================================================

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
    "ONLINE": "ONLINE",
    "ALMACEN VIRTUAL": "ONLINE",
    "ALMACÉN VIRTUAL": "ONLINE",
    "ALMACEN VIRUTAL": "ONLINE",
    "ALMACÉN VIRUTAL": "ONLINE",
    "PERSHING": "PERSHING",
    "P PIEDRA": "PUENTE PIEDRA",
    "P. PIEDRA": "PUENTE PIEDRA",
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

PROVEEDORES_EQUIVALENCIAS = {
    "CHILIA": "INVERSIONES CHILIA S.A.",
    "CHILIA S A": "INVERSIONES CHILIA S.A.",
    "CHILIA S.A.": "INVERSIONES CHILIA S.A.",
    "INVERSIONES CHILIA S A": "INVERSIONES CHILIA S.A.",
    "INVERSIONES CHILIA S.A.": "INVERSIONES CHILIA S.A.",

    "OROTEX NORTH AMERICA INC": "OROTEX NORTH AMERICA INC.",
    "OROTEX NORTH AMERICA INC.": "OROTEX NORTH AMERICA INC.",

    "ILAHI": "ILAHUI",
    "ILAHUI": "ILAHUI",

    "CORPORACION CARDINALE S R L":
        "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACION CARDINALE S.R.L.":
        "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACION CARDINAL":
        "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACIÓN CARDENALES S.R.L.":
        "CORPORACIÓN CARDENALES S.R.L.",

    "DISTRIBUIDO DEPORTIVA PUMA S A C":
        "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDO DEPORTIVA PUMA S.A.C.":
        "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDORA DEPORTIVA PUMA S A C":
        "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.":
        "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",

    "MILAN INTERNATIONAL E I R L":
        "MILAN INTERNATIONAL E.I.R.L.",
    "MILAN INTERNATIONAL E.I.R.L":
        "MILAN INTERNATIONAL E.I.R.L.",
    "MILAN INTERNATIONAL E.I.R.L.":
        "MILAN INTERNATIONAL E.I.R.L.",

    "LG ELECTRONICS PERU S A":
        "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERU S.A.":
        "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERÚ S.A":
        "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERÚ S.A.":
        "LG ELECTRONICS PERÚ S.A.",

    "TRIATHLON": "TRIATHLON S.A.C.",
    "TRIATHLON S A C": "TRIATHLON S.A.C.",
    "TRIATHLON S.A.C": "TRIATHLON S.A.C.",
    "TRIATHLON S.A.C.": "TRIATHLON S.A.C.",

    "LA POSITIVA":
        "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVA SEGUROS Y REASEGUROS SA":
        "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVASEGUROS Y REASEGUROS SA":
        "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVA SEGUROS Y REASEGUROS S.A.":
        "LA POSITIVA SEGUROS Y REASEGUROS S.A.",

    "FABRICA YLIS": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "FABRICA YLIS E I R L":
        "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "FABRICA YLIS E.I.R.L.":
        "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "DISTRIBUIDORA DE FABRICA YLIS E I R L":
        "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.":
        "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",

    "INTER SPORT S A C": "INTERSPORT S.A.C.",
    "INTER SPORT S.A.C.": "INTERSPORT S.A.C.",
    "INTERSPORT S A C": "INTERSPORT S.A.C.",
    "INTERSPORT S.A.C.": "INTERSPORT S.A.C.",

    "SEGURO HOMECENTERS PERUANOS S A":
        "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGURO HOMECENTERS PERUANOS S.A":
        "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S A":
        "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A":
        "SEGUROS HOMECENTERS PERUANOS S.A.",

    "MARCIMEX S A": "MARCIMEX S.A.",
    "MARCIMEX S.A": "MARCIMEX S.A.",
    "MARCIMEX S.A.": "MARCIMEX S.A.",

    "SKECHERS PERU S R L": "SKECHERS PERÚ S.R.L.",
    "SKECHERS PERU S.R.L.": "SKECHERS PERÚ S.R.L.",
    "SKECHERS PERÚ S.R.L.": "SKECHERS PERÚ S.R.L.",

    "ULTRA BRANDS S A C": "ULTRA BRANDS S.A.C.",
    "ULTRA BRANDS S.A.C.": "ULTRA BRANDS S.A.C.",

    "SMART BRANDS S A C": "SMART BRANDS S.A.C.",
    "SMART BRANDS S.A.C.": "SMART BRANDS S.A.C.",
}

MARCAS_EQUIVALENCIAS = {
    "HITECH": "HI-TEC",
    "HI TEC": "HI-TEC",
    "HI-TEC": "HI-TEC",
    "AIR WALK": "AIRWALK",
    "AIRWALK": "AIRWALK",
    "POLO RALPH LAUREN": "RALPH LAUREN",
    "RALPH LAUREN": "RALPH LAUREN",
    "BOSS": "HUGO BOSS",
    "HUGO BOSS": "HUGO BOSS",
    "MIA BY APOLO": "APOLO",
    "APOLITO": "APOLO",
    "APOLO": "APOLO",
    "LA COSTE": "LACOSTE",
    "LACOSTE": "LACOSTE",
}

RUBROS_EQUIVALENCIAS = {
    "TEXTIL": "TEXTIL",
    "CALZADO": "CALZADO",
    "MOCHILA MALETA MALETIN CARTERA":
        "MOCHILA/MALETA/MALETÍN/CARTERA",
    "MOCHILA/MALETA/MALETIN/CARTERA":
        "MOCHILA/MALETA/MALETÍN/CARTERA",
    "MOCHILA/MALETA/MALETÍN/CARTERA":
        "MOCHILA/MALETA/MALETÍN/CARTERA",
    "ACCESORIOS DE DEPORTE": "ACCESORIOS DE DEPORTE",
    "RECREACION": "RECREACIÓN",
    "RECREACIÓN": "RECREACIÓN",
    "HOGAR": "HOGAR",
    "CAMPING": "CAMPING",
    "VARIOS": "VARIOS",
    "PRODUCTOS VARIOS": "PRODUCTOS VARIOS",
    "JUGUETES": "JUGUETES",
    "TEMPORADA": "TEMPORADA",
    "BANO Y LAVANDERIA": "BAÑO Y LAVANDERÍA",
    "BAÑO Y LAVANDERIA": "BAÑO Y LAVANDERÍA",
    "BAÑO Y LAVANDERÍA": "BAÑO Y LAVANDERÍA",
    "AUDIO Y VIDEO": "AUDIO Y VIDEO",
    "ELECTRO MENOR": "ELECTRO MENOR",
    "COMPUTO": "CÓMPUTO",
    "CÓMPUTO": "CÓMPUTO",
    "LINEA BLANCA": "LÍNEA BLANCA",
    "LÍNEA BLANCA": "LÍNEA BLANCA",
    "MUEBLE": "MUEBLE",
    "MUEBLES": "MUEBLE",
    "FERRETERIA": "FERRETERÍA",
    "FERRETERÍA": "FERRETERÍA",
    "ALIMENTOS Y BEBIDAS": "ALIMENTOS Y BEBIDAS",
    "SERVICIOS": "SERVICIOS",
    "JOYAS": "JOYAS",
    "DEPORTE": "DEPORTE",
    "TECNOLOGIA": "TECNOLOGÍA",
    "TECNOLOGÍA": "TECNOLOGÍA",
    "AUTOMOTRIZ": "AUTOMOTRIZ",
    "BELLEZA": "BELLEZA",
    "JOYERIA": "JOYERÍA",
    "JOYERÍA": "JOYERÍA",
    "X ERROR": "SIN CLASIFICACIÓN",
    "X.ERROR": "SIN CLASIFICACIÓN",
}

RUBRO_CODIGOS = {
    "TEXTIL": 1,
    "CALZADO": 2,
    "MOCHILA/MALETA/MALETÍN/CARTERA": 3,
    "ACCESORIOS DE DEPORTE": 4,
    "RECREACIÓN": 5,
    "HOGAR": 6,
    "CAMPING": 7,
    "VARIOS": 8,
    "JUGUETES": 9,
    "TEMPORADA": 10,
    "BAÑO Y LAVANDERÍA": 11,
    "AUDIO Y VIDEO": 12,
    "ELECTRO MENOR": 13,
    "CÓMPUTO": 14,
    "LÍNEA BLANCA": 15,
    "MUEBLE": 16,
    "FERRETERÍA": 17,
    "ALIMENTOS Y BEBIDAS": 18,
    "PRODUCTOS VARIOS": 19,
    "SERVICIOS": 20,
    "JOYAS": 21,
    "DEPORTE": 22,
    "TECNOLOGÍA": 23,
    "AUTOMOTRIZ": 24,
    "BELLEZA": 25,
    "JOYERÍA": 26,
}

LINEAS_EQUIVALENCIAS = {
    "ROPA NIÑA": "ROPA NINA",
    "ROPA NINO": "ROPA NINO",
    "ROPA NIÑO": "ROPA NINO",
    "CALZADO NIÑA": "CALZADO NINA",
    "CALZADO NIÑO": "CALZADO NINO",
    "MALETA MOCHILA CANGURO MALETIN":
        "MALETA/MOCHILA/CANGURO/MALETÍN",
    "MALETA/MOCHILA/CANGURO/MALETIN":
        "MALETA/MOCHILA/CANGURO/MALETÍN",
    "JOYERIA Y BISUTERIA": "JOYERÍA Y BISUTERÍA",
    "JOYERÍA Y BISUTERÍA": "JOYERÍA Y BISUTERÍA",
    "ACCESORIO DE COMPUTO": "ACCESORIOS DE CÓMPUTO",
    "ACCESORIOS DE COMPUTO": "ACCESORIOS DE CÓMPUTO",
    "ACCESORIOS DE CÓMPUTO": "ACCESORIOS DE CÓMPUTO",
    "ARTICULOS PARA EL HOGAR": "ARTÍCULOS PARA EL HOGAR",
    "ARTÍCULOS PARA EL HOGAR": "ARTÍCULOS PARA EL HOGAR",
    "ARTICULOS DE LIMPIEZA": "ARTÍCULOS DE LIMPIEZA",
    "ARTÍCULOS DE LIMPIEZA": "ARTÍCULOS DE LIMPIEZA",
    "ARTICULOS PLAYEROS": "ARTÍCULOS PLAYEROS",
    "ARTÍCULOS PLAYEROS": "ARTÍCULOS PLAYEROS",
    "ACCESORIO BAÑO": "ACCESORIOS DE BAÑO",
    "ACCESORIO BANO": "ACCESORIOS DE BAÑO",
    "ACCESORIOS DE BAÑO": "ACCESORIOS DE BAÑO",
    "DECORACION": "DECORACIÓN",
    "DECORACIÓN": "DECORACIÓN",
    "PROTECCION": "PROTECCIÓN",
    "PROTECCIÓN": "PROTECCIÓN",
    "COCCION": "COCCIÓN",
    "COCCIÓN": "COCCIÓN",
    "CLIMATIZACION": "CLIMATIZACIÓN",
    "CLIMATIZACIÓN": "CLIMATIZACIÓN",
    "FILMACION & FOTOGRAFIA": "FILMACIÓN Y FOTOGRAFÍA",
    "FILMACIÓN Y FOTOGRAFÍA": "FILMACIÓN Y FOTOGRAFÍA",
    "ERROR": "SIN CLASIFICACIÓN",
}

SUBLINEAS_EQUIVALENCIAS = {
    "SIN CLASIFICACION": "SIN CLASIFICACIÓN",
    "SIN CLASIFICACIÓN": "SIN CLASIFICACIÓN",
    "COJIN": "COJÍN",
    "COJÍN": "COJÍN",
    "HORNO ELECTRICO": "HORNO ELÉCTRICO",
    "HORNO ELÉCTRICO": "HORNO ELÉCTRICO",
    "ROPA DE BANO": "ROPA DE BAÑO",
    "ROPA DE BAÑO": "ROPA DE BAÑO",
    "COSMETICOS MAQUILLAJE": "COSMÉTICOS/MAQUILLAJE",
    "COSMETICOS/MAQUILLAJE": "COSMÉTICOS/MAQUILLAJE",
    "COSMÉTICOS/MAQUILLAJE": "COSMÉTICOS/MAQUILLAJE",
    "ERROR": "SIN CLASIFICACIÓN",
}

MESES_EQUIVALENCIAS = {
    "ENERO": (1, "ENERO"),
    "FEBRERO": (2, "FEBRERO"),
    "FEFRERO": (2, "FEBRERO"),
    "MARZO": (3, "MARZO"),
    "ABRIL": (4, "ABRIL"),
    "MAYO": (5, "MAYO"),
    "JUNIO": (6, "JUNIO"),
    "JULIO": (7, "JULIO"),
    "AGOSTO": (8, "AGOSTO"),
    "SETIEMBRE": (9, "SEPTIEMBRE"),
    "SEPTIEMBRE": (9, "SEPTIEMBRE"),
    "SEPTIEMBREE": (9, "SEPTIEMBRE"),
    "OCTUBRE": (10, "OCTUBRE"),
    "OCTUBE": (10, "OCTUBRE"),
    "NOVIEMBRE": (11, "NOVIEMBRE"),
    "NOBIEMBRE": (11, "NOVIEMBRE"),
    "DICIEMBRE": (12, "DICIEMBRE"),
    "DICIEMPRE": (12, "DICIEMBRE"),
}

ESTADOS_EQUIVALENCIAS = {
    "BUENO": "BUENO",
    "OK": "BUENO",
    "NUEVO": "BUENO",
    "VENDIBLE": "BUENO",

    "SUCIO": "SUCIO",
    "SUCIOS": "SUCIO",
    "SUC IO": "SUCIO",

    "MANCHADO": "MANCHADO",
    "MANCHA": "MANCHADO",

    "FALLADO": "FALLADO",
    "FALLADA": "FALLADO",
    "FALALDO": "FALLADO",

    "SERVICIO TECNICO": "SERVICIO TÉCNICO",
    "SERVICO TECNICO": "SERVICIO TÉCNICO",
    "SERVICIO/TECNICO": "SERVICIO TÉCNICO",
    "SERVICIO TÉCNICO": "SERVICIO TÉCNICO",

    "INCOMPLETO": "INCOMPLETO",
    "INCOMPLETA": "INCOMPLETO",
    "IMCOMPLETO": "INCOMPLETO",

    "P REPARADA": "REPARADO",
    "P. REPARADA": "REPARADO",
    "P/REPARADA": "REPARADO",
    "PANTALLA REPARADA": "REPARADO",
    "PANTALLA/REPARADA": "REPARADO",
    "REPARADO": "REPARADO",

    "P ROTA": "ROTO",
    "P. ROTA": "ROTO",
    "P/ROTA": "ROTO",
    "PANTALLA ROTA": "ROTO",
    "ROTO": "ROTO",

    "RAYADA": "RAYADO",
    "RAYADO": "RAYADO",

    "MERMA": "MERMA",
    "DESMEDRO": "DESMEDRO",
    "RECUPERADO": "RECUPERADO",
    "REMATE": "REMATE",
    "USADO": "USADO",
    "LAVADO": "LAVADO",
    "DESTALLADO": "DESTALLADO",
    "DESCOLORIDO": "DESCOLORIDO",
    "DESTEÑIDO": "DESTEÑIDO",
    "OXIDADO": "OXIDADO",
    "CHANCADO": "CHANCADO",
    "QUIÑADO": "QUIÑADO",
    "RASPADO": "RASPADO",
    "HUECO": "HUECO",
    "DESPOSTILLADO": "DESPOSTILLADO",
    "AMARILLO": "AMARILLO",
    "PUNTOS": "PUNTOS",
    "PUNTOS BLANCOS": "PUNTOS BLANCOS",
    "PUNTO NEGRO": "PUNTO NEGRO",
}


# ==========================================================
# 4. UTILIDADES SQL
# ==========================================================

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def preparar_carpetas() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def sql_literal(valor: Any) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def sql_identificador(nombre: str) -> str:
    return '"' + nombre.replace('"', '""') + '"'


def clave_python(valor: Any) -> str:
    if valor is None:
        return ""
    texto = unicodedata.normalize("NFKD", str(valor).upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_diccionario(
    diccionario: dict[str, str],
) -> dict[str, str]:
    return {
        clave_python(origen): destino
        for origen, destino in diccionario.items()
    }


def sql_clave(expresion: str) -> str:
    texto = f"upper(COALESCE(CAST({expresion} AS VARCHAR), ''))"

    for origen, destino in [
        ("Á", "A"),
        ("É", "E"),
        ("Í", "I"),
        ("Ó", "O"),
        ("Ú", "U"),
        ("Ü", "U"),
        ("Ñ", "N"),
    ]:
        texto = (
            f"replace("
            f"{texto}, "
            f"{sql_literal(origen)}, "
            f"{sql_literal(destino)}"
            f")"
        )

    texto = (
        f"regexp_replace("
        f"{texto}, "
        "'[^A-Z0-9]+', "
        "' ', "
        "'g'"
        ")"
    )

    return (
        f"trim("
        f"regexp_replace("
        f"{texto}, "
        "'\\s+', "
        "' ', "
        "'g'"
        ")"
        ")"
    )


def sql_limpiar_texto(
    expresion: str,
    valor_por_defecto: str | None = None,
) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"
    fallback = (
        "NULL"
        if valor_por_defecto is None
        else sql_literal(valor_por_defecto)
    )

    return f"""
    CASE
        WHEN {raw} IS NULL
          OR {sql_clave(expresion)} IN (
              '',
              'N A',
              'NA',
              'NULL',
              'NONE',
              'NULO',
              'SIN DATO',
              'S N'
          )
        THEN {fallback}

        ELSE upper(
            regexp_replace(
                {raw},
                '\\s+',
                ' ',
                'g'
            )
        )
    END
    """


def sql_estado_stock_tres(expresion: str) -> str:
    limpio = sql_limpiar_texto(expresion, "BUENO")
    clave = sql_clave(f"({limpio})")
    return f"""
    CASE
        WHEN {clave} LIKE '%MERMA%' THEN 'MERMA'
        WHEN {clave} IN (
            'BUENO','OK','NUEVO','VENDIBLE','RECUPERADO','REPARADO',
            'P REPARADA','PANTALLA REPARADA','0'
        ) THEN 'BUENO'
        ELSE 'DESMEDRO'
    END
    """


def sql_mapear(
    expresion: str,
    diccionario: dict[str, str],
    fallback: str,
) -> str:
    casos = "\n".join(
        (
            f"WHEN {sql_literal(clave)} "
            f"THEN {sql_literal(valor)}"
        )
        for clave, valor in sorted(
            normalizar_diccionario(diccionario).items()
        )
    )

    return f"""
    CASE {sql_clave(expresion)}
        {casos}
        ELSE {fallback}
    END
    """


def sql_codigo_texto(expresion: str) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"

    return f"""
    CASE
        WHEN {raw} IS NULL
          OR {sql_clave(expresion)} IN (
              '',
              'N A',
              'NA',
              'NULL',
              'NONE',
              'NULO'
          )
        THEN NULL

        ELSE upper(
            regexp_replace(
                {raw},
                '\\.0+$',
                ''
            )
        )
    END
    """


def sql_numero(expresion: str) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"

    return f"""
    CASE
        WHEN {raw} IS NULL
          OR {sql_clave(expresion)} IN (
              '',
              'N A',
              'NA',
              'NULL',
              'NONE',
              'NULO',
              'S N'
          )
        THEN NULL

        WHEN regexp_full_match(
            {raw},
            '^-?[0-9]{{1,3}}(\\.[0-9]{{3}})+,[0-9]+$'
        )
        THEN TRY_CAST(
            replace(
                replace({raw}, '.', ''),
                ',',
                '.'
            )
            AS DECIMAL(20,6)
        )

        WHEN regexp_full_match(
            {raw},
            '^-?[0-9]+,[0-9]+$'
        )
        THEN TRY_CAST(
            replace({raw}, ',', '.')
            AS DECIMAL(20,6)
        )

        ELSE TRY_CAST(
            replace({raw}, ',', '')
            AS DECIMAL(20,6)
        )
    END
    """


def id_hash(prefijo: str, expresion: str, longitud: int = 16) -> str:
    return (
        f"{sql_literal(prefijo)} "
        "|| upper("
        f"substr(sha256({expresion}), 1, {longitud})"
        ")"
    )


def tienda_id_sql(tienda_expr: str) -> str:
    casos = "\n".join(
        (
            f"WHEN {sql_literal(nombre)} "
            f"THEN {sql_literal(tienda_id)}"
        )
        for nombre, tienda_id in TIENDA_IDS.items()
    )

    return f"""
    CASE {tienda_expr}
        {casos}
        ELSE {
            id_hash(
                "T_",
                tienda_expr,
                10,
            )
        }
    END
    """


def rubro_codigo_sql(rubro_expr: str) -> str:
    casos = "\n".join(
        (
            f"WHEN {sql_literal(rubro)} "
            f"THEN {codigo}"
        )
        for rubro, codigo in RUBRO_CODIGOS.items()
    )

    return f"""
    CASE {rubro_expr}
        {casos}
        ELSE NULL
    END
    """


def rubro_id_sql(rubro_codigo_expr: str, rubro_expr: str) -> str:
    return f"""
    CASE
        WHEN {rubro_codigo_expr} IS NOT NULL
        THEN
            'R'
            || lpad(
                CAST({rubro_codigo_expr} AS VARCHAR),
                2,
                '0'
            )

        ELSE {
            id_hash(
                "R_",
                f"{sql_clave(rubro_expr)}",
                10,
            )
        }
    END
    """


def linea_id_sql(rubro_expr: str, linea_expr: str) -> str:
    clave = (
        f"{sql_clave(rubro_expr)} "
        "|| '|' || "
        f"{sql_clave(linea_expr)}"
    )
    return id_hash("L_", clave, 12)


def sub_linea_id_sql(
    rubro_expr: str,
    linea_expr: str,
    sub_linea_expr: str,
) -> str:
    clave = (
        f"{sql_clave(rubro_expr)} "
        "|| '|' || "
        f"{sql_clave(linea_expr)} "
        "|| '|' || "
        f"{sql_clave(sub_linea_expr)}"
    )
    return id_hash("SL_", clave, 12)


def clasificacion_id_fallback_sql(
    rubro_expr: str,
    linea_expr: str,
    sub_linea_expr: str,
) -> str:
    clave = (
        f"{sql_clave(rubro_expr)} "
        "|| '|' || "
        f"{sql_clave(linea_expr)} "
        "|| '|' || "
        f"{sql_clave(sub_linea_expr)}"
    )
    return id_hash("CP_", clave, 16)


def mes_numero_sql(mes_expr: str) -> str:
    casos = "\n".join(
        (
            f"WHEN {sql_literal(clave_python(nombre))} "
            f"THEN {numero}"
        )
        for nombre, (numero, _) in MESES_EQUIVALENCIAS.items()
    )
    return f"""
    CASE {sql_clave(mes_expr)}
        {casos}
        ELSE NULL
    END
    """


def mes_nombre_sql(mes_expr: str) -> str:
    casos = "\n".join(
        (
            f"WHEN {sql_literal(clave_python(nombre))} "
            f"THEN {sql_literal(nombre_estandar)}"
        )
        for nombre, (_, nombre_estandar)
        in MESES_EQUIVALENCIAS.items()
    )
    return f"""
    CASE {sql_clave(mes_expr)}
        {casos}
        ELSE NULL
    END
    """


def mes_nombre_desde_numero_sql(numero_expr: str) -> str:
    return f"""
    CASE {numero_expr}
        WHEN 1 THEN 'ENERO'
        WHEN 2 THEN 'FEBRERO'
        WHEN 3 THEN 'MARZO'
        WHEN 4 THEN 'ABRIL'
        WHEN 5 THEN 'MAYO'
        WHEN 6 THEN 'JUNIO'
        WHEN 7 THEN 'JULIO'
        WHEN 8 THEN 'AGOSTO'
        WHEN 9 THEN 'SEPTIEMBRE'
        WHEN 10 THEN 'OCTUBRE'
        WHEN 11 THEN 'NOVIEMBRE'
        WHEN 12 THEN 'DICIEMBRE'
        ELSE NULL
    END
    """


def conectar(
    cargar_excel: bool = True,
) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)

    if cargar_excel:
        try:
            con.execute("LOAD excel")
        except Exception:
            print(
                "Instalando la extensión Excel de DuckDB "
                "por primera vez..."
            )
            con.execute("INSTALL excel")
            con.execute("LOAD excel")

    return con


# ==========================================================
# 5. DETECCIÓN DEL EXCEL Y FECHA DE CORTE
# ==========================================================

def buscar_excels_stock() -> list[Path]:
    preparar_carpetas()

    ubicaciones = [
        INPUT_DIR,
        BASE_DIR,
        CAPA1_DIR,
    ]

    candidatos: list[Path] = []

    for carpeta in ubicaciones:
        candidatos.extend(
            archivo
            for archivo in carpeta.glob("*.xlsx")
            if not archivo.name.startswith("~$")
            and "STOCK" in clave_python(archivo.stem)
        )

    candidatos = sorted(set(candidatos))

    if not candidatos:
        raise FileNotFoundError(
            "No se encontró el Excel de stock.\n"
            "Ubicación recomendada:\n"
            f"{ARCHIVO_EXCEL_PREFERIDO}"
        )

    return candidatos


def buscar_excel_stock() -> Path:
    """Compatibilidad: devuelve la foto mensual más reciente."""
    return max(
        buscar_excels_stock(),
        key=lambda archivo: resolver_fecha_corte(archivo, None)[0],
    )


def obtener_nombres_hojas(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as libro:
        workbook = ET.fromstring(
            libro.read("xl/workbook.xml")
        )
        hojas = workbook.find(
            f"{{{NS_MAIN}}}sheets"
        )

        if hojas is None:
            return []

        return [
            hoja.attrib["name"]
            for hoja in hojas
        ]


def buscar_hoja_stock(
    archivo: Path,
    con: duckdb.DuckDBPyConnection | None = None,
) -> str:
    hojas = obtener_nombres_hojas(archivo)

    if not hojas:
        raise RuntimeError(
            "El Excel no contiene hojas legibles."
        )

    if con is not None:
        requeridas = set(COLUMNAS_EXCEL_REQUERIDAS)
        for nombre in hojas:
            columnas = set(obtener_columnas_excel(con, archivo, nombre))
            if requeridas.issubset(columnas):
                return nombre

    for nombre in hojas:
        if "STOCK" in clave_python(nombre):
            return nombre

    if "Sheet1" in hojas:
        return "Sheet1"

    return hojas[0]


def parsear_fecha(valor: str) -> date:
    try:
        return date.fromisoformat(valor)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "La fecha debe usar YYYY-MM-DD. "
            "Ejemplo: 2026-08-04."
        ) from exc


def resolver_fecha_corte(
    archivo: Path,
    fecha_argumento: date | None,
) -> tuple[date, bool, str]:
    nombre = archivo.stem

    patrones = [
        r"(?<!\d)(20\d{2})[-_](\d{2})[-_](\d{2})(?!\d)",
        r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)",
        r"(?<!\d)(\d{2})[-_](\d{2})[-_](20\d{2})(?!\d)",
    ]

    for indice, patron in enumerate(patrones):
        coincidencia = re.search(patron, nombre)

        if not coincidencia:
            continue

        grupos = coincidencia.groups()

        try:
            if indice < 2:
                fecha = date(
                    int(grupos[0]),
                    int(grupos[1]),
                    int(grupos[2]),
                )
            else:
                fecha = date(
                    int(grupos[2]),
                    int(grupos[1]),
                    int(grupos[0]),
                )

            return fecha, True, "NOMBRE_ARCHIVO"

        except ValueError:
            pass

    # Las entregas mensuales usan variantes como STOCK202603 y
    # STOCK0202604. Se toma el fin de mes, salvo que la fecha comercial
    # explícita pertenezca a ese mismo periodo (por ejemplo JUL-2026).
    coincidencia_mes = re.search(r"(20\d{2})(0[1-9]|1[0-2])", nombre)
    if coincidencia_mes:
        anio = int(coincidencia_mes.group(1))
        mes = int(coincidencia_mes.group(2))
        if (
            fecha_argumento is not None
            and fecha_argumento.year == anio
            and fecha_argumento.month == mes
        ):
            return fecha_argumento, False, "ARGUMENTO_PERIODO"
        return (
            date(anio, mes, monthrange(anio, mes)[1]),
            True,
            "NOMBRE_ARCHIVO_MENSUAL",
        )

    if fecha_argumento is not None:
        return fecha_argumento, False, "ARGUMENTO"

    fecha_modificacion = datetime.fromtimestamp(
        archivo.stat().st_mtime
    ).date()

    return (
        fecha_modificacion,
        True,
        "MODIFICACION_ARCHIVO",
    )


# ==========================================================
# 6. CAPA 1: EXCEL RMS -> PARQUET TÉCNICO
# ==========================================================

def origen_excel(archivo: Path, hoja: str) -> str:
    return (
        "read_xlsx("
        f"{sql_literal(archivo.as_posix())}, "
        f"sheet = {sql_literal(hoja)}, "
        "header = true, "
        "all_varchar = true, "
        "stop_at_empty = false"
        ")"
    )


def obtener_columnas_excel(
    con: duckdb.DuckDBPyConnection,
    archivo: Path,
    hoja: str,
) -> list[str]:
    return [
        fila[0]
        for fila in con.execute(
            (
                "DESCRIBE SELECT * FROM "
                f"{origen_excel(archivo, hoja)}"
            )
        ).fetchall()
    ]


def validar_columnas_excel(
    columnas: list[str],
) -> None:
    faltan = [
        columna
        for columna in COLUMNAS_EXCEL_REQUERIDAS
        if columna not in columnas
    ]

    if faltan:
        raise RuntimeError(
            "El Excel de stock no contiene las columnas "
            "requeridas.\n"
            f"Faltan: {faltan}\n"
            f"Encontradas: {columnas}"
        )


def consulta_capa1(
    archivo: Path,
    hoja: str,
    fecha_corte: date,
    es_fecha_inferida: bool,
) -> str:
    origen = origen_excel(archivo, hoja)

    tienda = sql_identificador("TIENDA")
    codigo = sql_identificador("CODIGO NISSEI")
    cantidad = (
        "TRY_CAST(ROUND("
        + sql_numero(sql_identificador("CANT"))
        + ") AS BIGINT)"
    )

    return f"""
    SELECT
        DATE {sql_literal(fecha_corte.isoformat())}
            AS fecha_corte,

        {'TRUE' if es_fecha_inferida else 'FALSE'}
            AS es_fecha_corte_inferida,

        {sql_literal(archivo.name)}
            AS archivo_origen,

        NULLIF(trim(CAST({tienda} AS VARCHAR)), '')
            AS tienda,

        NULLIF(
            regexp_replace(
                trim(CAST({codigo} AS VARCHAR)),
                '\\.0+$',
                ''
            ),
            ''
        )
            AS codigo_nissei,

        NULLIF(
            trim(CAST({sql_identificador('PROVEEDOR')} AS VARCHAR)),
            ''
        )
            AS proveedor,

        NULLIF(
            trim(CAST({sql_identificador('LOTE')} AS VARCHAR)),
            ''
        )
            AS lote,

        NULLIF(
            trim(CAST({sql_identificador('RUB')} AS VARCHAR)),
            ''
        )
            AS rubro,

        NULLIF(
            trim(CAST({sql_identificador('LINEA')} AS VARCHAR)),
            ''
        )
            AS linea,

        NULLIF(
            trim(CAST({sql_identificador('SUB LINEA')} AS VARCHAR)),
            ''
        )
            AS sub_linea,

        NULLIF(
            trim(CAST({sql_identificador('MARCA')} AS VARCHAR)),
            ''
        )
            AS marca,

        NULLIF(
            trim(CAST({sql_identificador('MODELO')} AS VARCHAR)),
            ''
        )
            AS modelo,

        NULLIF(
            trim(CAST({sql_identificador('DESCRIPCION')} AS VARCHAR)),
            ''
        )
            AS descripcion,

        NULLIF(
            trim(CAST({sql_identificador('SERIE')} AS VARCHAR)),
            ''
        )
            AS serie,

        {cantidad}
            AS cantidad,

        CAST(
            {sql_numero(sql_identificador('PRECIO SUGERIDO'))}
            AS DECIMAL(20,4)
        )
            AS precio_sugerido,

        CAST(
            {sql_numero(sql_identificador('TOTAL'))}
            AS DECIMAL(20,4)
        )
            AS total_fuente,

        NULLIF(
            trim(CAST({sql_identificador('ESTADO')} AS VARCHAR)),
            ''
        )
            AS estado,

        NULLIF(
            trim(CAST({sql_identificador('MES')} AS VARCHAR)),
            ''
        )
            AS mes,

        NULLIF(
            trim(CAST({sql_identificador('AÑO')} AS VARCHAR)),
            ''
        )
            AS anio

    FROM {origen}

    WHERE
        {codigo} IS NOT NULL
        AND trim(CAST({codigo} AS VARCHAR)) <> ''
        AND {cantidad} IS NOT NULL
        AND {cantidad} >= 0
        AND {sql_clave(tienda)} NOT LIKE 'TOTAL%'
        AND {sql_clave(tienda)} NOT LIKE 'PAGINA%'
    """


def crear_capa1(fecha_corte_argumento: date | None = None) -> None:
    preparar_carpetas()
    archivos = buscar_excels_stock()

    CAPA1_TEMP.unlink(missing_ok=True)

    con = conectar(cargar_excel=True)

    try:
        print("\nGenerando Capa 1 de stock...")
        consultas: list[str] = []
        periodos: set[tuple[int, int]] = set()

        for archivo in archivos:
            hoja = buscar_hoja_stock(archivo, con)
            columnas = obtener_columnas_excel(con, archivo, hoja)
            validar_columnas_excel(columnas)
            fecha_corte, inferida, origen_fecha = resolver_fecha_corte(
                archivo,
                fecha_corte_argumento,
            )
            periodo = (fecha_corte.year, fecha_corte.month)
            if periodo in periodos:
                raise RuntimeError(
                    "Hay más de un archivo de stock para el periodo "
                    f"{fecha_corte:%Y-%m}."
                )
            periodos.add(periodo)
            consultas.append(
                consulta_capa1(archivo, hoja, fecha_corte, inferida)
            )
            print(
                f"- {archivo.name} · {hoja} · {fecha_corte.isoformat()} "
                f"({origen_fecha})"
            )

        consulta_union = "\nUNION ALL\n".join(consultas)

        con.execute(
            f"""
            COPY (
                {consulta_union}
            )
            TO {sql_literal(CAPA1_TEMP.as_posix())}
            (
                FORMAT PARQUET,
                COMPRESSION SNAPPY,
                ROW_GROUP_SIZE 122880
            )
            """
        )

    except Exception:
        CAPA1_TEMP.unlink(missing_ok=True)
        raise

    finally:
        cerrar_duckdb_seguro(con)

    resumen = verificar_capa1(
        CAPA1_TEMP,
        mostrar_detalle=False,
    )

    os.replace(
        CAPA1_TEMP,
        CAPA1_FINAL,
    )

    print("\nCAPA 1 GENERADA CORRECTAMENTE")
    print(f"Filas    : {resumen['filas']:,}")
    print(f"Columnas : {resumen['columnas']}")
    print(f"Salida   : {CAPA1_FINAL}")


def verificar_capa1(
    archivo: Path | None = None,
    mostrar_detalle: bool = True,
) -> dict[str, int]:
    objetivo = archivo or CAPA1_FINAL

    if not objetivo.exists():
        raise FileNotFoundError(
            f"No existe el Parquet de Capa 1: {objetivo}"
        )

    con = duckdb.connect(database=":memory:")

    try:
        ruta = sql_literal(objetivo.as_posix())

        columnas = [
            fila[0]
            for fila in con.execute(
                (
                    "DESCRIBE SELECT * FROM "
                    f"read_parquet({ruta})"
                )
            ).fetchall()
        ]

        if columnas != COLUMNAS_CAPA1:
            raise RuntimeError(
                "El esquema de Fact_Stock.parquet no coincide.\n"
                f"Esperado: {COLUMNAS_CAPA1}\n"
                f"Obtenido: {columnas}"
            )

        resumen = con.execute(
            f"""
            SELECT
                COUNT(*) AS filas,

                COUNT(*) FILTER (
                    WHERE tienda IS NULL
                       OR codigo_nissei IS NULL
                )
                    AS claves_vacias,

                COUNT(*) FILTER (
                    WHERE cantidad IS NULL
                       OR cantidad < 0
                )
                    AS cantidades_invalidas,

                COUNT(*) FILTER (
                    WHERE precio_sugerido < 0
                       OR total_fuente < 0
                )
                    AS importes_negativos,

                COUNT(*) FILTER (
                    WHERE total_fuente IS NOT NULL
                      AND cantidad IS NOT NULL
                      AND precio_sugerido IS NOT NULL
                      AND abs(
                          total_fuente
                          - cantidad * precio_sugerido
                      ) > 0.05
                )
                    AS totales_inconsistentes

            FROM read_parquet({ruta})
            """
        ).fetchone()

        errores = {
            "claves_vacias": int(resumen[1]),
            "cantidades_invalidas": int(resumen[2]),
            "importes_negativos": int(resumen[3]),
            "totales_inconsistentes": int(resumen[4]),
        }

        problemas = {
            clave: valor
            for clave, valor in errores.items()
            if valor
        }

        if int(resumen[0]) == 0 or problemas:
            raise RuntimeError(
                "Fact_Stock.parquet no pasó la validación "
                f"técnica: {problemas}"
            )

        resultado = {
            "filas": int(resumen[0]),
            "columnas": len(columnas),
            "totales_inconsistentes": int(resumen[4]),
        }

        if mostrar_detalle:
            print("\nCAPA 1 DE STOCK VERIFICADA")
            print(f"Filas    : {resultado['filas']:,}")
            print(f"Columnas : {resultado['columnas']}")
            print(f"Archivo  : {objetivo}")

        return resultado

    finally:
        cerrar_duckdb_seguro(con)


# ==========================================================
# 7. CAPA 2: NORMALIZACIÓN COLUMNA POR COLUMNA
# ==========================================================

def crear_vistas_dimensiones_externas(
    con: duckdb.DuckDBPyConnection,
) -> dict[str, bool]:
    resultado = {
        "dim_tiendas": False,
        "dim_clasificacion": False,
    }

    if DIM_TIENDAS.exists():
        ruta = sql_literal(DIM_TIENDAS.as_posix())

        columnas = [
            fila[0]
            for fila in con.execute(
                (
                    "DESCRIBE SELECT * FROM "
                    f"read_parquet({ruta})"
                )
            ).fetchall()
        ]

        if "tienda_id" in columnas and "tienda" in columnas:
            con.execute(
                f"""
                CREATE OR REPLACE TEMP VIEW dim_tiendas_norm AS

                SELECT DISTINCT
                    CAST(tienda_id AS VARCHAR)
                        AS tienda_id,

                    {sql_clave('tienda')}
                        AS tienda_key

                FROM read_parquet({ruta})
                """
            )
            resultado["dim_tiendas"] = True

    if DIM_CLASIFICACION.exists():
        ruta = sql_literal(
            DIM_CLASIFICACION.as_posix()
        )

        columnas = [
            fila[0]
            for fila in con.execute(
                (
                    "DESCRIBE SELECT * FROM "
                    f"read_parquet({ruta})"
                )
            ).fetchall()
        ]

        requeridas = {
            "clasificacion_producto_id",
            "rubro",
            "linea",
            "sub_linea",
        }

        if requeridas.issubset(columnas):
            con.execute(
                f"""
                CREATE OR REPLACE TEMP VIEW
                dim_clasificacion_norm AS

                SELECT
                    MIN(
                        CAST(
                            clasificacion_producto_id
                            AS VARCHAR
                        )
                    )
                        AS clasificacion_producto_id,

                    {sql_clave('rubro')}
                        AS rubro_key,

                    {sql_clave('linea')}
                        AS linea_key,

                    {sql_clave('sub_linea')}
                        AS sub_linea_key

                FROM read_parquet({ruta})

                GROUP BY
                    rubro_key,
                    linea_key,
                    sub_linea_key
                """
            )
            resultado["dim_clasificacion"] = True

    return resultado


def crear_vista_stock_limpio(
    con: duckdb.DuckDBPyConnection,
    fecha_corte: date,
    es_fecha_inferida: bool,
    capacidades: dict[str, bool],
) -> None:
    ruta = sql_literal(CAPA1_FINAL.as_posix())

    tienda_limpia = sql_limpiar_texto(
        "tienda",
        "SIN TIENDA",
    )
    tienda = sql_mapear(
        "tienda_limpia",
        TIENDAS_EQUIVALENCIAS,
        "tienda_limpia",
    )

    proveedor_limpio = sql_limpiar_texto(
        "proveedor",
        "SIN PROVEEDOR",
    )
    proveedor = sql_mapear(
        "proveedor_limpio",
        PROVEEDORES_EQUIVALENCIAS,
        "proveedor_limpio",
    )

    marca_limpia = sql_limpiar_texto(
        "marca",
        "SIN MARCA",
    )
    marca = sql_mapear(
        "marca_limpia",
        MARCAS_EQUIVALENCIAS,
        "marca_limpia",
    )

    rubro_limpio = sql_limpiar_texto(
        "rubro",
        "SIN CLASIFICACIÓN",
    )
    rubro = sql_mapear(
        "rubro_limpio",
        RUBROS_EQUIVALENCIAS,
        "rubro_limpio",
    )

    linea_limpia = sql_limpiar_texto(
        "linea",
        "SIN CLASIFICACIÓN",
    )
    linea = sql_mapear(
        "linea_limpia",
        LINEAS_EQUIVALENCIAS,
        "linea_limpia",
    )

    sub_linea_limpia = sql_limpiar_texto(
        "sub_linea",
        "SIN CLASIFICACIÓN",
    )
    sub_linea = sql_mapear(
        "sub_linea_limpia",
        SUBLINEAS_EQUIVALENCIAS,
        "sub_linea_limpia",
    )

    estado = sql_estado_stock_tres("estado")

    mes_numero = mes_numero_sql("mes")
    mes_nombre = mes_nombre_sql("mes")

    fecha_sql = (
        "COALESCE(TRY_CAST(fecha_corte AS DATE), "
        f"DATE {sql_literal(fecha_corte.isoformat())})"
    )
    inferida_sql = (
        "COALESCE(es_fecha_corte_inferida, "
        + ("TRUE" if es_fecha_inferida else "FALSE")
        + ")"
    )

    con.execute(
        f"""
        CREATE OR REPLACE TEMP VIEW stock_normalizado_base AS

        WITH limpieza AS (
            SELECT
                {fecha_sql}
                    AS fecha_corte,

                {inferida_sql}
                    AS es_fecha_corte_inferida,

                {tienda_limpia}
                    AS tienda_limpia,

                {sql_codigo_texto('codigo_nissei')}
                    AS codigo_nissei,

                {proveedor_limpio}
                    AS proveedor_limpio,

                {sql_limpiar_texto('lote')}
                    AS lote,

                {rubro_limpio}
                    AS rubro_limpio,

                {linea_limpia}
                    AS linea_limpia,

                {sub_linea_limpia}
                    AS sub_linea_limpia,

                {marca_limpia}
                    AS marca_limpia,

                {sql_limpiar_texto('modelo')}
                    AS modelo,

                {sql_limpiar_texto('descripcion')}
                    AS descripcion,

                CASE
                    WHEN {sql_clave('serie')} IN (
                        '',
                        'S C',
                        'S S',
                        'S M',
                        'M V',
                        'SIN CODIGO',
                        'SIN SERIE'
                    )
                    THEN NULL
                    ELSE {sql_limpiar_texto('serie')}
                END
                    AS serie,

                cantidad,

                CAST(
                    precio_sugerido
                    AS DECIMAL(20,4)
                )
                    AS precio_sugerido,

                CAST(
                    total_fuente
                    AS DECIMAL(20,4)
                )
                    AS total_fuente,

                {estado_limpio}
                    AS estado_limpio,

                {mes_numero}
                    AS mes_origen_numero_raw,

                {mes_nombre}
                    AS mes_origen_nombre_raw,

                TRY_CAST(
                    trim(CAST(anio AS VARCHAR))
                    AS INTEGER
                )
                    AS anio_origen_raw

            FROM read_parquet({ruta})
        ),

        estandarizado AS (
            SELECT
                fecha_corte,
                es_fecha_corte_inferida,

                {tienda}
                    AS tienda,

                codigo_nissei,

                {proveedor}
                    AS proveedor,

                lote,

                {rubro}
                    AS rubro,

                {linea}
                    AS linea,

                {sub_linea}
                    AS sub_linea,

                {marca}
                    AS marca,

                modelo,
                descripcion,
                serie,
                cantidad,
                precio_sugerido,
                total_fuente,

                {estado}
                    AS estado_stock,

                mes_origen_numero_raw
                    AS mes_origen_numero,

                mes_origen_nombre_raw
                    AS mes_origen_nombre,

                CASE
                    WHEN anio_origen_raw BETWEEN 2000
                         AND EXTRACT(
                             YEAR FROM fecha_corte
                         )::INTEGER
                    THEN anio_origen_raw
                    ELSE NULL
                END
                    AS anio_origen

            FROM limpieza
        ),

        calculos AS (
            SELECT
                *,

                {tienda_id_sql('tienda')}
                    AS tienda_id,

                {
                    id_hash(
                        "P_",
                        "codigo_nissei",
                        16,
                    )
                }
                    AS producto_id,

                {
                    id_hash(
                        "PRV_",
                        "proveedor",
                        12,
                    )
                }
                    AS proveedor_id,

                {
                    id_hash(
                        "M_",
                        "marca",
                        12,
                    )
                }
                    AS marca_id,

                {rubro_codigo_sql('rubro')}
                    AS rubro_codigo,

                CASE
                    WHEN anio_origen >= {ANIO_MINIMO_ORIGEN_STOCK}
                     AND mes_origen_numero IS NOT NULL
                    THEN make_date(
                        anio_origen,
                        mes_origen_numero,
                        1
                    )
                    ELSE NULL
                END
                    AS fecha_origen,

                CAST(
                    cantidad * precio_sugerido
                    AS DECIMAL(20,4)
                )
                    AS valor_stock,

                CAST(
                    COALESCE(total_fuente, 0)
                    - COALESCE(
                        cantidad * precio_sugerido,
                        0
                    )
                    AS DECIMAL(20,4)
                )
                    AS diferencia_total,

                estado_stock
                    AS estado_grupo

            FROM estandarizado
        )

        SELECT
            *,

            {rubro_id_sql('rubro_codigo', 'rubro')}
                AS rubro_id,

            {linea_id_sql('rubro', 'linea')}
                AS linea_id,

            {
                sub_linea_id_sql(
                    "rubro",
                    "linea",
                    "sub_linea",
                )
            }
                AS sub_linea_id,

            {
                clasificacion_id_fallback_sql(
                    "rubro",
                    "linea",
                    "sub_linea",
                )
            }
                AS clasificacion_producto_id_fallback,

            {sql_clave('rubro')}
                AS rubro_key,

            {sql_clave('linea')}
                AS linea_key,

            {sql_clave('sub_linea')}
                AS sub_linea_key

        FROM calculos
        """
    )

    if capacidades["dim_clasificacion"]:
        con.execute(
            """
            CREATE OR REPLACE TEMP VIEW stock_limpio AS

            SELECT
                s.* EXCLUDE (
                    clasificacion_producto_id_fallback,
                    rubro_key,
                    linea_key,
                    sub_linea_key
                ),

                COALESCE(
                    d.clasificacion_producto_id,
                    s.clasificacion_producto_id_fallback
                )
                    AS clasificacion_producto_id,

                (
                    d.clasificacion_producto_id
                    IS NOT NULL
                )
                    AS es_clasificacion_catalogada

            FROM stock_normalizado_base s

            LEFT JOIN dim_clasificacion_norm d
              ON s.rubro_key = d.rubro_key
             AND s.linea_key = d.linea_key
             AND s.sub_linea_key = d.sub_linea_key
            """
        )
    else:
        con.execute(
            """
            CREATE OR REPLACE TEMP VIEW stock_limpio AS

            SELECT
                * EXCLUDE (
                    clasificacion_producto_id_fallback,
                    rubro_key,
                    linea_key,
                    sub_linea_key
                ),

                clasificacion_producto_id_fallback
                    AS clasificacion_producto_id,

                FALSE
                    AS es_clasificacion_catalogada

            FROM stock_normalizado_base
            """
        )


def validar_unicidad_producto(
    con: duckdb.DuckDBPyConnection,
) -> int:
    conflictos = con.execute(
        """
        SELECT COUNT(*)

        FROM (
            SELECT
                codigo_nissei

            FROM stock_limpio

            GROUP BY codigo_nissei

            HAVING
                COUNT(DISTINCT proveedor) > 1
                OR COUNT(DISTINCT COALESCE(lote, '')) > 1
                OR COUNT(DISTINCT rubro) > 1
                OR COUNT(DISTINCT linea) > 1
                OR COUNT(DISTINCT sub_linea) > 1
                OR COUNT(DISTINCT marca) > 1
                OR COUNT(DISTINCT COALESCE(modelo, '')) > 1
                OR COUNT(DISTINCT descripcion) > 1
                OR COUNT(DISTINCT COALESCE(serie, '')) > 1
        )
        """
    ).fetchone()[0]

    if conflictos:
        raise RuntimeError(
            "No se puede crear una Dim_Producto estable: "
            f"{conflictos:,} códigos Nissei tienen atributos "
            "diferentes entre filas. Revisa la clave del producto."
        )

    return int(conflictos)


def validar_dim_tiendas(
    con: duckdb.DuckDBPyConnection,
    capacidades: dict[str, bool],
) -> dict[str, int]:
    if not capacidades["dim_tiendas"]:
        return {
            "tiendas_ausentes": 0,
            "ids_inconsistentes": 0,
        }

    resumen = con.execute(
        """
        WITH origen AS (
            SELECT DISTINCT
                tienda,
                tienda_id,
                """ + sql_clave("tienda") + """ AS tienda_key

            FROM stock_limpio
        )

        SELECT
            COUNT(*) FILTER (
                WHERE d.tienda_key IS NULL
            )
                AS tiendas_ausentes,

            COUNT(*) FILTER (
                WHERE d.tienda_key IS NOT NULL
                  AND d.tienda_id <> o.tienda_id
            )
                AS ids_inconsistentes

        FROM origen o

        LEFT JOIN dim_tiendas_norm d
          ON o.tienda_key = d.tienda_key
        """
    ).fetchone()

    return {
        "tiendas_ausentes": int(resumen[0]),
        "ids_inconsistentes": int(resumen[1]),
    }


def consulta_dim_producto() -> str:
    return """
    SELECT
        MIN(producto_id)
            AS producto_id,

        codigo_nissei,

        MIN(proveedor_id)
            AS proveedor_id,

        MIN(proveedor)
            AS proveedor,

        MIN(lote)
            AS lote,

        MIN(clasificacion_producto_id)
            AS clasificacion_producto_id,

        MIN(rubro_id)
            AS rubro_id,

        MIN(rubro_codigo)
            AS rubro_codigo,

        MIN(rubro)
            AS rubro,

        MIN(linea_id)
            AS linea_id,

        MIN(linea)
            AS linea,

        MIN(sub_linea_id)
            AS sub_linea_id,

        MIN(sub_linea)
            AS sub_linea,

        MIN(marca_id)
            AS marca_id,

        MIN(marca)
            AS marca,

        MIN(modelo)
            AS modelo,

        MIN(descripcion)
            AS descripcion,

        MIN(serie)
            AS serie,

        BOOL_OR(
            rubro = 'SERVICIOS'
            OR codigo_nissei = 'ENVIO'
        )
            AS es_servicio,

        (
            codigo_nissei IS NOT NULL
            AND MIN(descripcion) IS NOT NULL
        )
            AS es_producto_valido

    FROM stock_limpio

    GROUP BY codigo_nissei

    ORDER BY codigo_nissei
    """


def consulta_fact_stock() -> str:
    mes_corte = mes_nombre_desde_numero_sql(
        "EXTRACT(MONTH FROM fecha_corte)::INTEGER"
    )

    return f"""
    SELECT
        {
            id_hash(
                "STK_",
                (
                    "strftime(fecha_corte, '%Y%m%d') "
                    "|| '|' || tienda_id "
                    "|| '|' || producto_id "
                    "|| '|' || COALESCE(lote, '') "
                    "|| '|' || estado_stock "
                    "|| '|' || COALESCE("
                    "CAST(periodo_origen_id AS VARCHAR),"
                    "'SIN_PERIODO'"
                    ")"
                ),
                18,
            )
        }
            AS stock_id,

        CAST(
            strftime(fecha_corte, '%Y%m%d')
            AS INTEGER
        )
            AS fecha_corte_id,

        (
            EXTRACT(YEAR FROM fecha_corte)::INTEGER
            * 100
            + EXTRACT(MONTH FROM fecha_corte)::INTEGER
        )
            AS periodo_corte_id,

        fecha_corte,

        EXTRACT(YEAR FROM fecha_corte)::INTEGER
            AS anio_corte,

        EXTRACT(MONTH FROM fecha_corte)::INTEGER
            AS mes_corte_numero,

        {mes_corte}
            AS mes_corte_nombre,

        EXTRACT(QUARTER FROM fecha_corte)::INTEGER
            AS trimestre_corte,

        es_fecha_corte_inferida,

        CASE
            WHEN fecha_origen IS NULL
            THEN NULL
            ELSE CAST(
                strftime(fecha_origen, '%Y%m%d')
                AS INTEGER
            )
        END
            AS fecha_origen_id,

        CASE
            WHEN fecha_origen IS NULL
            THEN NULL
            ELSE
                anio_origen * 100
                + mes_origen_numero
        END
            AS periodo_origen_id,

        fecha_origen,
        anio_origen,
        mes_origen_numero,
        mes_origen_nombre,

        (
            fecha_origen IS NOT NULL
            AND fecha_origen <= fecha_corte
        )
            AS es_periodo_origen_valido,

        CASE
            WHEN fecha_origen IS NULL
              OR fecha_origen > fecha_corte
            THEN NULL
            ELSE date_diff(
                'month',
                fecha_origen,
                date_trunc(
                    'month',
                    fecha_corte
                )::DATE
            )
        END
            AS edad_stock_meses,

        tienda_id,
        tienda,
        producto_id,
        codigo_nissei,
        clasificacion_producto_id,
        estado_stock,
        estado_grupo,
        cantidad,
        precio_sugerido,
        valor_stock,
        total_fuente,
        diferencia_total,

        (
            total_fuente IS NULL
            OR abs(diferencia_total) <= 0.05
        )
            AS es_total_consistente,

        (
            precio_sugerido = 0
        )
            AS es_precio_cero,

        es_clasificacion_catalogada,

        'UNIDADES'
            AS unidad_medida,

        'PEN'
            AS moneda

    FROM (
        SELECT
            *,

            CASE
                WHEN fecha_origen IS NULL
                THEN NULL
                ELSE
                    anio_origen * 100
                    + mes_origen_numero
            END
                AS periodo_origen_id

        FROM stock_limpio
    )

    ORDER BY
        tienda_id,
        producto_id
    """


def crear_capa2(
    fecha_corte_argumento: date | None,
) -> None:
    if not CAPA1_FINAL.exists():
        crear_capa1(fecha_corte_argumento)
    else:
        verificar_capa1(
            CAPA1_FINAL,
            mostrar_detalle=False,
        )

    excel = buscar_excel_stock()
    fecha_corte, es_inferida, origen_fecha = resolver_fecha_corte(
        excel,
        fecha_corte_argumento,
    )

    print("\nFecha de corte utilizada")
    print(f"Fecha  : {fecha_corte.isoformat()}")
    print(f"Origen : {origen_fecha}")

    if es_inferida:
        print(
            "ADVERTENCIA: la fecha de corte fue inferida. "
            "Para una fotografía mensual reproducible usa:\n"
            "python .\\stock_pipeline.py "
            "--fecha-corte YYYY-MM-DD"
        )

    FACT_STOCK_TEMP.unlink(missing_ok=True)
    DIM_PRODUCTO_TEMP.unlink(missing_ok=True)

    con = conectar(cargar_excel=False)

    try:
        capacidades = crear_vistas_dimensiones_externas(
            con
        )

        crear_vista_stock_limpio(
            con,
            fecha_corte,
            es_inferida,
            capacidades,
        )

        validar_unicidad_producto(con)

        dim_tiendas = validar_dim_tiendas(
            con,
            capacidades,
        )

        if dim_tiendas["ids_inconsistentes"]:
            raise RuntimeError(
                "Los IDs calculados para tiendas no coinciden "
                "con DimTiendas.parquet."
            )

        print("\nGenerando DimProducto.parquet...")

        con.execute(
            f"""
            COPY (
                {consulta_dim_producto()}
            )
            TO {sql_literal(DIM_PRODUCTO_TEMP.as_posix())}
            (
                FORMAT PARQUET,
                COMPRESSION SNAPPY,
                ROW_GROUP_SIZE 122880
            )
            """
        )

        print(
            "Generando FactStockBase.parquet..."
        )

        con.execute(
            f"""
            COPY (
                {consulta_fact_stock()}
            )
            TO {sql_literal(FACT_STOCK_TEMP.as_posix())}
            (
                FORMAT PARQUET,
                COMPRESSION SNAPPY,
                ROW_GROUP_SIZE 122880
            )
            """
        )

    except Exception:
        FACT_STOCK_TEMP.unlink(missing_ok=True)
        DIM_PRODUCTO_TEMP.unlink(missing_ok=True)
        raise

    finally:
        cerrar_duckdb_seguro(con)

    dim_resultado = verificar_dim_producto(
        DIM_PRODUCTO_TEMP,
        mostrar_detalle=False,
    )

    fact_resultado = verificar_fact_stock(
        FACT_STOCK_TEMP,
        DIM_PRODUCTO_TEMP,
        mostrar_detalle=False,
    )

    os.replace(
        DIM_PRODUCTO_TEMP,
        DIM_PRODUCTO_FINAL,
    )
    os.replace(
        FACT_STOCK_TEMP,
        FACT_STOCK_FINAL,
    )

    print("\n" + "=" * 72)
    print("CAPA 2 DE STOCK GENERADA CORRECTAMENTE")
    print("=" * 72)
    print(
        f"Dim_Producto            : "
        f"{dim_resultado['filas']:,} filas"
    )
    print(
        f"Fact_Stock_Limpia       : "
        f"{fact_resultado['filas']:,} filas"
    )
    print(
        f"Clasificación catalogada: "
        f"{fact_resultado['clasificaciones_catalogadas']:,}"
    )
    print(
        f"Clasificación pendiente : "
        f"{fact_resultado['clasificaciones_no_catalogadas']:,}"
    )
    print(f"Dimensión               : {DIM_PRODUCTO_FINAL}")
    print(f"Tabla de hechos         : {FACT_STOCK_FINAL}")
    print("=" * 72)


# ==========================================================
# 8. VALIDACIÓN DE CAPA 2
# ==========================================================

def verificar_dim_producto(
    archivo: Path | None = None,
    mostrar_detalle: bool = True,
) -> dict[str, int]:
    objetivo = archivo or DIM_PRODUCTO_FINAL

    if not objetivo.exists():
        raise FileNotFoundError(
            f"No existe el Parquet: {objetivo}"
        )

    con = duckdb.connect(database=":memory:")

    try:
        ruta = sql_literal(objetivo.as_posix())

        columnas = [
            fila[0]
            for fila in con.execute(
                (
                    "DESCRIBE SELECT * FROM "
                    f"read_parquet({ruta})"
                )
            ).fetchall()
        ]

        if columnas != COLUMNAS_DIM_PRODUCTO:
            raise RuntimeError(
                "El esquema de Dim_Producto no coincide.\n"
                f"Esperado: {COLUMNAS_DIM_PRODUCTO}\n"
                f"Obtenido: {columnas}"
            )

        resumen = con.execute(
            f"""
            SELECT
                COUNT(*) AS filas,

                COUNT(DISTINCT producto_id)
                    AS ids_producto,

                COUNT(DISTINCT codigo_nissei)
                    AS codigos_producto,

                COUNT(*) FILTER (
                    WHERE producto_id IS NULL
                       OR codigo_nissei IS NULL
                       OR descripcion IS NULL
                )
                    AS claves_vacias

            FROM read_parquet({ruta})
            """
        ).fetchone()

        filas = int(resumen[0])

        if (
            filas == 0
            or filas != int(resumen[1])
            or filas != int(resumen[2])
            or int(resumen[3])
        ):
            raise RuntimeError(
                "DimProducto.parquet no tiene una fila "
                f"única por código Nissei: {resumen}"
            )

        resultado = {
            "filas": filas,
            "columnas": len(columnas),
        }

        if mostrar_detalle:
            print("\nDIM_PRODUCTO VERIFICADA")
            print(f"Productos : {filas:,}")
            print(f"Columnas  : {len(columnas)}")
            print(f"Archivo   : {objetivo}")

        return resultado

    finally:
        cerrar_duckdb_seguro(con)


def verificar_fact_stock(
    archivo: Path | None = None,
    dim_producto: Path | None = None,
    mostrar_detalle: bool = True,
) -> dict[str, int]:
    objetivo = archivo or FACT_STOCK_FINAL
    dimension = dim_producto or DIM_PRODUCTO_FINAL

    if not objetivo.exists():
        raise FileNotFoundError(
            f"No existe el Parquet: {objetivo}"
        )

    if not dimension.exists():
        raise FileNotFoundError(
            f"No existe Dim_Producto: {dimension}"
        )

    con = duckdb.connect(database=":memory:")

    try:
        ruta = sql_literal(objetivo.as_posix())
        ruta_dim = sql_literal(dimension.as_posix())

        columnas = [
            fila[0]
            for fila in con.execute(
                (
                    "DESCRIBE SELECT * FROM "
                    f"read_parquet({ruta})"
                )
            ).fetchall()
        ]

        if columnas != COLUMNAS_FACT_STOCK:
            raise RuntimeError(
                "El esquema de Fact_Stock_Limpia no coincide.\n"
                f"Esperado: {COLUMNAS_FACT_STOCK}\n"
                f"Obtenido: {columnas}"
            )

        resumen = con.execute(
            f"""
            SELECT
                COUNT(*) AS filas,

                COUNT(DISTINCT stock_id)
                    AS ids_stock,

                COUNT(*) FILTER (
                    WHERE stock_id IS NULL
                       OR fecha_corte_id IS NULL
                       OR tienda_id IS NULL
                       OR producto_id IS NULL
                       OR codigo_nissei IS NULL
                )
                    AS claves_vacias,

                COUNT(*) FILTER (
                    WHERE cantidad IS NULL
                       OR cantidad < 0
                )
                    AS cantidades_invalidas,

                COUNT(*) FILTER (
                    WHERE precio_sugerido < 0
                       OR valor_stock < 0
                )
                    AS importes_invalidos,

                COUNT(*) FILTER (
                    WHERE NOT es_total_consistente
                )
                    AS totales_inconsistentes,

                COUNT(*) FILTER (
                    WHERE es_clasificacion_catalogada
                )
                    AS clasificaciones_catalogadas,

                COUNT(*) FILTER (
                    WHERE NOT es_clasificacion_catalogada
                )
                    AS clasificaciones_no_catalogadas

            FROM read_parquet({ruta})
            """
        ).fetchone()

        productos_ausentes = con.execute(
            f"""
            SELECT COUNT(*)

            FROM (
                SELECT DISTINCT
                    f.producto_id

                FROM read_parquet({ruta}) f

                LEFT JOIN read_parquet({ruta_dim}) d
                  ON f.producto_id = d.producto_id

                WHERE d.producto_id IS NULL
            )
            """
        ).fetchone()[0]

        filas = int(resumen[0])

        errores = {
            "stock_id_duplicado":
                filas - int(resumen[1]),
            "claves_vacias":
                int(resumen[2]),
            "cantidades_invalidas":
                int(resumen[3]),
            "importes_invalidos":
                int(resumen[4]),
            "totales_inconsistentes":
                int(resumen[5]),
            "productos_ausentes":
                int(productos_ausentes),
        }

        problemas = {
            clave: valor
            for clave, valor in errores.items()
            if valor
        }

        if filas == 0 or problemas:
            raise RuntimeError(
                "FactStockBase.parquet no pasó "
                f"la validación: {problemas}"
            )

        resultado = {
            "filas": filas,
            "columnas": len(columnas),
            "clasificaciones_catalogadas":
                int(resumen[6]),
            "clasificaciones_no_catalogadas":
                int(resumen[7]),
        }

        if mostrar_detalle:
            print("\nFACT_STOCK_LIMPIA VERIFICADA")
            print(f"Filas                     : {filas:,}")
            print(f"Columnas                  : {len(columnas)}")
            print(
                "Clasificaciones catalogadas: "
                f"{resultado['clasificaciones_catalogadas']:,}"
            )
            print(
                "Clasificaciones pendientes  : "
                f"{resultado['clasificaciones_no_catalogadas']:,}"
            )
            print(f"Archivo                    : {objetivo}")

        return resultado

    finally:
        cerrar_duckdb_seguro(con)


def verificar_capa2() -> None:
    dim = verificar_dim_producto(
        mostrar_detalle=False,
    )
    fact = verificar_fact_stock(
        mostrar_detalle=False,
    )

    print("\nCAPA 2 DE STOCK VERIFICADA")
    print(f"Dim_Producto      : {dim['filas']:,} filas")
    print(f"Fact_Stock_Limpia : {fact['filas']:,} filas")
    print(
        "Clasificación catalogada: "
        f"{fact['clasificaciones_catalogadas']:,}"
    )
    print(
        "Clasificación pendiente : "
        f"{fact['clasificaciones_no_catalogadas']:,}"
    )


# ==========================================================
# 9. EJECUCIÓN
# ==========================================================

def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Pipeline del reporte RMS STOCK ACTUAL. "
            "Capa 1: Excel estructurado a Fact_Stock.parquet. "
            "Capa 2: DimProducto.parquet y "
            "FactStockBase.parquet."
        )
    )

    grupo = parser.add_mutually_exclusive_group()

    grupo.add_argument(
        "--solo-capa1",
        action="store_true",
        help=(
            "Genera únicamente capa1/Fact_Stock.parquet."
        ),
    )

    grupo.add_argument(
        "--verificar-capa1",
        action="store_true",
        help=(
            "Valida únicamente capa1/Fact_Stock.parquet."
        ),
    )

    grupo.add_argument(
        "--solo-capa2",
        action="store_true",
        help=(
            "Genera Capa 2 desde Fact_Stock.parquet."
        ),
    )

    grupo.add_argument(
        "--verificar-capa2",
        action="store_true",
        help=(
            "Valida Dim_Producto y Fact_Stock_Limpia."
        ),
    )

    parser.add_argument(
        "--fecha-corte",
        type=parsear_fecha,
        default=None,
        metavar="YYYY-MM-DD",
        help=(
            "Fecha de la fotografía de stock. "
            "Ejemplo: --fecha-corte 2026-08-04. "
            "Si se omite, se infiere del nombre o "
            "fecha de modificación del Excel."
        ),
    )

    return parser


def main() -> int:
    args = crear_parser().parse_args()
    preparar_carpetas()

    try:
        if args.solo_capa1:
            crear_capa1(args.fecha_corte)
            return 0

        if args.verificar_capa1:
            verificar_capa1(
                mostrar_detalle=True,
            )
            return 0

        if args.solo_capa2:
            crear_capa2(
                args.fecha_corte,
            )
            return 0

        if args.verificar_capa2:
            verificar_capa2()
            return 0

        crear_capa1(args.fecha_corte)
        crear_capa2(
            args.fecha_corte,
        )
        return 0

    except Exception as exc:
        print(
            "\nERROR EN LA PIPELINE DE STOCK",
            file=sys.stderr,
        )
        print(
            str(exc),
            file=sys.stderr,
        )

        CAPA1_TEMP.unlink(missing_ok=True)
        FACT_STOCK_TEMP.unlink(missing_ok=True)
        DIM_PRODUCTO_TEMP.unlink(missing_ok=True)

        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
