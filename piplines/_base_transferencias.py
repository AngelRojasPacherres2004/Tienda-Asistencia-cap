from __future__ import annotations

import argparse
import os
import re
import sys
import time
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from xlsx_fast import leer_filas_xlsx
from capa1_cache import limpiar_versiones_anteriores, ruta_cache
from typing import Union
import xml.etree.ElementTree as ET

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

from project_paths import PROJECT_ROOT, WORK_INTERMEDIATE_DIR, WORK_TEMP_DIR
from maestros import ANIO_INICIO_MODELO
BASE_DIR = PROJECT_ROOT
INPUT_DIR = BASE_DIR / "input"
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"

CAPA1_FINAL = CAPA1_DIR / "Fact_Transferencias.parquet"
CAPA1_TEMP = WORK_TEMP_DIR / "Fact_Transferencias_temporal.parquet"
CAPA2_FINAL = WORK_INTERMEDIATE_DIR / "FactTransferenciasLimpio.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactTransferenciasLimpio_temporal.parquet"

CACHE_VERSION_CAPA1 = "transferencias_v24_1"

# El encabezado original de los Excel está desplazado desde la columna G.
# La estructura real de los datos es A:S y se asigna de forma explícita.
COLUMNAS_TRANSFERENCIAS = [
    "FECHA",
    "ESTADO",
    "SERIE Y NRO GUIA",
    "TDA ORIGEN",
    "TDA DESTINO",
    "CODIGO NISSEI",
    "PROVEEDOR",
    "LOTE",
    "DEP",
    "LINEA",
    "SUB LINEA",
    "MARCA",
    "MODELO",
    "DESCRIPCION",
    "CANT",
    "PRECIO SUGERIDO",
    "TOTAL",
    "F.CREACION",
    "MODELO CODIGO",
]

COLUMNAS_TRAZABILIDAD = [
    "archivo_origen",
    "hoja_origen",
    "fila_origen",
    "anio_archivo",
    "fecha_modificacion_archivo",
    "fecha_procesamiento",
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

COLUMNAS_NO_PUBLICABLES_CAPA2 = {
    "archivo_origen",
    "hoja_origen",
    "fila_origen",
    "anio_archivo",
    "fecha_modificacion_archivo",
    "fecha_procesamiento",
    "fecha_limpieza",
    "motivo_revision",
    "requiere_revision",
    "posible_duplicado",
    "cantidad_duplicados",
    "orden_duplicado_exacto_interno",
    "orden_linea_repetida_interno",
    "cantidad_lineas_repetidas_interna",
    "fuente_minima_interna",
    "fuente_maxima_interna",
}

TOTAL_COLUMNAS_ORIGEN = len(COLUMNAS_TRANSFERENCIAS)
COLUMNA_FINAL_EXCEL = "S"

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


# ==========================================================
# 2. REGLAS DE NORMALIZACIÓN
# ==========================================================

TOKENS_NULOS = {
    "", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A", "X.ERROR"
}

TIENDAS_EQUIVALENCIAS = {
    # Reglas maestras compartidas por todas las fuentes.
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

    # ONLINE y ALMACÉN VIRTUAL son el mismo canal. ONLINE es el nombre canónico.
    "ONLINE": "ONLINE",
    "ALMACEN VIRTUAL": "ONLINE",
    "ALMACÉN VIRTUAL": "ONLINE",
    "ALMACEN VIRUTAL": "ONLINE",
    "ALMACÉN VIRUTAL": "ONLINE",

    "PERSHING": "PERSHING",
    "PP": "PUENTE PIEDRA",
    "PUENTE PIEDRA": "PUENTE PIEDRA",

    # PZA UNIÓN, JR UNIÓN y PUNO son tiendas distintas.
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
    "RECIBIDO": "RECIBIDO",
    "EN TRANSITO": "EN TRÁNSITO",
    "EN TRÁNSITO": "EN TRÁNSITO",
    "NO COMPLETO": "INCOMPLETO",
    "INCOMPLETO": "INCOMPLETO",
}

# Mismas equivalencias aprobadas para Ventas, más variantes detectadas
# directamente en los archivos de Transferencias 2024-2026.
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
    "SEGURO HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A.": "SEGUROS HOMECENTERS PERUANOS S.A.",
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
    "DECORACION VERANO": "DECORACIÓN VERANO",
    "PROTECCION": "PROTECCIÓN",
    "CUIDADO Y PROTECCION": "CUIDADO Y PROTECCIÓN",
    "JOYERIA Y BISUTERIA": "JOYERÍA Y BISUTERÍA",
    "JOYERÍA/ACCESORIOS": "JOYERÍA/ACCESORIOS",
    "FILMACION & FOTOGRAFIA": "FILMACIÓN Y FOTOGRAFÍA",
    "CLIMATIZACION": "CLIMATIZACIÓN",
    "ILUMINACION": "ILUMINACIÓN",
    "ACCESORIO DE COMPUTO": "ACCESORIOS DE CÓMPUTO",
    "IPADS &TABLETS": "IPADS Y TABLETS",
    "LAPTOP'S": "LAPTOPS",
    "PC´S": "PCS",
    "COCCION": "COCCIÓN",
    "FRIO": "FRÍO",
    "ARTICULOS PARA EL HOGAR": "ARTÍCULOS PARA EL HOGAR",
    "ARTICULOS DE LIMPIEZA": "ARTÍCULOS DE LIMPIEZA",
    "ARTICULOS DE FIESTA": "ARTÍCULOS DE FIESTA",
    "ARTICULOS PLAYEROS": "ARTÍCULOS PLAYEROS",
    "ARTICULO DE BAÑO": "ARTÍCULO DE BAÑO",
    "ACCESORIO BAÑO": "ACCESORIOS DE BAÑO",
    "ALMACENAMIENTO": "ALMACENAMIENTO",
    "SERVICIOS": "SERVICIOS",
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
    "ACCESORIO Y COMPLEMENTO": "ACCESORIOS Y COMPLEMENTOS",
    "ACCESORIOS Y COMPLEMENTOS": "ACCESORIOS Y COMPLEMENTOS",
    "AQUA SHOES": "AQUASHOES",
    "AQUASHOES": "AQUASHOES",
    "PISCINAS INFLABLES": "PISCINA INFLABLE",
    "PISCINA INFLABLE": "PISCINA INFLABLE",
    "COSMETICOS/MAQUILLAJE": "COSMÉTICOS/MAQUILLAJE",
    "HERVIDOR ELECTRICO": "HERVIDOR ELÉCTRICO",
    "SANDWICHERA/ WAFLERA": "SANDWICHERA/WAFLERA",
}

# DEP se comporta como código de rubro. La relación se confirmó evaluando
# sus líneas y sublíneas en los tres archivos.
DEPARTAMENTO_RUBRO = {
    "1": "TEXTIL",
    "2": "CALZADO",
    "3": "MOCHILA/MALETA/MALETÍN/CARTERA",
    "4": "DEPORTE",
    "5": "RECREACIÓN",
    "6": "HOGAR",
    "7": "CAMPING",
    "8": "PRODUCTOS VARIOS",
    "9": "JUGUETES",
    "10": "TEMPORADA",
    "11": "BAÑO Y LAVANDERÍA",
    "12": "AUDIO Y VIDEO",
    "13": "ELECTRO MENOR",
    "14": "CÓMPUTO",
    "15": "LÍNEA BLANCA",
    "16": "MUEBLE",
    "17": "FERRETERÍA",
    "18": "ALIMENTOS Y BEBIDAS",
    "19": "VARIOS",
    "20": "SERVICIOS",
    "21": "JOYAS",
    "22": "ACCESORIOS DE DEPORTE",
    "23": "TECNOLOGÍA",
    "24": "AUTOMOTRIZ",
    "25": "BELLEZA",
    "26": "JOYERÍA",
}

