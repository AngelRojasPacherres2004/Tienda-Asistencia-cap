from __future__ import annotations

"""Reglas maestras únicas del proyecto.

Todas las pipelines deben importar este módulo. Los IDs se calculan siempre
con las mismas funciones SQL para que las relaciones en Power BI sean estables.
"""

import re
import unicodedata
from typing import Any

ANIO_INICIO_MODELO = 2023
ANIO_FIN_MODELO = 2026
FECHA_INICIO_MODELO = f"{ANIO_INICIO_MODELO:04d}-01-01"

TIENDAS_EQUIVALENCIAS = {
    "AGUAS VERDES": "TUMBES", "TUMBES": "TUMBES",
    "A UGARTE": "ALFONSO UGARTE", "A. UGARTE": "ALFONSO UGARTE",
    "A.UGARTE": "ALFONSO UGARTE", "ALF UGARTE": "ALFONSO UGARTE",
    "ALF. UGARTE": "ALFONSO UGARTE", "ALFONSO UGARTE": "ALFONSO UGARTE",
    "ALIPIO": "ALIPIO", "ANGAMOS": "ANGAMOS", "ARAMBURU": "ARAMBURU",
    "ARAMBURÚ": "ARAMBURU", "ARGENTINA": "ARGENTINA", "ARGENT": "ARGENTINA",
    "AYA": "AYACUCHO", "AYACUCHO": "AYACUCHO", "CALLAO": "CALLAO",
    "CD": "CD", "CHORRILLOS": "CHORRILLOS",
    "EMANCIPACION": "EMANCIPACIÓN", "EMANCIPACIÓN": "EMANCIPACIÓN",
    "EMANCIP": "EMANCIPACIÓN", "INDEPENDENCIA": "INDEPENDENCIA",
    "INDEPEND": "INDEPENDENCIA", "LA MARINA": "MARINA", "MARINA": "MARINA",
    "ONLINE": "ONLINE", "ALMACEN VIRTUAL": "ONLINE", "ALMACÉN VIRTUAL": "ONLINE",
    "ALMACEN VIRUTAL": "ONLINE", "ALMACÉN VIRUTAL": "ONLINE",
    "PERSHING": "PERSHING", "P PIEDRA": "PUENTE PIEDRA",
    "P. PIEDRA": "PUENTE PIEDRA", "P. PIEDRA.": "PUENTE PIEDRA",
    "PTE PIEDRA": "PUENTE PIEDRA", "PP": "PUENTE PIEDRA",
    "PUENTE PIEDRA": "PUENTE PIEDRA", "PU": "PZA UNIÓN",
    "P. UNION": "PZA UNIÓN", "PZA UNION": "PZA UNIÓN", "PZA UNIÓN": "PZA UNIÓN",
    "PLAZA UNION": "PZA UNIÓN", "PLAZA UNIÓN": "PZA UNIÓN",
    "PUNO": "PUNO", "UNION": "PZA UNIÓN", "UNION 797": "JR UNIÓN",
    "UNIÓN 797": "JR UNIÓN", "JR. UNION 797": "JR UNIÓN",
    "JR UNION 797": "JR UNIÓN", "JR UNION N°797": "JR UNIÓN",
    "JR. DE LA UNION 799": "JR UNIÓN", "JR. DE LA UNIÓN 799": "JR UNIÓN",
    "JR DE LA UNION 01": "JR UNIÓN", "JR DE LA UNION 02": "JR UNIÓN",
    "JIRON UNION": "JR UNIÓN", "JIRÓN UNIÓN": "JR UNIÓN",
    "JR UNION": "JR UNIÓN", "JR UNIÓN": "JR UNIÓN",
    "TRUJILLO": "TRUJILLO", "TDA FRONTERA": "TUMBES",
}