TIENDAS_NO_NORMALIZADAS = {
    "AGUAS VERDES", "AYA", "PP", "PU",
    "PLAZA UNION", "PLAZA UNIÓN",
    "UNION 797", "UNIÓN 797", "JR UNION",
    "EMANCIPACION",
    "ALMACEN VIRTUAL", "ALMACÉN VIRTUAL",
    "ALMACEN VIRUTAL", "ALMACÉN VIRUTAL",
}
PROVEEDORES_NO_NORMALIZADOS = {
    "CHILIA", "CHILIA S.A.", "OROTEX NORTH AMERICA INC", "ILAHI",
    "CORPORACION CARDINALE S.R.L.", "DISTRIBUIDO DEPORTIVA PUMA S.A.C.",
    "INTERSPORT S.A.C.", "LG ELECTRONICS PERU S.A.",
}
MARCAS_NO_NORMALIZADAS = {
    "HITECH", "AIR WALK", "POLO RALPH LAUREN", "BOSS",
    "MIA BY APOLO", "APOLITO", "LA COSTE"
}


def numero_a_letras(n: int) -> str:
    """Convierte número de columna (base 1) a letras Excel (A, B, …, AA, AB, …)."""
    result = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(ord("A") + rem) + result
    return result


def _clave_encabezado(valor: str) -> str:
    """Normaliza encabezado para comparación flexible."""
    texto = str(valor).replace("_x000a_", " ").replace("\n", " ").replace("\r", " ")
    return re.sub(r"\s+", " ", texto.strip().upper())


def _mapear_columnas_por_nombre(
    columnas_reales: tuple[str, ...],
    columnas_esperadas: list[str],
) -> dict[str, int | None]:
    """Mapea columnas esperadas a posiciones reales (0-base) por nombre.

    Prioridad:
    1. Coincidencia exacta normalizada.
    2. El nombre esperado es prefijo del nombre real.
    Devuelve None para columnas sin correspondencia -> SELECT emite NULL.
    """
    claves_reales = [_clave_encabezado(c) for c in columnas_reales]
    resultado: dict[str, int | None] = {}
    for esperada in columnas_esperadas:
        clave_esp = _clave_encabezado(esperada)
        if clave_esp in claves_reales:
            resultado[esperada] = claves_reales.index(clave_esp)
            continue
        encontrado = next(
            (i for i, cr in enumerate(claves_reales) if cr.startswith(clave_esp + " ")),
            None,
        )
        resultado[esperada] = encontrado
    return resultado


# Columnas estables para detectar si la fila 1 es encabezado de transferencias.
# Se usan índices 1-3 (ESTADO, SERIE Y NRO GUIA, TDA ORIGEN) porque col 1 puede
# tener typos como "FECHA TRANSFERNCIA" en lugar de "FECHA".
_COLS_ESTABLES_HEADER_TRANF_SLICE = slice(1, 4)
_VALS_ESTABLES_HEADER_TRANF = ["ESTADO", "SERIE Y NRO GUIA", "TDA ORIGEN"]


@dataclass(frozen=True)
class HojaExcel:
    archivo: Path
    nombre: str
    ultima_fila: int
    tiene_encabezado: bool
    anio_archivo: int
    fecha_modificacion: datetime
    columnas_reales: tuple[str, ...]  # encabezados reales; () = modo posicional estricto
    ultima_columna_excel: str         # última columna real (p. ej. "Q" para 17 cols)

    @property
    def fila_inicio(self) -> int:
        return 2 if self.tiene_encabezado else 1

    @property
    def rango_datos(self) -> str:
        col_final = self.ultima_columna_excel or COLUMNA_FINAL_EXCEL
        return f"A{self.fila_inicio}:{col_final}{self.ultima_fila}"

    @property
    def filas_datos_esperadas(self) -> int:
        return max(0, self.ultima_fila - self.fila_inicio + 1)



# ==========================================================
# 3. FUNCIONES AUXILIARES
# ==========================================================


def preparar_carpetas() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def sql_texto(valor: Union[str, Path]) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def sql_identificador(nombre: str) -> str:
    return '"' + nombre.replace('"', '""') + '"'


def normalizar_encabezado(valor: object) -> str:
    texto = "" if valor is None else str(valor)
    texto = texto.replace("_x000a_", " ").replace("\n", " ").replace("\r", " ")
    return re.sub(r"\s+", " ", texto.strip().upper())


def normalizar_clave_python(valor: str) -> str:
    texto = unicodedata.normalize("NFKD", str(valor).upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_diccionario(diccionario: dict[str, str]) -> dict[str, str]:
    return {normalizar_clave_python(k): v for k, v in diccionario.items()}


def extraer_anio_archivo(archivo: Path) -> int:
    coincidencias = re.findall(r"(?:19|20)\d{2}", archivo.stem)
    if not coincidencias:
        raise ValueError(
            f"No se encontró un año de cuatro dígitos en el nombre: {archivo.name}"
        )
    return int(coincidencias[-1])


def letras_a_numero(columna: str) -> int:
    numero = 0
    for caracter in columna.upper():
        if not ("A" <= caracter <= "Z"):
            raise ValueError(f"Columna Excel inválida: {columna}")
        numero = numero * 26 + (ord(caracter) - ord("A") + 1)
    return numero


def analizar_dimension(referencia: str) -> tuple[int, int]:
    ultima_celda = referencia.split(":")[-1]
    coincidencia = re.fullmatch(r"([A-Za-z]+)(\d+)", ultima_celda)
    if not coincidencia:
        raise ValueError(f"Dimensión de hoja no reconocida: {referencia}")
    letras, fila = coincidencia.groups()
    return letras_a_numero(letras), int(fila)


def obtener_hojas_desde_xlsx(archivo: Path) -> list[tuple[str, int, int]]:
    with zipfile.ZipFile(archivo) as libro:
        nombres_zip = {nombre.lower(): nombre for nombre in libro.namelist()}
        workbook_xml = ET.fromstring(libro.read("xl/workbook.xml"))
        relaciones_xml = ET.fromstring(libro.read("xl/_rels/workbook.xml.rels"))
        relaciones = {
            elemento.attrib["Id"]: elemento.attrib["Target"]
            for elemento in relaciones_xml
        }

        hojas: list[tuple[str, int, int]] = []
        contenedor = workbook_xml.find(f"{{{NS_MAIN}}}sheets")
        if contenedor is None:
            return hojas

        for hoja in contenedor:
            nombre_hoja = hoja.attrib["name"]
            relacion_id = hoja.attrib[f"{{{NS_REL_OFFICE}}}id"]
            destino = relaciones[relacion_id]
            ruta_xml = (
                destino.lstrip("/")
                if destino.startswith("/")
                else f"xl/{destino}".replace("xl//", "xl/")
            )
            ruta_real = nombres_zip.get(ruta_xml.lower())
            if ruta_real is None:
                raise FileNotFoundError(
                    f"No se encontró la hoja {nombre_hoja} dentro de {archivo.name}."
                )

            dimension = None
            with libro.open(ruta_real) as flujo:
                for _, elemento in ET.iterparse(flujo, events=("start",)):
                    if elemento.tag == f"{{{NS_MAIN}}}dimension":
                        dimension = elemento.attrib.get("ref")
                        break

            if not dimension:
                print(f"  - Se omite '{nombre_hoja}': no tiene dimensión.")
                continue

            cantidad_columnas, ultima_fila = analizar_dimension(dimension)
            if ultima_fila < 1:
                continue
            if cantidad_columnas > TOTAL_COLUMNAS_ORIGEN:
                print(
                    f"  - Aviso: {nombre_hoja} tiene {cantidad_columnas} columnas; "
                    f"se procesarán únicamente A:{COLUMNA_FINAL_EXCEL}."
                )
                cantidad_columnas = TOTAL_COLUMNAS_ORIGEN
            elif cantidad_columnas < TOTAL_COLUMNAS_ORIGEN:
                print(
                    f"  - Aviso: {nombre_hoja} tiene {cantidad_columnas} columnas "
                    f"(esperadas {TOTAL_COLUMNAS_ORIGEN}); columnas faltantes -> NULL."
                )

            col_final_real = numero_a_letras(cantidad_columnas)
            hojas.append((nombre_hoja, ultima_fila, cantidad_columnas, col_final_real))
        return hojas



def buscar_archivos_transferencias() -> list[Path]:
    archivos: list[Path] = []
    for archivo in INPUT_DIR.glob("*.xlsx"):
        if archivo.name.startswith("~$"):
            continue
        clave = normalizar_clave_python(archivo.stem)
        if (
            "TRANF" in clave
            or "TRANSF" in clave
            or "TRANSFERENCIA" in clave
            or "TRANSFERENCIAS" in clave
        ):
            archivos.append(archivo)
    archivos.sort()
    if not archivos:
        raise FileNotFoundError(
            f"No se encontraron archivos TRANF/TRANSFERENCIAS .xlsx en: {INPUT_DIR}"
        )
    return archivos


def crear_conexion(cargar_excel: bool) -> duckdb.DuckDBPyConnection:
    conexion = duckdb.connect(database=":memory:")
    configurar_duckdb(conexion, BASE_DIR, preserve_insertion_order=False)
    if cargar_excel:
        try:
            conexion.execute("LOAD excel")
        except Exception:
            print("Instalando la extensión 'excel' de DuckDB por primera vez...")
            try:
                conexion.execute("INSTALL excel")
                conexion.execute("LOAD excel")
            except Exception as exc:
                cerrar_duckdb_seguro(conexion)
                raise RuntimeError(
                    "No se pudo instalar/cargar la extensión Excel de DuckDB. "
                    "Comprueba tu conexión a Internet."
                ) from exc
    return conexion


def consulta_read_xlsx(archivo: Path, hoja: str, rango: str) -> str:
    # Siempre se lee sin encabezado porque el encabezado RMS está desplazado.
    return (
        "read_xlsx("
        f"{sql_texto(archivo.as_posix())}, "
        f"sheet = {sql_texto(hoja)}, "
        f"range = {sql_texto(rango)}, "
        "header = false, "
        "all_varchar = true, "
        "stop_at_empty = false"
        ")"
    )


def detectar_encabezado(
    conexion: duckdb.DuckDBPyConnection, archivo: Path, hoja: str
) -> tuple[bool, list[str]]:
    """Detecta si la fila 1 es encabezado; devuelve (tiene_enc, headers_reales).

    Compara sólo las columnas estables 2-4 (ESTADO, SERIE Y NRO GUIA, TDA ORIGEN)
    para tolerar variaciones en la columna 1 (p. ej. "FECHA TRANSFERNCIA" en lugar
    de "FECHA"). Lee hasta TOTAL_COLUMNAS_ORIGEN columnas para obtener todos los
    headers reales disponibles y pasarlos al mapeo por nombre.
    """
    del conexion
    filas = leer_filas_xlsx(archivo, hoja, max_filas=1, max_columnas=TOTAL_COLUMNAS_ORIGEN)
    primera_fila = filas[0] if filas else None
    if not primera_fila or len(primera_fila) < 4:
        raise ValueError(
            f"No se pudo leer la primera fila de {archivo.name} / {hoja}."
        )
    recibido = [
        normalizar_encabezado(x)
        for x in primera_fila[_COLS_ESTABLES_HEADER_TRANF_SLICE]
    ]
    tiene_enc = recibido == _VALS_ESTABLES_HEADER_TRANF
    return tiene_enc, list(primera_fila) if tiene_enc else []



def obtener_columnas_lectura(
    conexion: duckdb.DuckDBPyConnection, origen_sql: str
) -> list[str]:
    descripcion = conexion.execute(f"DESCRIBE SELECT * FROM {origen_sql}").fetchall()
    columnas = [fila[0] for fila in descripcion]
    if len(columnas) != TOTAL_COLUMNAS_ORIGEN:
        raise ValueError(
            f"DuckDB detectó {len(columnas)} columnas; "
            f"se esperaban {TOTAL_COLUMNAS_ORIGEN}."
        )
    return columnas


# ==========================================================
# 4. CAPA 1: EXCEL -> PARQUET CONSOLIDADO
# ==========================================================


def inspeccionar_fuentes(
    conexion: duckdb.DuckDBPyConnection, archivos: list[Path]
) -> list[HojaExcel]:
    resultado: list[HojaExcel] = []
    print("\nInspeccionando archivos y hojas de Transferencias...")

    for archivo in archivos:
        anio = extraer_anio_archivo(archivo)
        fecha_modificacion = datetime.fromtimestamp(archivo.stat().st_mtime)
        hojas_estructura = obtener_hojas_desde_xlsx(archivo)
        if not hojas_estructura:
            raise ValueError(f"El archivo no contiene hojas utilizables: {archivo.name}")

        print(f"\n{archivo.name}")
        for nombre_hoja, ultima_fila, _, col_final_real in hojas_estructura:
            tiene_encabezado, headers_reales = detectar_encabezado(
                conexion, archivo, nombre_hoja
            )
            hoja = HojaExcel(
                archivo=archivo,
                nombre=nombre_hoja,
                ultima_fila=ultima_fila,
                tiene_encabezado=tiene_encabezado,
                anio_archivo=anio,
                fecha_modificacion=fecha_modificacion,
                columnas_reales=tuple(headers_reales),
                ultima_columna_excel=col_final_real,
            )
            if hoja.filas_datos_esperadas <= 0:
                print(f"  - Se omite {nombre_hoja}: no contiene datos.")
                continue
            resultado.append(hoja)
            tipo = "con encabezado" if tiene_encabezado else "sin encabezado"
            ncols_real = len(headers_reales) if headers_reales else TOTAL_COLUMNAS_ORIGEN
            aviso = (
                f" [{ncols_real}/{TOTAL_COLUMNAS_ORIGEN} cols, faltantes->NULL]"
                if ncols_real < TOTAL_COLUMNAS_ORIGEN else ""
            )
            print(
                f"  - {nombre_hoja}: {hoja.rango_datos} | {tipo}{aviso} | "
                f"filas esperadas: {hoja.filas_datos_esperadas:,}"
            )
    return resultado



def construir_select_hoja(
    conexion: duckdb.DuckDBPyConnection,
    hoja: HojaExcel,
    fecha_procesamiento: datetime,
) -> str:
    """Genera el SELECT DuckDB para una hoja de transferencias.

    Usa mapeo por nombre cuando el archivo tiene encabezados (columnas_reales no vacío):
    - Alias posicionales col_1, col_2, … para las columnas reales del archivo.
    - Cada columna esperada se resuelve por nombre (exacto o prefijo).
    - Columnas ausentes (p. ej. F.CREACION y MODELO CODIGO en archivos A:Q) -> NULL.
    Modo posicional estricto solo para archivos sin fila de encabezado.
    """
    del conexion
    origen = consulta_read_xlsx(
        hoja.archivo,
        hoja.nombre,
        hoja.rango_datos,
    )
    fecha_proceso_sql = fecha_procesamiento.strftime("%Y-%m-%d %H:%M:%S.%f")
    fecha_mod_sql = hoja.fecha_modificacion.strftime("%Y-%m-%d %H:%M:%S.%f")
    desplazamiento = hoja.fila_inicio - 1

    if hoja.columnas_reales:
        # Modo por nombre: alias posicionales para las columnas reales.
        num_cols = len(hoja.columnas_reales)
        alias_posicionales = [f"col_{i + 1}" for i in range(num_cols)]
        alias_columnas = ", ".join(sql_identificador(a) for a in alias_posicionales)
        mapa = _mapear_columnas_por_nombre(hoja.columnas_reales, COLUMNAS_TRANSFERENCIAS)
        expresiones = []
        for nombre in COLUMNAS_TRANSFERENCIAS:
            pos = mapa.get(nombre)
            if pos is not None:
                src = sql_identificador(f"col_{pos + 1}")
                expresiones.append(
                    f"CAST({src} AS VARCHAR) AS {sql_identificador(nombre)}"
                )
            else:
                expresiones.append(f"NULL::VARCHAR AS {sql_identificador(nombre)}")
    else:
        # Modo posicional estricto (archivos sin encabezado, esquema completo).
        alias_columnas = ", ".join(
            sql_identificador(c) for c in COLUMNAS_TRANSFERENCIAS
        )
        expresiones = [
            f"CAST({sql_identificador(nombre)} AS VARCHAR) "
            f"AS {sql_identificador(nombre)}"
            for nombre in COLUMNAS_TRANSFERENCIAS
        ]

    expresiones.extend(
        [
            f"{sql_texto(hoja.archivo.name)}::VARCHAR AS archivo_origen",
            f"{sql_texto(hoja.nombre)}::VARCHAR AS hoja_origen",
            f"(row_number() OVER () + {desplazamiento})::BIGINT AS fila_origen",
            f"{hoja.anio_archivo}::INTEGER AS anio_archivo",
            f"TIMESTAMP {sql_texto(fecha_mod_sql)} AS fecha_modificacion_archivo",
            f"TIMESTAMP {sql_texto(fecha_proceso_sql)} AS fecha_procesamiento",
        ]
    )
    return ("SELECT\n    " + ",\n    ".join(expresiones) + f"\nFROM {origen} AS src({alias_columnas})")



def crear_capa1(conexion: duckdb.DuckDBPyConnection, hojas: list[HojaExcel]) -> None:
    """Consolida Capa 1 con cache incremental por archivo RMS."""
    CAPA1_TEMP.unlink(missing_ok=True)
    fecha_procesamiento = datetime.now()
    forzar_cache = os.getenv("ETL_FORCE_C1_CACHE", "0") == "1"

    por_archivo: dict[Path, list[HojaExcel]] = {}
    for hoja in hojas:
        por_archivo.setdefault(hoja.archivo, []).append(hoja)

    caches: list[Path] = []
    for archivo, hojas_archivo in por_archivo.items():
        cache = ruta_cache(
            "transferencias", archivo, CACHE_VERSION_CAPA1, Path(__file__)
        )
        if cache.exists() and cache.stat().st_size > 0 and not forzar_cache:
            print(f"[CACHE C1] {archivo.name}: reutilizado", flush=True)
            caches.append(cache)
            continue
        temporal_cache = cache.with_suffix(".temporal.parquet")
        temporal_cache.unlink(missing_ok=True)
        consultas = [
            construir_select_hoja(conexion, hoja, fecha_procesamiento)
            for hoja in hojas_archivo
        ]
        union_sql = "\nUNION ALL\n".join(consultas)
        print(f"[CACHE C1] {archivo.name}: leyendo Excel una sola vez...", flush=True)
        conexion.execute(
            f"""
            COPY ({union_sql})
            TO {sql_texto(temporal_cache.as_posix())}
            (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
            """
        )
        if not temporal_cache.exists() or temporal_cache.stat().st_size == 0:
            raise RuntimeError(f"No se generó cache válido para {archivo.name}")
        os.replace(temporal_cache, cache)
        limpiar_versiones_anteriores(cache)
        caches.append(cache)

    if not caches:
        raise RuntimeError("No se generaron fuentes cacheadas de Transferencias.")
    union_cache = "\nUNION ALL\n".join(
        f"SELECT * FROM read_parquet({sql_texto(cache.as_posix())})"
        for cache in caches
    )
    print("\nGenerando Capa 1 consolidada desde cache incremental...")
    print(f"Salida temporal: {CAPA1_TEMP}")
    inicio = time.perf_counter()
    try:
        conexion.execute(
            f"""
            COPY ({union_cache})
            TO {sql_texto(CAPA1_TEMP.as_posix())}
            (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
            """
        )
    except Exception:
        CAPA1_TEMP.unlink(missing_ok=True)
        raise
    print(
        f"Parquet temporal creado en {(time.perf_counter() - inicio) / 60:.2f} minutos."
    )


def validar_y_publicar_capa1(
    conexion: duckdb.DuckDBPyConnection, hojas: list[HojaExcel]
) -> dict[str, int]:
    if not CAPA1_TEMP.exists() or CAPA1_TEMP.stat().st_size == 0:
        raise RuntimeError("El archivo temporal de Capa 1 no existe o está vacío.")

    origen = f"read_parquet({sql_texto(CAPA1_TEMP.as_posix())})"
    filas = conexion.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    esperadas = COLUMNAS_TRANSFERENCIAS + COLUMNAS_TRAZABILIDAD
    if nombres != esperadas:
        raise RuntimeError(
            "Las columnas de Capa 1 no coinciden con el esquema esperado.\n"
            f"Esperado: {esperadas}\nObtenido: {nombres}"
        )

    filas_esperadas = sum(hoja.filas_datos_esperadas for hoja in hojas)
    if filas != filas_esperadas:
        raise RuntimeError(
            f"Filas esperadas: {filas_esperadas:,}; obtenidas: {filas:,}."
        )

    incompletas = conexion.execute(
        f"""
        SELECT COUNT(*) FROM {origen}
        WHERE archivo_origen IS NULL OR hoja_origen IS NULL
           OR fila_origen IS NULL OR anio_archivo IS NULL
           OR fecha_modificacion_archivo IS NULL OR fecha_procesamiento IS NULL
        """
    ).fetchone()[0]
    if incompletas:
        raise RuntimeError(f"Se encontraron {incompletas:,} filas sin trazabilidad.")

    os.replace(CAPA1_TEMP, CAPA1_FINAL)
    return {
        "archivos": len({hoja.archivo for hoja in hojas}),
        "hojas": len(hojas),
        "filas": filas,
        "columnas": len(esquema),
        "tamano_bytes": CAPA1_FINAL.stat().st_size,
    }


def verificar_capa1(
    conexion: duckdb.DuckDBPyConnection, mostrar_detalle: bool = True
) -> dict[str, int]:
    if not CAPA1_FINAL.exists() or CAPA1_FINAL.stat().st_size == 0:
        raise FileNotFoundError(
            f"No existe una Capa 1 válida en: {CAPA1_FINAL}. "
            "Ejecuta primero --solo-capa1."
        )

    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_TRANSFERENCIAS + COLUMNAS_TRAZABILIDAD:
        raise RuntimeError("Fact_Transferencias.parquet tiene un esquema inesperado.")

    filas = conexion.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas <= 0:
        raise RuntimeError("Fact_Transferencias.parquet está vacío.")

    if mostrar_detalle:
        print("\nDistribución por archivo y hoja:")
        detalle = conexion.execute(
            f"""
            SELECT archivo_origen, hoja_origen, COUNT(*)
            FROM {origen}
            GROUP BY 1, 2
            ORDER BY 1, 2
            """
        ).fetchall()
        for archivo, hoja, cantidad in detalle:
            print(f"  - {archivo} / {hoja}: {cantidad:,} filas")

        print("\nMuestra de Capa 1:")
        muestra = conexion.execute(
            f"""
            SELECT "FECHA", "SERIE Y NRO GUIA", "TDA ORIGEN",
                   "TDA DESTINO", "CODIGO NISSEI", "PROVEEDOR",
                   "CANT", "TOTAL"
            FROM {origen}
            LIMIT 5
            """
        ).fetchall()
        for fila in muestra:
            print("  ", fila)

    return {
        "filas": filas,
        "columnas": len(esquema),
        "tamano_bytes": CAPA1_FINAL.stat().st_size,
    }


# ==========================================================
# 5. EXPRESIONES SQL DE LIMPIEZA
# ==========================================================


def sql_limpiar_texto(expresion: str, mayusculas: bool = True) -> str:
    # Quita NBSP, saltos, caracteres invisibles y espacios repetidos.
    texto = f"CAST({expresion} AS VARCHAR)"
    texto = f"replace({texto}, {sql_texto(chr(160))}, ' ')"
    texto = f"replace({texto}, {sql_texto(chr(8203))}, '')"
    texto = f"replace({texto}, '_x000a_', ' ')"
    texto = f"replace(replace({texto}, chr(13), ' '), chr(10), ' ')"
    texto = f"NULLIF(regexp_replace(trim({texto}), '\\s+', ' ', 'g'), '')"
    return f"upper({texto})" if mayusculas else texto


def sql_clave(expresion: str) -> str:
    texto = f"upper(COALESCE(CAST({expresion} AS VARCHAR), ''))"
    for origen, destino in [
        ("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U"),
        ("Ü", "U"), ("Ñ", "N"),
    ]:
        texto = f"replace({texto}, {sql_texto(origen)}, {sql_texto(destino)})"
    texto = f"regexp_replace({texto}, '[^A-Z0-9]+', ' ', 'g')"
    return f"trim(regexp_replace({texto}, '\\s+', ' ', 'g'))"


def sql_mapear(expresion: str, diccionario: dict[str, str], fallback: str) -> str:
    normalizado = normalizar_diccionario(diccionario)
    clave = sql_clave(expresion)
    casos = "\n".join(
        f"WHEN {sql_texto(k)} THEN {sql_texto(v)}"
        for k, v in sorted(normalizado.items())
    )
    return f"CASE {clave}\n{casos}\nELSE {fallback}\nEND"


def sql_clave_pertenece(expresion: str, valores: set[str] | list[str]) -> str:
    claves = sorted({normalizar_clave_python(v) for v in valores})
    lista = ", ".join(sql_texto(v) for v in claves)
    return f"{sql_clave(expresion)} IN ({lista})"


def sql_limpiar_identificador(expresion: str) -> str:
    limpio = sql_limpiar_texto(expresion, mayusculas=True)
    return f"""
    CASE
        WHEN {limpio} IS NULL THEN NULL
        WHEN {sql_clave(limpio)} IN ('N A', 'NA', 'NULL', 'NONE') THEN NULL
        WHEN regexp_full_match({limpio}, '^[0-9]{{1,3}}(,[0-9]{{3}})+$')
            THEN replace({limpio}, ',', '')
        WHEN regexp_full_match({limpio}, '^[0-9]+\\.0+$')
            THEN regexp_replace({limpio}, '\\.0+$', '')
        ELSE {limpio}
    END
    """


def sql_numero(expresion: str) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"
    upper_raw = f"upper({raw})"
    nulos = ", ".join(sql_texto(x) for x in sorted(TOKENS_NULOS))
    decimal_punto = f"replace({raw}, ',', '.')"
    limpio = f"regexp_replace({raw}, '[^0-9,\\.\\-\\(\\)eE+]', '', 'g')"
    sin_parentesis = f"replace(replace({limpio}, '(', ''), ')', '')"
    firmado = (
        f"CASE WHEN {limpio} LIKE '(%' AND {limpio} LIKE '%)' "
        f"THEN '-' || {sin_parentesis} ELSE {sin_parentesis} END"
    )
    return f"""
    CASE
        WHEN {raw} IS NULL OR {upper_raw} IN ({nulos}) THEN NULL
        WHEN regexp_full_match({decimal_punto},
             '^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)[eE][+-]?[0-9]+$')
            THEN TRY_CAST({decimal_punto} AS DOUBLE)
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


def sql_fecha_excel(expresion: str) -> str:
    raw = sql_limpiar_texto(expresion, mayusculas=False)
    numero = f"TRY_CAST(replace({raw}, ',', '.') AS DOUBLE)"
    return f"""
    CASE
        WHEN {raw} IS NULL THEN NULL
        WHEN regexp_full_match({raw}, '^[0-9]+([.,][0-9]+)?$')
             AND {numero} BETWEEN 1 AND 80000
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


def sql_rubro_departamento(expresion: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_texto(codigo)} THEN {sql_texto(rubro)}"
        for codigo, rubro in sorted(
            DEPARTAMENTO_RUBRO.items(), key=lambda x: int(x[0])
        )
    )
    return f"CASE CAST({expresion} AS VARCHAR)\n{casos}\nELSE 'N/A'\nEND"