TIENDA_IDS = {
    "MARINA": "T001", "ARAMBURU": "T002", "EMANCIPACIÓN": "T003",
    "INDEPENDENCIA": "T004", "ALFONSO UGARTE": "T005", "ANGAMOS": "T006",
    "PERSHING": "T007", "ALIPIO": "T008", "CHORRILLOS": "T009",
    "TRUJILLO": "T010", "PUENTE PIEDRA": "T011", "AYACUCHO": "T012",
    "CALLAO": "T013", "TUMBES": "T014", "PZA UNIÓN": "T015",
    "JR UNIÓN": "T016", "ARGENTINA": "T017", "PUNO": "T018",
    "CD": "T019", "ONLINE": "T020",
}

# Base histórica protegida. Estas claves nunca deben cambiar porque ya están
# referenciadas por los años 2024-2026. Se permiten tiendas nuevas con IDs hash.
TIENDAS_MODELO_2024_2026 = tuple(TIENDA_IDS.keys())
TIENDAS_PERMITIDAS = frozenset(TIENDAS_MODELO_2024_2026)

PROVEEDORES_EQUIVALENCIAS = {
    "CHILIA": "INVERSIONES CHILIA S.A.", "CHILIA S A": "INVERSIONES CHILIA S.A.",
    "CHILIA S.A.": "INVERSIONES CHILIA S.A.",
    "INVERSIONES CHILIA S A": "INVERSIONES CHILIA S.A.",
    "INVERSIONES CHILIA S.A.": "INVERSIONES CHILIA S.A.",
    "INVERSIONIES CHILIA": "INVERSIONES CHILIA S.A.",
    "OROTEX NORTH AMERICA INC": "OROTEX NORTH AMERICA INC.",
    "OROTEX NORTH AMERICA INC.": "OROTEX NORTH AMERICA INC.",
    "ILAHI": "ILAHUI", "ILAHUI": "ILAHUI",
    "CORPORACION CARDINALE S R L": "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACION CARDINALE S.R.L.": "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACIÓN CARDINALE S.R.L.": "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACION CARDINAL": "CORPORACIÓN CARDENALES S.R.L.",
    "CORPORACIÓN CARDENALES S.R.L.": "CORPORACIÓN CARDENALES S.R.L.",
    "DISTRIBUIDO DEPORTIVA PUMA S A C": "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDO DEPORTIVA PUMA S.A.C.": "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDORA DEPORTIVA PUMA S A C": "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.": "DISTRIBUIDORA DEPORTIVA PUMA S.A.C.",
    "MILAN INTERNATIONAL E I R L": "MILAN INTERNATIONAL E.I.R.L.",
    "MILAN INTERNATIONAL E.I.R.L": "MILAN INTERNATIONAL E.I.R.L.",
    "MILAN INTERNATIONAL E.I.R.L.": "MILAN INTERNATIONAL E.I.R.L.",
    "LG ELECTRONICS PERU S A": "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERU S.A.": "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERÚ S.A": "LG ELECTRONICS PERÚ S.A.",
    "LG ELECTRONICS PERÚ S.A.": "LG ELECTRONICS PERÚ S.A.",
    "TRIATHLON": "TRIATHLON S.A.C.", "TRIATHLON S A C": "TRIATHLON S.A.C.",
    "TRIATHLON S.A.C": "TRIATHLON S.A.C.", "TRIATHLON S.A.C.": "TRIATHLON S.A.C.",
    "LA POSITIVA": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVA SEGUROS Y REASEGUROS SA": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVASEGUROS Y REASEGUROS SA": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "LA POSITIVA SEGUROS Y REASEGUROS S.A.": "LA POSITIVA SEGUROS Y REASEGUROS S.A.",
    "FABRICA YLIS": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "FABRICA YLIS E I R L": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "FABRICA YLIS E.I.R.L.": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "DISTRIBUIDORA DE FABRICA YLIS E I R L": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.": "DISTRIBUIDORA DE FABRICA YLIS E.I.R.L.",
    "INTER SPORT S A C": "INTERSPORT S.A.C.", "INTER SPORT S.A.C.": "INTERSPORT S.A.C.",
    "INTERSPORT S A C": "INTERSPORT S.A.C.", "INTERSPORT S.A.C.": "INTERSPORT S.A.C.",
    "SEGURO HOMECENTERS PERUANOS S A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGURO HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A.": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "MARCIMEX S A": "MARCIMEX S.A.", "MARCIMEX S.A": "MARCIMEX S.A.",
    "MARCIMEX S.A.": "MARCIMEX S.A.",
    "SKECHERS PERU S R L": "SKECHERS PERÚ S.R.L.",
    "SKECHERS PERU S.R.L.": "SKECHERS PERÚ S.R.L.",
    "SKECHERS PERÚ S.R.L.": "SKECHERS PERÚ S.R.L.",
    "ULTRA BRANDS S A C": "ULTRA BRANDS S.A.C.", "ULTRA BRANDS S.A.C": "ULTRA BRANDS S.A.C.",
    "ULTRA BRANDS S.A.C.": "ULTRA BRANDS S.A.C.",
    "SMART BRANDS S A C": "SMART BRANDS S.A.C.", "SMART BRANDS S.A.C": "SMART BRANDS S.A.C.",
    "SMART BRANDS S.A.C.": "SMART BRANDS S.A.C.",
}