# ==========================================================
# 6. CAPA 2: LIMPIEZA, REGLAS Y DEPURACIÓN
# ==========================================================


def construir_sql_capa2() -> str:
    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"

    tienda_origen_mapeada = sql_mapear(
        "tienda_origen_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen_origen"
    )
    tienda_destino_mapeada = sql_mapear(
        "tienda_destino_origen", TIENDAS_EQUIVALENCIAS, "tienda_destino_origen"
    )
    proveedor_mapeado = sql_mapear(
        "proveedor_origen", PROVEEDORES_EQUIVALENCIAS, "proveedor_origen"
    )
    marca_mapeada = sql_mapear(
        "marca_origen", MARCAS_EQUIVALENCIAS, "marca_origen"
    )
    linea_mapeada = sql_mapear(
        "linea_origen", LINEAS_EQUIVALENCIAS, "linea_origen"
    )
    sublinea_mapeada = sql_mapear(
        "sub_linea_origen", SUBLINEAS_EQUIVALENCIAS, "sub_linea_origen"
    )
    estado_mapeado = sql_mapear(
        "estado_origen", ESTADOS_EQUIVALENCIAS, "estado_origen"
    )

    return f"""
    WITH raw AS (
        SELECT
            {sql_limpiar_texto(sql_identificador('FECHA'), False)} AS fecha_transferencia_origen,
            {sql_limpiar_texto(sql_identificador('ESTADO'))} AS estado_origen,
            {sql_limpiar_identificador(sql_identificador('SERIE Y NRO GUIA'))} AS nro_guia_origen,
            {sql_limpiar_texto(sql_identificador('TDA ORIGEN'))} AS tienda_origen_origen,
            {sql_limpiar_texto(sql_identificador('TDA DESTINO'))} AS tienda_destino_origen,
            {sql_limpiar_identificador(sql_identificador('CODIGO NISSEI'))} AS codigo_nissei_origen,
            {sql_limpiar_texto(sql_identificador('PROVEEDOR'))} AS proveedor_origen,
            {sql_limpiar_identificador(sql_identificador('LOTE'))} AS lote_origen,
            {sql_limpiar_identificador(sql_identificador('DEP'))} AS departamento_codigo_origen,
            {sql_limpiar_texto(sql_identificador('LINEA'))} AS linea_origen,
            {sql_limpiar_texto(sql_identificador('SUB LINEA'))} AS sub_linea_origen,
            {sql_limpiar_texto(sql_identificador('MARCA'))} AS marca_origen,
            {sql_limpiar_texto(sql_identificador('MODELO'))} AS modelo_origen,
            {sql_limpiar_texto(sql_identificador('DESCRIPCION'))} AS descripcion_origen,
            {sql_limpiar_texto(sql_identificador('CANT'), False)} AS cantidad_origen,
            {sql_limpiar_texto(sql_identificador('PRECIO SUGERIDO'), False)} AS precio_sugerido_origen,
            {sql_limpiar_texto(sql_identificador('TOTAL'), False)} AS total_origen,
            {sql_limpiar_texto(sql_identificador('F.CREACION'), False)} AS fecha_creacion_origen,
            {sql_limpiar_texto(sql_identificador('MODELO CODIGO'))} AS modelo_codigo_origen,
            archivo_origen,
            hoja_origen,
            fila_origen,
            anio_archivo,
            fecha_modificacion_archivo,
            fecha_procesamiento
        FROM {origen}
    ),
    tipado AS (
        SELECT
            *,
            {sql_fecha_excel('fecha_transferencia_origen')} AS fecha_hora_transferencia,
            {sql_fecha_excel('fecha_creacion_origen')} AS fecha_hora_creacion,
            TRY_CAST(({sql_numero('cantidad_origen')}) AS DECIMAL(20, 4)) AS cantidad,
            TRY_CAST(({sql_numero('precio_sugerido_origen')}) AS DECIMAL(20, 4)) AS precio_sugerido,
            TRY_CAST(({sql_numero('total_origen')}) AS DECIMAL(20, 4)) AS total_origen_numero,
            COALESCE({estado_mapeado}, 'N/A') AS estado_transferencia,
            COALESCE({tienda_origen_mapeada}, 'N/A') AS tienda_origen,
            COALESCE({tienda_destino_mapeada}, 'N/A') AS tienda_destino,
            COALESCE({proveedor_mapeado}, 'N/A') AS proveedor,
            COALESCE({marca_mapeada}, 'N/A') AS marca,
            COALESCE({linea_mapeada}, 'N/A') AS linea_preliminar,
            COALESCE({sublinea_mapeada}, 'N/A') AS sub_linea_preliminar
        FROM raw
    ),
    corregido AS (
        SELECT
            *,
            CASE
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR52'
                    THEN 'SIN CÓDIGO'
                ELSE codigo_nissei_origen
            END AS codigo_nissei,
            COALESCE(nro_guia_origen, 'SIN GUÍA') AS nro_guia,
            COALESCE(lote_origen, 'N/A') AS lote,
            CASE
                WHEN codigo_nissei_origen = '0000000000017'
                     OR descripcion_origen LIKE '%PIJAMA%'
                    THEN '1'
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR52'
                     OR descripcion_origen LIKE '%TRACKSUIT%'
                    THEN '1'
                ELSE departamento_codigo_origen
            END AS departamento_codigo,
            CASE
                WHEN codigo_nissei_origen = '0000000000017'
                     OR descripcion_origen LIKE '%PIJAMA%'
                    THEN 'ROPA DAMA'
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR52'
                     OR descripcion_origen LIKE '%TRACKSUIT%'
                    THEN 'ROPA DAMA'
                ELSE linea_preliminar
            END AS linea,
            CASE
                WHEN codigo_nissei_origen = '0000000000017'
                     OR descripcion_origen LIKE '%PIJAMA%'
                    THEN 'PIJAMA'
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR52'
                     OR descripcion_origen LIKE '%TRACKSUIT%'
                    THEN 'CONJUNTO'
                ELSE sub_linea_preliminar
            END AS sub_linea,
            COALESCE(modelo_origen, 'N/A') AS modelo,
            COALESCE(descripcion_origen, 'N/A') AS descripcion,
            COALESCE(modelo_codigo_origen, 'N/A') AS modelo_codigo,
            CASE
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR50'
                     AND {sql_clave('linea_origen')} = 'ERROR'
                     AND {sql_clave('sub_linea_origen')} = 'ERROR'
                    THEN TRUE
                ELSE FALSE
            END AS registro_descartable
        FROM tipado
    ),
    enriquecido AS (
        SELECT
            *,
            {sql_rubro_departamento('departamento_codigo')} AS rubro,
            CASE
                WHEN cantidad IS NOT NULL AND precio_sugerido IS NOT NULL
                    THEN TRY_CAST(cantidad * precio_sugerido AS DECIMAL(20, 4))
                ELSE total_origen_numero
            END AS total_transferencia,
            CAST(fecha_hora_transferencia AS DATE) AS fecha_transferencia,
            CAST(fecha_hora_transferencia AS TIME) AS hora_transferencia,
            date_part('day', fecha_hora_transferencia)::INTEGER AS dia_transferencia,
            date_part('month', fecha_hora_transferencia)::INTEGER AS mes_numero_transferencia,
            {sql_nombre_mes("date_part('month', fecha_hora_transferencia)::INTEGER")} AS mes_nombre_transferencia,
            date_part('quarter', fecha_hora_transferencia)::INTEGER AS trimestre_transferencia,
            date_part('year', fecha_hora_transferencia)::INTEGER AS anio_transferencia,
            date_part('week', fecha_hora_transferencia)::INTEGER AS semana_transferencia,
            date_part('isodow', fecha_hora_transferencia)::INTEGER AS dia_semana_numero,
            {sql_nombre_dia("date_part('isodow', fecha_hora_transferencia)::INTEGER")} AS dia_semana_nombre,
            CAST(fecha_hora_creacion AS DATE) AS fecha_creacion
        FROM corregido
    ),
    validos AS (
        -- Elimina pies de reporte, fila Totals y registros sin estructura de transferencia.
        SELECT *
        FROM enriquecido
        WHERE fecha_hora_transferencia IS NOT NULL
          AND fecha_transferencia BETWEEN make_date({ANIO_INICIO_MODELO}, 1, 1)
                                      AND CURRENT_DATE + INTERVAL '2 years'
          AND tienda_origen <> 'N/A'
          AND tienda_destino <> 'N/A'
          AND codigo_nissei IS NOT NULL
          AND cantidad IS NOT NULL
          AND cantidad > 0
          AND precio_sugerido IS NOT NULL
          AND total_transferencia IS NOT NULL
          AND NOT registro_descartable
    ),
    duplicados_exactos AS (
        SELECT
            *,
            ROW_NUMBER() OVER (
                PARTITION BY
                    fecha_hora_transferencia, estado_transferencia, nro_guia,
                    tienda_origen, tienda_destino, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo, descripcion, modelo_codigo, cantidad,
                    precio_sugerido, total_transferencia, fecha_hora_creacion
                ORDER BY fecha_modificacion_archivo DESC,
                         archivo_origen DESC,
                         hoja_origen ASC,
                         fila_origen ASC
            )::BIGINT AS orden_duplicado_exacto_interno
        FROM validos
    ),
    sin_duplicados_exactos AS (
        SELECT * EXCLUDE (orden_duplicado_exacto_interno)
        FROM duplicados_exactos
        WHERE orden_duplicado_exacto_interno = 1
    ),
    lineas_repetidas AS (
        -- Criterio estricto: misma guía, ruta, artículo, clasificación,
        -- cantidad, precio, total y fecha de creación.
        -- Solo elimina la copia adicional si proviene de otro archivo u hoja,
        -- evitando borrar líneas legítimas repetidas dentro de una misma fuente.
        SELECT
            *,
            COUNT(*) OVER (
                PARTITION BY
                    fecha_hora_transferencia, estado_transferencia, nro_guia,
                    tienda_origen, tienda_destino, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad, precio_sugerido,
                    total_transferencia, fecha_hora_creacion
            )::BIGINT AS cantidad_lineas_repetidas_interna,
            MIN(archivo_origen || '|' || hoja_origen) OVER (
                PARTITION BY
                    fecha_hora_transferencia, estado_transferencia, nro_guia,
                    tienda_origen, tienda_destino, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad, precio_sugerido,
                    total_transferencia, fecha_hora_creacion
            ) AS fuente_minima_interna,
            MAX(archivo_origen || '|' || hoja_origen) OVER (
                PARTITION BY
                    fecha_hora_transferencia, estado_transferencia, nro_guia,
                    tienda_origen, tienda_destino, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad, precio_sugerido,
                    total_transferencia, fecha_hora_creacion
            ) AS fuente_maxima_interna,
            ROW_NUMBER() OVER (
                PARTITION BY
                    fecha_hora_transferencia, estado_transferencia, nro_guia,
                    tienda_origen, tienda_destino, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad, precio_sugerido,
                    total_transferencia, fecha_hora_creacion
                ORDER BY fecha_modificacion_archivo DESC,
                         archivo_origen DESC,
                         hoja_origen ASC,
                         fila_origen ASC
            )::BIGINT AS orden_linea_repetida_interno
        FROM sin_duplicados_exactos
    ),
    sin_lineas_repetidas AS (
        SELECT * EXCLUDE (
            cantidad_lineas_repetidas_interna,
            fuente_minima_interna,
            fuente_maxima_interna,
            orden_linea_repetida_interno
        )
        FROM lineas_repetidas
        WHERE NOT (
            nro_guia <> 'SIN GUÍA'
            AND cantidad_lineas_repetidas_interna > 1
            AND fuente_minima_interna <> fuente_maxima_interna
            AND orden_linea_repetida_interno > 1
        )
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
        fecha_hora_creacion,
        fecha_creacion
    FROM sin_lineas_repetidas
    """


def crear_capa2(conexion: duckdb.DuckDBPyConnection) -> None:
    verificar_capa1(conexion, mostrar_detalle=False)
    if CAPA2_TEMP.exists():
        CAPA2_TEMP.unlink()

    copiar_sql = f"""
        COPY (
            {construir_sql_capa2()}
        )
        TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
    """

    print("\nGenerando Capa 2 de Transferencias...")
    print("Aplicando estandarización, correcciones y depuración estricta.")
    print(f"Salida temporal: {CAPA2_TEMP}")
    inicio = time.perf_counter()
    try:
        conexion.execute(copiar_sql)
    except Exception:
        if CAPA2_TEMP.exists():
            CAPA2_TEMP.unlink()
        raise
    print(f"Parquet temporal creado en {(time.perf_counter() - inicio) / 60:.2f} minutos.")


def contar_filas_validas_antes_duplicados(
    conexion: duckdb.DuckDBPyConnection,
) -> tuple[int, int]:
    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
    fecha = sql_fecha_excel(sql_identificador("FECHA"))
    cantidad = sql_numero(sql_identificador("CANT"))
    precio = sql_numero(sql_identificador("PRECIO SUGERIDO"))
    tienda_o = sql_limpiar_texto(sql_identificador("TDA ORIGEN"))
    tienda_d = sql_limpiar_texto(sql_identificador("TDA DESTINO"))
    codigo = sql_limpiar_identificador(sql_identificador("CODIGO NISSEI"))
    linea = sql_limpiar_texto(sql_identificador("LINEA"))
    sublinea = sql_limpiar_texto(sql_identificador("SUB LINEA"))
    descartable = f"""
        {sql_clave(codigo)} = 'ERROR50'
        AND {sql_clave(linea)} = 'ERROR'
        AND {sql_clave(sublinea)} = 'ERROR'
    """

    filas_totales = conexion.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    filas_validas = conexion.execute(
        f"""
        SELECT COUNT(*) FROM {origen}
        WHERE ({fecha}) IS NOT NULL
          AND CAST(({fecha}) AS DATE) BETWEEN make_date({ANIO_INICIO_MODELO}, 1, 1)
                                          AND CURRENT_DATE + INTERVAL '2 years'
          AND ({tienda_o}) IS NOT NULL
          AND ({tienda_d}) IS NOT NULL
          AND ({codigo}) IS NOT NULL
          AND ({cantidad}) IS NOT NULL
          AND ({cantidad}) > 0
          AND ({precio}) IS NOT NULL
          AND NOT ({descartable})
        """
    ).fetchone()[0]
    return filas_totales, filas_validas