MARCAS_EQUIVALENCIAS = {
    "HITECH": "HI-TEC", "HI TEC": "HI-TEC", "HI-TEC": "HI-TEC",
    "AIR WALK": "AIRWALK", "AIRWALK": "AIRWALK",
    "POLO RALPH LAUREN": "RALPH LAUREN", "RALPH LAUREN": "RALPH LAUREN",
    "BOSS": "HUGO BOSS", "HUGO BOSS": "HUGO BOSS",
    "MIA BY APOLO": "APOLO", "APOLITO": "APOLO", "APOLO": "APOLO",
    "LA COSTE": "LACOSTE", "LACOSTE": "LACOSTE",
}

RUBRO_CODIGOS = {
    "TEXTIL": 1, "CALZADO": 2, "MOCHILA/MALETA/MALETÍN/CARTERA": 3,
    "ACCESORIOS DE DEPORTE": 4, "RECREACIÓN": 5, "HOGAR": 6,
    "CAMPING": 7, "VARIOS": 8, "JUGUETES": 9, "TEMPORADA": 10,
    "BAÑO Y LAVANDERÍA": 11, "AUDIO Y VIDEO": 12, "ELECTRO MENOR": 13,
    "CÓMPUTO": 14, "LÍNEA BLANCA": 15, "MUEBLE": 16,
    "FERRETERÍA": 17, "ALIMENTOS Y BEBIDAS": 18, "PRODUCTOS VARIOS": 19,
    "SERVICIOS": 20, "JOYAS": 21, "DEPORTE": 22, "TECNOLOGÍA": 23,
    "AUTOMOTRIZ": 24, "BELLEZA": 25, "JOYERÍA": 26,
}
DEPARTAMENTO_RUBRO = {v: k for k, v in RUBRO_CODIGOS.items()}