def validar_y_publicar_capa2(conexion: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """Valida Transferencias con una sola lectura del Parquet publicado.

    La deduplicación y las correcciones siguen dentro de construir_sql_capa2().
    La validación exhaustiva puede activarse con ETL_VALIDACION_ESTRICTA=1.
    """
    if not CAPA2_TEMP.exists() or CAPA2_TEMP.stat().st_size == 0:
        raise RuntimeError("El archivo temporal de Capa 2 no existe o está vacío.")

    origen = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_CAPA2:
        raise RuntimeError(
            "Las columnas de Capa 2 no coinciden con el esquema final esperado.\n"
            f"Esperado: {COLUMNAS_CAPA2}\nObtenido: {nombres}"
        )

    tiendas_lista = ", ".join(sql_texto(x) for x in sorted(TIENDAS_NO_NORMALIZADAS))
    proveedores_lista = ", ".join(
        sql_texto(x) for x in sorted(PROVEEDORES_NO_NORMALIZADOS)
    )
    marcas_lista = ", ".join(sql_texto(x) for x in sorted(MARCAS_NO_NORMALIZADAS))

    controles = conexion.execute(
        f"""
        SELECT
            COUNT(*) AS filas,
            SUM(CASE WHEN fecha_hora_transferencia IS NULL
                          OR fecha_transferencia IS NULL
                          OR dia_transferencia IS NULL
                     THEN 1 ELSE 0 END) AS fechas_invalidas,
            SUM(CASE WHEN tienda_origen IN ({tiendas_lista})
                          OR tienda_destino IN ({tiendas_lista})
                     THEN 1 ELSE 0 END) AS tiendas_sin_normalizar,
            SUM(CASE WHEN proveedor IN ({proveedores_lista}) THEN 1 ELSE 0 END)
                AS proveedores_sin_normalizar,
            SUM(CASE WHEN marca IN ({marcas_lista}) THEN 1 ELSE 0 END)
                AS marcas_sin_normalizar,
            SUM(CASE WHEN linea IN ('ERROR', 'X.ERROR')
                          OR sub_linea IN ('ERROR', 'X.ERROR')
                     THEN 1 ELSE 0 END) AS clasificacion_error,
            SUM(CASE WHEN cantidad <= 0 THEN 1 ELSE 0 END) AS cantidades_invalidas,
            SUM(CASE WHEN abs(total_transferencia - cantidad * precio_sugerido) > 0.02
                     THEN 1 ELSE 0 END) AS totales_inconsistentes,
            SUM(CASE WHEN codigo_nissei = 'ERROR50' THEN 1 ELSE 0 END)
                AS error50_publicado
        FROM {origen}
        """
    ).fetchone()

    filas_finales = int(controles[0] or 0)
    if filas_finales <= 0:
        raise RuntimeError("FactTransferenciasLimpio.parquet está vacío.")
    etiquetas = [
        "fechas", "tiendas", "proveedores", "marcas",
        "clasificación", "cantidades", "totales", "ERROR50",
    ]
    errores = [int(valor or 0) for valor in controles[1:]]
    if any(errores):
        detalle = ", ".join(f"{nombre}={valor:,}" for nombre, valor in zip(etiquetas, errores))
        raise RuntimeError("La validación final de Transferencias detectó pendientes: " + detalle)

    filas_capa1 = int(
        conexion.execute(
            f"SELECT COUNT(*) FROM read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
        ).fetchone()[0]
    )
    if filas_finales > filas_capa1:
        raise RuntimeError(
            f"Cantidad final incoherente: Capa 1={filas_capa1:,}, Capa 2={filas_finales:,}."
        )

    validacion_estricta = os.getenv("ETL_VALIDACION_ESTRICTA", "0") == "1"
    filas_validas = filas_finales
    duplicados_eliminados = 0
    if validacion_estricta:
        _, filas_validas = contar_filas_validas_antes_duplicados(conexion)
        if filas_finales > filas_validas:
            raise RuntimeError(
                f"Capa 2={filas_finales:,} supera filas válidas={filas_validas:,}."
            )
        columnas_grupo = ", ".join(sql_identificador(c) for c in COLUMNAS_CAPA2)
        duplicados_restantes = conexion.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT 1 FROM {origen}
                GROUP BY {columnas_grupo}
                HAVING COUNT(*) > 1
            )
            """
        ).fetchone()[0]
        if duplicados_restantes:
            raise RuntimeError(
                f"Persisten {duplicados_restantes:,} grupos de duplicados exactos."
            )
        duplicados_eliminados = filas_validas - filas_finales

    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    return {
        "filas_capa1": filas_capa1,
        "filas_descartadas": max(0, filas_capa1 - filas_validas),
        "filas_retiradas_total": max(0, filas_capa1 - filas_finales),
        "duplicados_eliminados": max(0, int(duplicados_eliminados)),
        "validacion_estricta": int(validacion_estricta),
        "filas": filas_finales,
        "columnas": len(esquema),
        "tamano_bytes": CAPA2_FINAL.stat().st_size,
    }


def verificar_capa2(conexion: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_FINAL.exists() or CAPA2_FINAL.stat().st_size == 0:
        raise FileNotFoundError(f"No existe una Capa 2 válida en: {CAPA2_FINAL}")

    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_CAPA2:
        raise RuntimeError("FactTransferenciasLimpio.parquet tiene un esquema inesperado.")

    resumen = conexion.execute(
        f"""
        SELECT
            COUNT(*) AS filas,
            COUNT(DISTINCT anio_transferencia) AS anios,
            SUM(CASE WHEN nro_guia = 'SIN GUÍA' THEN 1 ELSE 0 END) AS sin_guia,
            SUM(CASE WHEN precio_sugerido = 0 THEN 1 ELSE 0 END) AS precio_cero,
            SUM(CASE WHEN estado_transferencia = 'EN TRÁNSITO' THEN 1 ELSE 0 END)
                AS en_transito,
            SUM(CASE WHEN estado_transferencia = 'INCOMPLETO' THEN 1 ELSE 0 END)
                AS incompletos
        FROM {origen}
        """
    ).fetchone()

    print("\nMuestra de Capa 2 final:")
    muestra = conexion.execute(
        f"""
        SELECT fecha_hora_transferencia, estado_transferencia, nro_guia,
               tienda_origen, tienda_destino, codigo_nissei, proveedor,
               rubro, linea, sub_linea, marca, cantidad,
               precio_sugerido, total_transferencia
        FROM {origen}
        LIMIT 10
        """
    ).fetchall()
    for fila in muestra:
        print("  ", fila)

    return {
        "filas": resumen[0],
        "columnas": len(esquema),
        "anios": resumen[1],
        "sin_guia": resumen[2] or 0,
        "precio_cero": resumen[3] or 0,
        "en_transito": resumen[4] or 0,
        "incompletos": resumen[5] or 0,
        "tamano_bytes": CAPA2_FINAL.stat().st_size,
    }


# ==========================================================
# 7. PRESENTACIÓN Y EJECUCIÓN
# ==========================================================


def formato_tamano(bytes_: int) -> str:
    valor = float(bytes_)
    for unidad in ("B", "KB", "MB", "GB"):
        if valor < 1024 or unidad == "GB":
            return f"{valor:.2f} {unidad}"
        valor /= 1024
    return f"{valor:.2f} GB"


def imprimir_resumen_capa1(resumen: dict[str, int]) -> None:
    print("\n" + "=" * 68)
    print("CAPA 1 DE TRANSFERENCIAS GENERADA CORRECTAMENTE")
    print("=" * 68)
    if "archivos" in resumen:
        print(f"Archivos procesados : {resumen['archivos']}")
        print(f"Hojas procesadas    : {resumen['hojas']}")
    print(f"Filas               : {resumen['filas']:,}")
    print(f"Columnas            : {resumen['columnas']}")
    print(f"Tamaño              : {formato_tamano(resumen['tamano_bytes'])}")
    print(f"Resultado           : {CAPA1_FINAL}")
    print("=" * 68)


def imprimir_resumen_capa2(resumen: dict[str, int]) -> None:
    print("\n" + "=" * 68)
    print("CAPA 2 DE TRANSFERENCIAS GENERADA CORRECTAMENTE")
    print("=" * 68)
    if "filas_capa1" in resumen:
        print(f"Filas Capa 1        : {resumen['filas_capa1']:,}")
        if resumen.get("validacion_estricta"):
            print(f"Filas descartadas   : {resumen['filas_descartadas']:,}")
            print(f"Duplicados quitados : {resumen['duplicados_eliminados']:,}")
            print("Validación          : ESTRICTA")
        else:
            print(f"Filas retiradas     : {resumen['filas_retiradas_total']:,}")
            print("Validación          : RÁPIDA (reglas de limpieza intactas)")
    print(f"Filas finales       : {resumen['filas']:,}")
    print(f"Columnas finales    : {resumen['columnas']}")
    print(f"Tamaño              : {formato_tamano(resumen['tamano_bytes'])}")
    print(f"Resultado           : {CAPA2_FINAL}")
    print("=" * 68)


def ejecutar_capa1() -> None:
    preparar_carpetas()
    conexion = crear_conexion(cargar_excel=True)
    try:
        archivos = buscar_archivos_transferencias()
        hojas = inspeccionar_fuentes(conexion, archivos)
        if not hojas:
            raise RuntimeError("No se encontraron hojas de Transferencias con datos.")
        crear_capa1(conexion, hojas)
        resumen = validar_y_publicar_capa1(conexion, hojas)
        imprimir_resumen_capa1(resumen)
    finally:
        cerrar_duckdb_seguro(conexion)


def ejecutar_capa2() -> None:
    preparar_carpetas()
    conexion = crear_conexion(cargar_excel=False)
    try:
        crear_capa2(conexion)
        resumen = validar_y_publicar_capa2(conexion)
        imprimir_resumen_capa2(resumen)
    finally:
        cerrar_duckdb_seguro(conexion)


def ejecutar_completo() -> None:
    preparar_carpetas()
    conexion = crear_conexion(cargar_excel=True)
    try:
        archivos = buscar_archivos_transferencias()
        hojas = inspeccionar_fuentes(conexion, archivos)
        if not hojas:
            raise RuntimeError("No se encontraron hojas de Transferencias con datos.")
        crear_capa1(conexion, hojas)
        resumen1 = validar_y_publicar_capa1(conexion, hojas)
        imprimir_resumen_capa1(resumen1)

        crear_capa2(conexion)
        resumen2 = validar_y_publicar_capa2(conexion)
        imprimir_resumen_capa2(resumen2)
    finally:
        cerrar_duckdb_seguro(conexion)


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Pipeline Excel -> Capa 1 -> Capa 2 para Transferencias."
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--solo-capa1", action="store_true")
    grupo.add_argument("--solo-capa2", action="store_true")
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    return parser


def main() -> int:
    argumentos = construir_parser().parse_args()
    print("=" * 68)
    print("PIPELINE DE TRANSFERENCIAS")
    print("Excel RMS -> Fact_Transferencias -> Fact_Transferencias_Limpia")
    print("=" * 68)

    try:
        if argumentos.solo_capa1:
            ejecutar_capa1()
        elif argumentos.solo_capa2:
            ejecutar_capa2()
        elif argumentos.verificar_capa1:
            conexion = crear_conexion(cargar_excel=False)
            try:
                imprimir_resumen_capa1(verificar_capa1(conexion))
            finally:
                cerrar_duckdb_seguro(conexion)
        elif argumentos.verificar_capa2:
            conexion = crear_conexion(cargar_excel=False)
            try:
                resumen = verificar_capa2(conexion)
                imprimir_resumen_capa2(resumen)
                print(f"Registros sin guía : {resumen['sin_guia']:,}")
                print(f"Precios en cero    : {resumen['precio_cero']:,}")
                print(f"En tránsito        : {resumen['en_transito']:,}")
                print(f"Incompletos        : {resumen['incompletos']:,}")
            finally:
                cerrar_duckdb_seguro(conexion)
        else:
            ejecutar_completo()
        return 0
    except KeyboardInterrupt:
        print("\nEjecución cancelada por el usuario.", file=sys.stderr)
        return 130
    except Exception as exc:
        print("\nERROR EN LA PIPELINE:", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