RUBROS_EQUIVALENCIAS = {
    "TEXTIL": "TEXTIL", "CALZADO": "CALZADO",
    "MOCHILA MALETA MALETIN CARTERA": "MOCHILA/MALETA/MALETÍN/CARTERA",
    "MOCHILA/MALETA/MALETIN/CARTERA": "MOCHILA/MALETA/MALETÍN/CARTERA",
    "MOCHILA/MALETA/MALETÍN/CARTERA": "MOCHILA/MALETA/MALETÍN/CARTERA",
    "ACCESORIOS DE DEPORTE": "ACCESORIOS DE DEPORTE",
    "RECREACION": "RECREACIÓN", "RECREACIÓN": "RECREACIÓN",
    "HOGAR": "HOGAR", "CAMPING": "CAMPING", "VARIOS": "VARIOS",
    "PRODUCTOS VARIOS": "PRODUCTOS VARIOS", "JUGUETES": "JUGUETES",
    "TEMPORADA": "TEMPORADA", "BANO Y LAVANDERIA": "BAÑO Y LAVANDERÍA",
    "BAÑO Y LAVANDERIA": "BAÑO Y LAVANDERÍA", "BAÑO Y LAVANDERÍA": "BAÑO Y LAVANDERÍA",
    "AUDIO Y VIDEO": "AUDIO Y VIDEO", "ELECTROMENOR": "ELECTRO MENOR",
    "ELECTRO MENOR": "ELECTRO MENOR", "COMPUTO": "CÓMPUTO", "CÓMPUTO": "CÓMPUTO",
    "LINEA BLANCA": "LÍNEA BLANCA", "LÍNEA BLANCA": "LÍNEA BLANCA",
    "MUEBLE": "MUEBLE", "MUEBLES": "MUEBLE",
    "FERRETERIA": "FERRETERÍA", "FERRETERÍA": "FERRETERÍA",
    "ALIMENTOS Y BEBIDAS": "ALIMENTOS Y BEBIDAS", "SERVICIOS": "SERVICIOS",
    "JOYAS": "JOYAS", "DEPORTE": "DEPORTE", "TECNOLOGIA": "TECNOLOGÍA",
    "TECNOLOGÍA": "TECNOLOGÍA", "AUTOMOTRIZ": "AUTOMOTRIZ",
    "BELLEZA": "BELLEZA", "JOYERIA": "JOYERÍA", "JOYERÍA": "JOYERÍA",
    "X ERROR": "SIN CLASIFICACIÓN", "X.ERROR": "SIN CLASIFICACIÓN",
    "ERROR": "SIN CLASIFICACIÓN", "N A": "SIN CLASIFICACIÓN",
}

LINEAS_EQUIVALENCIAS = {
    "MALETA MOCHILA CANGURO MALETIN": "MALETA/MOCHILA/CANGURO/MALETÍN",
    "MALETA/MOCHILA/CANGURO/MALETIN": "MALETA/MOCHILA/CANGURO/MALETÍN",
    "ELECTRODOMESTICOS": "ELECTRODOMÉSTICOS", "DECORACION": "DECORACIÓN",
    "DECORACION VERANO": "DECORACIÓN VERANO", "PROTECCION": "PROTECCIÓN",
    "CUIDADO Y PROTECCION": "CUIDADO Y PROTECCIÓN",
    "JOYERIA Y BISUTERIA": "JOYERÍA Y BISUTERÍA",
    "FILMACION & FOTOGRAFIA": "FILMACIÓN Y FOTOGRAFÍA",
    "CLIMATIZACION": "CLIMATIZACIÓN", "ILUMINACION": "ILUMINACIÓN",
    "ACCESORIO DE COMPUTO": "ACCESORIOS DE CÓMPUTO",
    "ACCESORIOS DE COMPUTO": "ACCESORIOS DE CÓMPUTO",
    "IPADS &TABLETS": "IPADS Y TABLETS", "LAPTOP'S": "LAPTOPS", "PC´S": "PCS",
    "COCCION": "COCCIÓN", "FRIO": "FRÍO",
    "ARTICULOS PARA EL HOGAR": "ARTÍCULOS PARA EL HOGAR",
    "ARTICULOS DE LIMPIEZA": "ARTÍCULOS DE LIMPIEZA",
    "ARTICULOS DE FIESTA": "ARTÍCULOS DE FIESTA",
    "ARTICULOS PLAYEROS": "ARTÍCULOS PLAYEROS",
    "ARTICULO DE BANO": "ARTÍCULO DE BAÑO", "ARTICULO DE BAÑO": "ARTÍCULO DE BAÑO",
    "ACCESORIO BANO": "ACCESORIOS DE BAÑO", "ACCESORIO BAÑO": "ACCESORIOS DE BAÑO",
    "ALMACENAMIENTO": "ALMACENAMIENTO", "ROPA NIÑA": "ROPA NINA",
    "ROPA NIÑO": "ROPA NINO", "CALZADO NIÑA": "CALZADO NINA",
    "CALZADO NIÑO": "CALZADO NINO", "ERROR": "SIN CLASIFICACIÓN",
}

SUBLINEAS_EQUIVALENCIAS = {
    "COMPLEMENTO": "COMPLEMENTOS", "LONCHERA": "LONCHERAS",
    "PELUCHE": "PELUCHES", "CORTINA": "CORTINAS",
    "SACACORCHO SET DE": "SET DE SACACORCHO", "COJIN": "COJÍN",
    "ACCESORIO Y COMPLEMENTO": "ACCESORIOS Y COMPLEMENTOS",
    "AQUA SHOES": "AQUASHOES", "PISCINAS INFLABLES": "PISCINA INFLABLE",
    "COSMETICOS MAQUILLAJE": "COSMÉTICOS/MAQUILLAJE",
    "COSMETICOS/MAQUILLAJE": "COSMÉTICOS/MAQUILLAJE",
    "HERVIDOR ELECTRICO": "HERVIDOR ELÉCTRICO", "HORNO ELECTRICO": "HORNO ELÉCTRICO",
    "SANDWICHERA/ WAFLERA": "SANDWICHERA/WAFLERA",
    "SIN CLASIFICACION": "SIN CLASIFICACIÓN", "ERROR": "SIN CLASIFICACIÓN",
}

MESES_EQUIVALENCIAS = {
    "ENERO": (1, "ENERO"), "FEBRERO": (2, "FEBRERO"), "FEFRERO": (2, "FEBRERO"),
    "MARZO": (3, "MARZO"), "ABRIL": (4, "ABRIL"), "MAYO": (5, "MAYO"),
    "JUNIO": (6, "JUNIO"), "JULIO": (7, "JULIO"), "AGOSTO": (8, "AGOSTO"),
    "SETIEMBRE": (9, "SEPTIEMBRE"), "SEPTIEMBRE": (9, "SEPTIEMBRE"),
    "SEPTIEMBREE": (9, "SEPTIEMBRE"), "OCTUBRE": (10, "OCTUBRE"),
    "OCTUBE": (10, "OCTUBRE"), "NOVIEMBRE": (11, "NOVIEMBRE"),
    "NOBIEMBRE": (11, "NOVIEMBRE"), "DICIEMBRE": (12, "DICIEMBRE"),
    "DICIEMPRE": (12, "DICIEMBRE"),
}

TOKENS_NULOS = {"", "N/A", "NA", "NULL", "NONE", "NULO", "-", "--", "#N/A", "S/N", "S/F", "SIN DATO"}


def clave_texto(valor: Any) -> str:
    if valor is None:
        return ""
    texto = unicodedata.normalize("NFKD", str(valor).upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def mapa_normalizado(mapa: dict[str, str]) -> dict[str, str]:
    return {clave_texto(k): v for k, v in mapa.items()}


def sql_literal(valor: Any) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def sql_clave(expr: str) -> str:
    texto = f"upper(COALESCE(CAST({expr} AS VARCHAR), ''))"
    for origen, destino in [("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U"), ("Ü", "U"), ("Ñ", "N")]:
        texto = f"replace({texto}, {sql_literal(origen)}, {sql_literal(destino)})"
    texto = f"regexp_replace({texto}, '[^A-Z0-9]+', ' ', 'g')"
    return f"trim(regexp_replace({texto}, '\\s+', ' ', 'g'))"


def sql_limpiar_texto(expr: str, default: str | None = None) -> str:
    raw = f"NULLIF(regexp_replace(trim(CAST({expr} AS VARCHAR)), '\\s+', ' ', 'g'), '')"
    nulos = ", ".join(sql_literal(clave_texto(x)) for x in sorted(TOKENS_NULOS))
    fallback = "NULL" if default is None else sql_literal(default)
    return f"CASE WHEN {raw} IS NULL OR {sql_clave(raw)} IN ({nulos}) THEN {fallback} ELSE upper({raw}) END"


def sql_mapear(expr: str, mapping: dict[str, str], fallback: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_literal(k)} THEN {sql_literal(v)}"
        for k, v in sorted(mapa_normalizado(mapping).items())
    )
    return f"CASE {sql_clave(expr)}\n{casos}\nELSE {fallback}\nEND"


def sql_codigo(expr: str) -> str:
    limpio = sql_limpiar_texto(expr)
    return f"CASE WHEN {limpio} IS NULL THEN NULL ELSE regexp_replace({limpio}, '\\.0+$', '') END"


def sql_tienda(expr: str) -> str:
    limpio = sql_limpiar_texto(expr)
    return sql_mapear(limpio, TIENDAS_EQUIVALENCIAS, limpio)


def sql_tienda_id(tienda_expr: str, estricto: bool = False) -> str:
    """Devuelve un ID estable para tiendas conocidas y futuras.

    Los IDs T001-T020 nunca cambian. Una tienda nueva recibe un ID derivado
    de su nombre homologado, por lo que el mismo nombre genera la misma clave
    en Dim_Tiendas y en todas las tablas de hechos.
    """
    casos = "\n".join(
        f"WHEN {sql_literal(nombre)} THEN {sql_literal(tienda_id)}"
        for nombre, tienda_id in TIENDA_IDS.items()
    )
    clave = sql_clave(tienda_expr)
    fallback = (
        "NULL"
        if estricto
        else f"'T_' || upper(substr(sha256({clave}), 1, 12))"
    )
    return (
        f"CASE WHEN {tienda_expr} IS NULL OR {clave} = '' THEN NULL "
        f"ELSE CASE {tienda_expr}\n{casos}\nELSE {fallback}\nEND END"
    )

def sql_tienda_valida(tienda_expr: str) -> str:
    permitidas = ", ".join(sql_literal(nombre) for nombre in TIENDAS_MODELO_2024_2026)
    return f"({tienda_expr} IN ({permitidas}))"


def sql_proveedor(expr: str) -> str:
    limpio = sql_limpiar_texto(expr, "SIN PROVEEDOR")
    return sql_mapear(limpio, PROVEEDORES_EQUIVALENCIAS, limpio)


def sql_marca(expr: str) -> str:
    limpio = sql_limpiar_texto(expr, "SIN MARCA")
    return sql_mapear(limpio, MARCAS_EQUIVALENCIAS, limpio)


def sql_rubro(expr: str) -> str:
    limpio = sql_limpiar_texto(expr, "SIN CLASIFICACIÓN")
    return sql_mapear(limpio, RUBROS_EQUIVALENCIAS, limpio)


def sql_rubro_desde_departamento(dep_expr: str, fallback_expr: str) -> str:
    casos = "\n".join(
        f"WHEN {codigo} THEN {sql_literal(rubro)}"
        for codigo, rubro in sorted(DEPARTAMENTO_RUBRO.items())
    )
    return f"CASE TRY_CAST({dep_expr} AS INTEGER)\n{casos}\nELSE {fallback_expr}\nEND"


def sql_linea(expr: str) -> str:
    limpio = sql_limpiar_texto(expr, "SIN CLASIFICACIÓN")
    return sql_mapear(limpio, LINEAS_EQUIVALENCIAS, limpio)


def sql_sublinea(expr: str) -> str:
    limpio = sql_limpiar_texto(expr, "SIN CLASIFICACIÓN")
    return sql_mapear(limpio, SUBLINEAS_EQUIVALENCIAS, limpio)


def sql_rubro_codigo(rubro_expr: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_literal(rubro)} THEN {codigo}"
        for rubro, codigo in RUBRO_CODIGOS.items()
    )
    return f"CASE {rubro_expr}\n{casos}\nELSE NULL\nEND"


def sql_hash_id(prefijo: str, expr: str, longitud: int = 16) -> str:
    return f"{sql_literal(prefijo)} || upper(substr(sha256({expr}), 1, {longitud}))"


def sql_producto_id(codigo_expr: str) -> str:
    codigo = sql_codigo(codigo_expr)
    return f"CASE WHEN {codigo} IS NULL THEN NULL ELSE {sql_hash_id('P_', codigo, 16)} END"


def sql_proveedor_id(proveedor_expr: str) -> str:
    return sql_hash_id("PRV_", sql_clave(proveedor_expr), 12)


def sql_marca_id(marca_expr: str) -> str:
    return sql_hash_id("M_", sql_clave(marca_expr), 12)


def sql_rubro_id(rubro_expr: str) -> str:
    codigo = sql_rubro_codigo(rubro_expr)
    return f"CASE WHEN {codigo} IS NOT NULL THEN 'R' || lpad(CAST({codigo} AS VARCHAR), 2, '0') ELSE {sql_hash_id('R_', sql_clave(rubro_expr), 10)} END"


def sql_linea_id(rubro_expr: str, linea_expr: str) -> str:
    clave = f"{sql_clave(rubro_expr)} || '|' || {sql_clave(linea_expr)}"
    return sql_hash_id("L_", clave, 12)


def sql_sublinea_id(rubro_expr: str, linea_expr: str, sublinea_expr: str) -> str:
    clave = f"{sql_clave(rubro_expr)} || '|' || {sql_clave(linea_expr)} || '|' || {sql_clave(sublinea_expr)}"
    return sql_hash_id("SL_", clave, 12)


def sql_clasificacion_id(rubro_expr: str, linea_expr: str, sublinea_expr: str) -> str:
    clave = f"{sql_clave(rubro_expr)} || '|' || {sql_clave(linea_expr)} || '|' || {sql_clave(sublinea_expr)}"
    return sql_hash_id("CP_", clave, 16)


def sql_fecha_id(fecha_expr: str) -> str:
    return f"CASE WHEN {fecha_expr} IS NULL THEN NULL ELSE CAST(strftime({fecha_expr}, '%Y%m%d') AS INTEGER) END"


def sql_periodo_id(fecha_expr: str) -> str:
    return f"CASE WHEN {fecha_expr} IS NULL THEN NULL ELSE CAST(strftime({fecha_expr}, '%Y%m') AS INTEGER) END"

# ==========================================================
# FUNCIONES PYTHON EQUIVALENTES A LAS REGLAS SQL MAESTRAS
# ==========================================================
# Se usan en fuentes manuales pequeñas para evitar construir árboles SQL
# excesivamente profundos. Mantienen exactamente los IDs históricos y la
# homologación centralizada utilizada por las facts RMS.

import hashlib


def limpiar_texto_python(valor: Any, default: str | None = None) -> str | None:
    """Limpia texto con la misma semántica de :func:`sql_limpiar_texto`."""
    if valor is None:
        return default
    texto = str(valor).replace("\u00a0", " ").replace("\u200b", " ")
    texto = texto.replace("\r", " ").replace("\n", " ")
    texto = re.sub(r"\s+", " ", texto).strip()
    if not texto or clave_texto(texto) in {clave_texto(x) for x in TOKENS_NULOS}:
        return default
    return texto.upper()


_TIENDAS_EQUIVALENCIAS_NORMALIZADAS = mapa_normalizado(TIENDAS_EQUIVALENCIAS)


def homologar_tienda_python(valor: Any) -> str | None:
    """Homologa una tienda con el mismo maestro usado por DuckDB."""
    limpio = limpiar_texto_python(valor)
    if limpio is None:
        return None
    return _TIENDAS_EQUIVALENCIAS_NORMALIZADAS.get(clave_texto(limpio), limpio)


def tienda_id_python(tienda: Any, estricto: bool = False) -> str | None:
    """Genera T001-T020 o un ID determinista para una tienda futura."""
    homologada = homologar_tienda_python(tienda)
    if homologada is None:
        return None
    conocida = TIENDA_IDS.get(homologada)
    if conocida:
        return conocida
    if estricto:
        return None
    clave = clave_texto(homologada)
    if not clave:
        return None
    digest = hashlib.sha256(clave.encode("utf-8")).hexdigest().upper()[:12]
    return f"T_{digest}"
