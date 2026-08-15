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

CAPA1_FINAL = CAPA1_DIR / "Fact_Ventas.parquet"
CAPA1_TEMP = WORK_TEMP_DIR / "Fact_Ventas_temporal.parquet"
CAPA2_FINAL = WORK_INTERMEDIATE_DIR / "FactVentasLimpio.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactVentasLimpio_temporal.parquet"

CACHE_VERSION_CAPA1 = "ventas_v24_1"

COLUMNAS_VENTAS = [
    "FECHA Y HORA VENTA",
    "NRO VTA",
    "TIENDA",
    "CODIGO NISSEI",
    "PROVEEDOR",
    "LOTE",
    "RUBRO",
    "LINEA",
    "SUB LINEA",
    "MARCA",
    "MODELO",
    "DESCRIPCION",
    "CLIENTE",
    "TEMPORADA",
    "CANT",
    "PRECIO SUGERIDO",
    "PRECIO REAL",
    "TOTAL VENTA",
    "TIPO  DOCUM",  # En el RMS existen dos espacios.
    "ESTADO",
    "NRO.DOC",
    "DESC3",
    "SIZE",
    "COLOR",
    "EST TRABAJO",
    "MES",
    "AÑO",
    "VENDEDOR",
    "MONEDA",
    "TTTT",
]

COLUMNAS_TRAZABILIDAD = [
    "archivo_origen",
    "hoja_origen",
    "fila_origen",
    "anio_archivo",
    "fecha_procesamiento",
]

COLUMNAS_CAPA2 = [
    # Capa 2 final: solamente campos analíticos limpios.
    # No publica columnas originales, técnicas, de observación ni trazabilidad.
    "fecha_hora_venta",
    "fecha_venta",
    "hora_venta",
    "dia_venta",
    "mes_numero_venta",
    "mes_nombre_venta",
    "trimestre_venta",
    "anio_venta",
    "semana_venta",
    "dia_semana_numero",
    "dia_semana_nombre",
    "nro_venta",
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
    "cliente",
    "temporada",
    "cantidad",
    "precio_sugerido",
    "precio_real",
    "total_venta",
    "tipo_documento",
    "estado",
    "nro_documento",
    "talla",
    "mes_lote",
    "mes_lote_numero",
    "anio_lote",
    "vendedor_codigo",
    "moneda",
    "vendedor_nombre",
    "tipo_movimiento",
]

COLUMNAS_NO_PUBLICABLES_CAPA2 = {
    "fecha_hora_venta_origen",
    "proveedor_origen",
    "rubro_origen",
    "marca_origen",
    "temporada_origen",
    "cantidad_origen",
    "precio_sugerido_origen",
    "precio_real_origen",
    "total_venta_origen",
    "mes_lote_origen",
    "anio_lote_origen",
    "diferencia_total_calculado",
    "requiere_revision",
    "motivo_revision",
    "archivo_origen",
    "hoja_origen",
    "fila_origen",
    "anio_archivo",
    "fecha_procesamiento",
    "fecha_limpieza",
}

TOTAL_COLUMNAS_ORIGEN = len(COLUMNAS_VENTAS)
COLUMNA_FINAL_EXCEL = "AD"

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


# ==========================================================
# 2. REGLAS DE NORMALIZACIÓN INCORPORADAS EN EL SCRIPT
# ==========================================================

MESES_EQUIVALENCIAS = {
    "ENERO": "ENERO",
    "FEBRERO": "FEBRERO",
    "FEFRERO": "FEBRERO",
    "MARZO": "MARZO",
    "ABRIL": "ABRIL",
    "MAYO": "MAYO",
    "JUNIO": "JUNIO",
    "JULIO": "JULIO",
    "AGOSTO": "AGOSTO",
    "SEPTIEMBRE": "SEPTIEMBRE",
    "SETIEMBRE": "SEPTIEMBRE",
    "SEPTIEMBREE": "SEPTIEMBRE",
    "OCTUBRE": "OCTUBRE",
    "OCTUBE": "OCTUBRE",
    "NOVIEMBRE": "NOVIEMBRE",
    "NOBIEMBRE": "NOVIEMBRE",
    "DICIEMBRE": "DICIEMBRE",
    "DICIEMPRE": "DICIEMBRE",
    "N A": "N/A",
    "NA": "N/A",
    "SIN MES": "N/A",
}

MESES_NUMERO = {
    "ENERO": 1,
    "FEBRERO": 2,
    "MARZO": 3,
    "ABRIL": 4,
    "MAYO": 5,
    "JUNIO": 6,
    "JULIO": 7,
    "AGOSTO": 8,
    "SEPTIEMBRE": 9,
    "OCTUBRE": 10,
    "NOVIEMBRE": 11,
    "DICIEMBRE": 12,
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
    # Variantes detectadas en el barrido completo de Fact_Ventas.parquet.
    "ULTRA BRANDS S.A.C": "ULTRA BRANDS S.A.C.",
    "ULTRA BRANDS S.A.C.": "ULTRA BRANDS S.A.C.",
    "INTERSPORT S.A.C.": "INTER SPORT S.A.C.",
    "INTER SPORT S.A.C.": "INTER SPORT S.A.C.",
    "SEGURO HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A.": "SEGUROS HOMECENTERS PERUANOS S.A.",
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

TEMPORADAS_EQUIVALENCIAS = {
    "VERANO": "VERANO",
    "T VERANO": "VERANO",
    "INVIERNO": "INVIERNO",
    "T INVIERNO": "INVIERNO",
    "T INVIENO": "INVIERNO",
    "ALTO VERANO": "ALTO VERANO",
    "ALTO INVIERNO": "ALTO INVIERNO",
    "VARIOS": "VARIOS",
    "N A": "N/A",
    "NA": "N/A",
    "SIN TEMPORADA": "N/A",
    "TEMPORADA": "N/A",
    "T TEMPORADA": "N/A",
}

RUBROS_EQUIVALENCIAS = {
    "ELECTROMENOR": "ELECTRO MENOR",
    "ELECTRO MENOR": "ELECTRO MENOR",
    "TECNOLOGIA": "TECNOLOGIA",
    "COMPUTO": "COMPUTO",
    "BANO Y LAVANDERIA": "BAÑO Y LAVANDERÍA",
    "LINEA BLANCA": "LÍNEA BLANCA",
    "RECREACION": "RECREACIÓN",
    "JOYERIA": "JOYERÍA",
    "MOCHILA MALETA MALETIN CARTERA": "MOCHILA/MALETA/MALETÍN/CARTERA",
}

SUBLINEAS_EQUIVALENCIAS = {
    # Variantes singular/plural y orden invertido detectadas en los datos.
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
}


TIPOS_DOCUMENTO_EQUIVALENCIAS = {
    "BOLETA ELECTRONICA": "BOLETA ELECTRÓNICA",
    "BOLETA": "BOLETA ELECTRÓNICA",
    "FACTURA ELECTRONICA": "FACTURA ELECTRÓNICA",
    "FACTURA": "FACTURA ELECTRÓNICA",
    "NOTA DE CREDITO ELECTRONICA": "NOTA DE CRÉDITO ELECTRÓNICA",
    "NOTA DE CREDITO BOLETA": "NOTA DE CRÉDITO ELECTRÓNICA",
    "NOTA DE CREDITO": "NOTA DE CRÉDITO ELECTRÓNICA",
    "NOTA CREDITO": "NOTA DE CRÉDITO ELECTRÓNICA",
    "NC": "NOTA DE CRÉDITO ELECTRÓNICA",
    "N C": "NOTA DE CRÉDITO ELECTRÓNICA",
    "TICKET": "TICKET",
}

ESTADOS_EQUIVALENCIAS = {
    "ACTIVO": "ACTIVO",
    "ACTIVA": "ACTIVO",
    "ANULADO": "ANULADO",
    "ANULADA": "ANULADO",
    "EMITIDO": "EMITIDO",
    "EMITIDA": "EMITIDO",
}

MONEDAS_EQUIVALENCIAS = {
    "PEN": "PEN",
    "SOL": "PEN",
    "SOLES": "PEN",
    "S": "PEN",
    "USD": "USD",
    "DOLAR": "USD",
    "DOLARES": "USD",
    "DOLAR AMERICANO": "USD",
}

RUBROS_INVALIDOS = {"X ERROR", "X PRUEBA", "ERROR", "N A", "NA", "NULL"}
TOKENS_NULOS = {"", "N/A", "NA", "NULL", "NONE", "-", "--", "ERROR", "#N/A"}


@dataclass(frozen=True)
class HojaExcel:
    archivo: Path
    nombre: str
    rango: str
    filas_dimension: int
    tiene_encabezado: bool
    anio_archivo: int

    @property
    def fila_inicio(self) -> int:
        return 2 if self.tiene_encabezado else 1

    @property
    def rango_datos(self) -> str:
        return f"A{self.fila_inicio}:{COLUMNA_FINAL_EXCEL}{self.filas_dimension}"

    @property
    def filas_datos_esperadas(self) -> int:
        return max(0, self.filas_dimension - self.fila_inicio + 1)


# ==========================================================
# 3. FUNCIONES AUXILIARES
# ==========================================================


def preparar_carpetas() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def sql_texto(valor: Union[str, Path]) -> str:
    texto = str(valor).replace("'", "''")
    return f"'{texto}'"


def sql_identificador(nombre: str) -> str:
    return '"' + nombre.replace('"', '""') + '"'


def normalizar_encabezado(valor: object) -> str:
    texto = "" if valor is None else str(valor)
    texto = texto.replace("\n", " ").replace("\r", " ")
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


def obtener_hojas_desde_xlsx(archivo: Path) -> list[tuple[str, str, int]]:
    with zipfile.ZipFile(archivo) as libro:
        nombres_zip = {nombre.lower(): nombre for nombre in libro.namelist()}
        workbook_xml = ET.fromstring(libro.read("xl/workbook.xml"))
        relaciones_xml = ET.fromstring(libro.read("xl/_rels/workbook.xml.rels"))
        relaciones = {
            elemento.attrib["Id"]: elemento.attrib["Target"]
            for elemento in relaciones_xml
        }

        hojas: list[tuple[str, str, int]] = []
        contenedor = workbook_xml.find(f"{{{NS_MAIN}}}sheets")
        if contenedor is None:
            return hojas

        for hoja in contenedor:
            nombre_hoja = hoja.attrib["name"]
            relacion_id = hoja.attrib[f"{{{NS_REL_OFFICE}}}id"]
            destino = relaciones[relacion_id]
            ruta_xml = destino.lstrip("/") if destino.startswith("/") else f"xl/{destino}".replace("xl//", "xl/")
            ruta_xml_real = nombres_zip.get(ruta_xml.lower())
            if ruta_xml_real is None:
                raise FileNotFoundError(
                    f"No se encontró la estructura XML de la hoja {nombre_hoja} en {archivo.name}."
                )

            dimension = None
            with libro.open(ruta_xml_real) as flujo:
                for _, elemento in ET.iterparse(flujo, events=("start",)):
                    if elemento.tag == f"{{{NS_MAIN}}}dimension":
                        dimension = elemento.attrib.get("ref")
                        break

            if not dimension:
                print(f"  - Aviso: se omite la hoja '{nombre_hoja}' porque no tiene dimensión.")
                continue

            cantidad_columnas, ultima_fila = analizar_dimension(dimension)
            if ultima_fila < 1:
                continue
            if cantidad_columnas != TOTAL_COLUMNAS_ORIGEN:
                raise ValueError(
                    f"{archivo.name} / {nombre_hoja}: se esperaban {TOTAL_COLUMNAS_ORIGEN} "
                    f"columnas (A:{COLUMNA_FINAL_EXCEL}), pero la dimensión indica "
                    f"{cantidad_columnas}: {dimension}."
                )

            hojas.append((nombre_hoja, f"A1:{COLUMNA_FINAL_EXCEL}{ultima_fila}", ultima_fila))
        return hojas


def buscar_archivos_ventas() -> list[Path]:
    archivos = sorted(
        archivo
        for archivo in INPUT_DIR.glob("*.xlsx")
        if not archivo.name.startswith("~$") and "VENTAS" in archivo.stem.upper()
    )
    if not archivos:
        raise FileNotFoundError(f"No se encontraron archivos VENTAS .xlsx en: {INPUT_DIR}")
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
                    "Comprueba tu conexión a Internet y vuelve a ejecutar el script."
                ) from exc
    return conexion


def consulta_read_xlsx(archivo: Path, hoja: str, rango: str, tiene_encabezado: bool) -> str:
    encabezado_sql = "true" if tiene_encabezado else "false"
    return (
        "read_xlsx("
        f"{sql_texto(archivo.as_posix())}, "
        f"sheet = {sql_texto(hoja)}, "
        f"range = {sql_texto(rango)}, "
        f"header = {encabezado_sql}, "
        "all_varchar = true, "
        "stop_at_empty = false"
        ")"
    )


def detectar_encabezado(
    conexion: duckdb.DuckDBPyConnection, archivo: Path, hoja: str
) -> bool:
    # La detección mediante read_xlsx recorría hojas completas incluso para A1.
    # La lectura XML obtiene únicamente la primera fila y conserva el mismo rigor.
    del conexion
    filas = leer_filas_xlsx(archivo, hoja, max_filas=1, max_columnas=TOTAL_COLUMNAS_ORIGEN)
    primera_fila = filas[0] if filas else None
    if primera_fila is None or len(primera_fila) != TOTAL_COLUMNAS_ORIGEN:
        raise ValueError(
            f"No se pudo leer correctamente la primera fila de {archivo.name} / {hoja}."
        )
    esperado = [normalizar_encabezado(x) for x in COLUMNAS_VENTAS]
    recibido = [normalizar_encabezado(x) for x in primera_fila]
    return recibido == esperado


def obtener_columnas_lectura(conexion: duckdb.DuckDBPyConnection, origen_sql: str) -> list[str]:
    descripcion = conexion.execute(f"DESCRIBE SELECT * FROM {origen_sql}").fetchall()
    columnas = [fila[0] for fila in descripcion]
    if len(columnas) != TOTAL_COLUMNAS_ORIGEN:
        raise ValueError(
            f"DuckDB detectó {len(columnas)} columnas; se esperaban {TOTAL_COLUMNAS_ORIGEN}."
        )
    return columnas


# ==========================================================
# 4. CAPA 1: EXCEL -> PARQUET CONSOLIDADO
# ==========================================================


def inspeccionar_fuentes(
    conexion: duckdb.DuckDBPyConnection, archivos: list[Path]
) -> list[HojaExcel]:
    resultado: list[HojaExcel] = []
    print("\nInspeccionando archivos y hojas...")

    for archivo in archivos:
        anio = extraer_anio_archivo(archivo)
        hojas_estructura = obtener_hojas_desde_xlsx(archivo)
        if not hojas_estructura:
            raise ValueError(f"El archivo no contiene hojas utilizables: {archivo.name}")

        print(f"\n{archivo.name}")
        for nombre_hoja, rango, filas_dimension in hojas_estructura:
            tiene_encabezado = detectar_encabezado(conexion, archivo, nombre_hoja)
            hoja = HojaExcel(
                archivo=archivo,
                nombre=nombre_hoja,
                rango=rango,
                filas_dimension=filas_dimension,
                tiene_encabezado=tiene_encabezado,
                anio_archivo=anio,
            )
            resultado.append(hoja)
            tipo = "con encabezado" if tiene_encabezado else "sin encabezado"
            print(
                f"  - {nombre_hoja}: {hoja.rango_datos} | {tipo} | "
                f"filas de datos esperadas: {hoja.filas_datos_esperadas:,}"
            )
    return resultado


def construir_select_hoja(
    conexion: duckdb.DuckDBPyConnection,
    hoja: HojaExcel,
    fecha_procesamiento: datetime,
) -> str:
    del conexion
    # Se omite físicamente la fila de encabezado y se asignan los nombres por
    # posición. Así DuckDB no necesita inferir ni describir toda la hoja.
    origen = consulta_read_xlsx(
        archivo=hoja.archivo,
        hoja=hoja.nombre,
        rango=hoja.rango_datos,
        tiene_encabezado=False,
    )
    alias_columnas = ", ".join(sql_identificador(c) for c in COLUMNAS_VENTAS)
    expresiones = [
        f"CAST({sql_identificador(nombre)} AS VARCHAR) AS {sql_identificador(nombre)}"
        for nombre in COLUMNAS_VENTAS
    ]
    desplazamiento = hoja.fila_inicio - 1
    fecha_sql = fecha_procesamiento.strftime("%Y-%m-%d %H:%M:%S.%f")
    expresiones.extend(
        [
            f"{sql_texto(hoja.archivo.name)}::VARCHAR AS archivo_origen",
            f"{sql_texto(hoja.nombre)}::VARCHAR AS hoja_origen",
            f"(row_number() OVER () + {desplazamiento})::BIGINT AS fila_origen",
            f"{hoja.anio_archivo}::INTEGER AS anio_archivo",
            f"TIMESTAMP {sql_texto(fecha_sql)} AS fecha_procesamiento",
        ]
    )
    return ("SELECT\n    " + ",\n    ".join(expresiones) + f"\nFROM {origen} AS src({alias_columnas})")


def crear_capa1(conexion: duckdb.DuckDBPyConnection, hojas: list[HojaExcel]) -> None:
    """Consolida Capa 1 reutilizando Parquet por archivo RMS sin perder filas."""
    CAPA1_TEMP.unlink(missing_ok=True)
    fecha_procesamiento = datetime.now()
    forzar_cache = os.getenv("ETL_FORCE_C1_CACHE", "0") == "1"

    por_archivo: dict[Path, list[HojaExcel]] = {}
    for hoja in hojas:
        por_archivo.setdefault(hoja.archivo, []).append(hoja)

    caches: list[Path] = []
    for archivo, hojas_archivo in por_archivo.items():
        cache = ruta_cache(
            "ventas", archivo, CACHE_VERSION_CAPA1, Path(__file__)
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
        raise RuntimeError("No se generaron fuentes cacheadas de Ventas.")
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

    parquet_sql = sql_texto(CAPA1_TEMP.as_posix())
    filas_resultado = conexion.execute(
        f"SELECT COUNT(*) FROM read_parquet({parquet_sql})"
    ).fetchone()[0]
    columnas_resultado = conexion.execute(
        f"DESCRIBE SELECT * FROM read_parquet({parquet_sql})"
    ).fetchall()
    nombres_resultado = [fila[0] for fila in columnas_resultado]
    esperadas = COLUMNAS_VENTAS + COLUMNAS_TRAZABILIDAD

    if nombres_resultado != esperadas:
        raise RuntimeError(
            "Las columnas del Parquet no coinciden con el esquema esperado.\n"
            f"Esperado: {esperadas}\nObtenido: {nombres_resultado}"
        )

    filas_esperadas = sum(hoja.filas_datos_esperadas for hoja in hojas)
    if filas_resultado != filas_esperadas:
        raise RuntimeError(
            f"La cantidad de filas no coincide. Esperadas: {filas_esperadas:,}; "
            f"obtenidas: {filas_resultado:,}."
        )

    trazabilidad_incompleta = conexion.execute(
        f"""
        SELECT COUNT(*) FROM read_parquet({parquet_sql})
        WHERE archivo_origen IS NULL OR hoja_origen IS NULL OR fila_origen IS NULL
           OR anio_archivo IS NULL OR fecha_procesamiento IS NULL
        """
    ).fetchone()[0]
    if trazabilidad_incompleta:
        raise RuntimeError(
            f"Se detectaron {trazabilidad_incompleta:,} filas sin trazabilidad completa."
        )

    os.replace(CAPA1_TEMP, CAPA1_FINAL)
    return {
        "archivos": len({hoja.archivo for hoja in hojas}),
        "hojas": len(hojas),
        "filas": filas_resultado,
        "columnas": len(columnas_resultado),
        "tamano_bytes": CAPA1_FINAL.stat().st_size,
    }


def verificar_capa1(conexion: duckdb.DuckDBPyConnection, mostrar_detalle: bool = True) -> dict[str, int]:
    if not CAPA1_FINAL.exists() or CAPA1_FINAL.stat().st_size == 0:
        raise FileNotFoundError(
            f"No existe una Capa 1 válida en: {CAPA1_FINAL}. Ejecuta primero --solo-capa1."
        )

    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    esperadas = COLUMNAS_VENTAS + COLUMNAS_TRAZABILIDAD
    if nombres != esperadas:
        raise RuntimeError(
            "Fact_Ventas.parquet existe, pero su esquema no coincide con la Capa 1 esperada."
        )

    filas = conexion.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas == 0:
        raise RuntimeError("Fact_Ventas.parquet no contiene registros.")

    trazabilidad_incompleta = conexion.execute(
        f"""
        SELECT COUNT(*) FROM {origen}
        WHERE archivo_origen IS NULL OR hoja_origen IS NULL OR fila_origen IS NULL
           OR anio_archivo IS NULL OR fecha_procesamiento IS NULL
        """
    ).fetchone()[0]
    if trazabilidad_incompleta:
        raise RuntimeError(
            f"Capa 1 contiene {trazabilidad_incompleta:,} filas sin trazabilidad."
        )

    if mostrar_detalle:
        print("\nDistribución de registros por archivo y hoja:")
        detalle = conexion.execute(
            f"""
            SELECT archivo_origen, hoja_origen, COUNT(*) AS filas
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
            SELECT "FECHA Y HORA VENTA", "NRO VTA", "TIENDA", "PROVEEDOR",
                   "TOTAL VENTA", archivo_origen, hoja_origen, fila_origen
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
# 5. EXPRESIONES SQL PARA CAPA 2
# ==========================================================


def sql_limpiar_texto(expresion: str, mayusculas: bool = True) -> str:
    base = f"NULLIF(regexp_replace(trim(CAST({expresion} AS VARCHAR)), '\\s+', ' ', 'g'), '')"
    return f"upper({base})" if mayusculas else base


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
        f"WHEN {sql_texto(k)} THEN {sql_texto(v)}" for k, v in sorted(normalizado.items())
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
        WHEN regexp_full_match({limpio}, '^[0-9]{{1,3}}(,[0-9]{{3}})+$')
            THEN replace({limpio}, ',', '')
        WHEN regexp_full_match({limpio}, '^[0-9]+\\.0+$')
            THEN regexp_replace({limpio}, '\\.0+$', '')
        ELSE {limpio}
    END
    """


def sql_numero(expresion: str) -> str:
    """Convierte números locales y notación científica sin inventar ceros.

    Valores vacíos/tokens nulos -> NULL. Los números negativos se conservan.
    """
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


def construir_sql_capa2(fecha_limpieza: datetime) -> str:
    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
    fecha_limpieza_sql = fecha_limpieza.strftime("%Y-%m-%d %H:%M:%S.%f")

    mes_mapeado = sql_mapear("mes_lote_origen", MESES_EQUIVALENCIAS, "NULL")
    tienda_mapeada = sql_mapear(
        "tienda_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen"
    )
    proveedor_mapeado = sql_mapear(
        "proveedor_origen", PROVEEDORES_EQUIVALENCIAS, "proveedor_origen"
    )
    marca_mapeada = sql_mapear("marca_origen", MARCAS_EQUIVALENCIAS, "marca_origen")
    temporada_mapeada = sql_mapear("temporada_origen", TEMPORADAS_EQUIVALENCIAS, "NULL")
    rubro_mapeado = sql_mapear("rubro_origen", RUBROS_EQUIVALENCIAS, "rubro_origen")
    sub_linea_mapeada = sql_mapear(
        "sub_linea_origen", SUBLINEAS_EQUIVALENCIAS, "sub_linea_origen"
    )
    tipo_doc_mapeado = sql_mapear(
        "tipo_documento_origen", TIPOS_DOCUMENTO_EQUIVALENCIAS,
        "tipo_documento_origen"
    )
    estado_mapeado = sql_mapear("estado_origen", ESTADOS_EQUIVALENCIAS, "estado_origen")
    moneda_mapeada = sql_mapear("moneda_origen", MONEDAS_EQUIVALENCIAS, "moneda_origen")

    temporada_conocida = sql_clave_pertenece(
        "temporada_origen", set(TEMPORADAS_EQUIVALENCIAS)
    )
    mes_conocido = sql_clave_pertenece("mes_lote_origen", set(MESES_EQUIVALENCIAS))
    rubro_invalido = sql_clave_pertenece("rubro_origen", RUBROS_INVALIDOS)
    anio_lote_es_nulo = sql_clave_pertenece("anio_lote_origen", TOKENS_NULOS)

    numero_mes_casos = "\n".join(
        f"WHEN {sql_texto(mes)} THEN {numero}" for mes, numero in MESES_NUMERO.items()
    )

    return f"""
    WITH raw AS (
        SELECT
            {sql_limpiar_texto(sql_identificador('FECHA Y HORA VENTA'), False)} AS fecha_hora_venta_origen,
            {sql_limpiar_identificador(sql_identificador('NRO VTA'))} AS nro_venta,
            {sql_limpiar_texto(sql_identificador('TIENDA'))} AS tienda_origen,
            {sql_limpiar_identificador(sql_identificador('CODIGO NISSEI'))} AS codigo_nissei,
            {sql_limpiar_texto(sql_identificador('PROVEEDOR'))} AS proveedor_origen,
            {sql_limpiar_identificador(sql_identificador('LOTE'))} AS lote,
            {sql_limpiar_texto(sql_identificador('RUBRO'))} AS rubro_origen,
            {sql_limpiar_texto(sql_identificador('LINEA'))} AS linea_origen,
            {sql_limpiar_texto(sql_identificador('SUB LINEA'))} AS sub_linea_origen,
            {sql_limpiar_texto(sql_identificador('MARCA'))} AS marca_origen,
            {sql_limpiar_texto(sql_identificador('MODELO'))} AS modelo,
            {sql_limpiar_texto(sql_identificador('DESCRIPCION'))} AS descripcion,
            {sql_limpiar_texto(sql_identificador('CLIENTE'))} AS cliente,
            {sql_limpiar_texto(sql_identificador('TEMPORADA'))} AS temporada_origen,
            {sql_limpiar_texto(sql_identificador('CANT'), False)} AS cantidad_origen,
            {sql_limpiar_texto(sql_identificador('PRECIO SUGERIDO'), False)} AS precio_sugerido_origen,
            {sql_limpiar_texto(sql_identificador('PRECIO REAL'), False)} AS precio_real_origen,
            {sql_limpiar_texto(sql_identificador('TOTAL VENTA'), False)} AS total_venta_origen,
            {sql_limpiar_texto(sql_identificador('TIPO  DOCUM'))} AS tipo_documento_origen,
            {sql_limpiar_texto(sql_identificador('ESTADO'))} AS estado_origen,
            {sql_limpiar_identificador(sql_identificador('NRO.DOC'))} AS nro_documento,
            {sql_limpiar_texto(sql_identificador('SIZE'))} AS talla,
            {sql_limpiar_texto(sql_identificador('MES'))} AS mes_lote_origen,
            {sql_limpiar_texto(sql_identificador('AÑO'), False)} AS anio_lote_origen,
            {sql_limpiar_identificador(sql_identificador('VENDEDOR'))} AS vendedor_codigo,
            {sql_limpiar_texto(sql_identificador('MONEDA'))} AS moneda_origen,
            {sql_limpiar_texto(sql_identificador('TTTT'))} AS vendedor_nombre,
            archivo_origen,
            hoja_origen,
            fila_origen,
            anio_archivo,
            fecha_procesamiento
        FROM {origen}
    ),
    tipado AS (
        SELECT
            *,
            {sql_fecha_excel('fecha_hora_venta_origen')} AS fecha_hora_venta,
            TRY_CAST(({sql_numero('cantidad_origen')}) AS DECIMAL(20, 4)) AS cantidad,
            TRY_CAST(({sql_numero('precio_sugerido_origen')}) AS DECIMAL(20, 4)) AS precio_sugerido,
            TRY_CAST(({sql_numero('precio_real_origen')}) AS DECIMAL(20, 4)) AS precio_real,
            TRY_CAST(({sql_numero('total_venta_origen')}) AS DECIMAL(20, 4)) AS total_venta,
            COALESCE({tienda_mapeada}, 'N/A') AS tienda,
            COALESCE({proveedor_mapeado}, 'N/A') AS proveedor,
            COALESCE({marca_mapeada}, 'N/A') AS marca,
            CASE
                WHEN temporada_origen IS NULL THEN 'N/A'
                WHEN {temporada_conocida} THEN COALESCE({temporada_mapeada}, 'N/A')
                ELSE 'N/A'
            END AS temporada,
            CASE
                -- Los 29 registros del producto PIJAMA DISNEY estaban como X.ERROR.
                WHEN {rubro_invalido}
                     AND (codigo_nissei = '0000000000017' OR descripcion LIKE '%PIJAMA%')
                    THEN 'TEXTIL'
                -- Los dos movimientos DEPOSTO/PAGO POR PEDIDO son servicios.
                WHEN {rubro_invalido}
                     AND (codigo_nissei = 'DEPOSTO' OR descripcion = 'PAGO POR PEDIDO')
                    THEN 'SERVICIOS'
                WHEN rubro_origen IS NULL OR {rubro_invalido} THEN 'N/A'
                ELSE COALESCE({rubro_mapeado}, 'N/A')
            END AS rubro,
            CASE
                WHEN {rubro_invalido}
                     AND (codigo_nissei = '0000000000017' OR descripcion LIKE '%PIJAMA%')
                    THEN 'ROPA DAMA'
                WHEN {rubro_invalido}
                     AND (codigo_nissei = 'DEPOSTO' OR descripcion = 'PAGO POR PEDIDO')
                    THEN 'SERVICIOS'
                WHEN linea_origen IS NULL OR {rubro_invalido} THEN 'N/A'
                ELSE linea_origen
            END AS linea,
            CASE
                WHEN {rubro_invalido}
                     AND (codigo_nissei = '0000000000017' OR descripcion LIKE '%PIJAMA%')
                    THEN 'PIJAMA'
                WHEN {rubro_invalido}
                     AND (codigo_nissei = 'DEPOSTO' OR descripcion = 'PAGO POR PEDIDO')
                    THEN 'PAGO POR PEDIDO'
                WHEN sub_linea_origen IS NULL OR {rubro_invalido} THEN 'N/A'
                ELSE COALESCE({sub_linea_mapeada}, 'N/A')
            END AS sub_linea,
            CASE
                WHEN mes_lote_origen IS NULL THEN 'N/A'
                WHEN {mes_conocido} THEN COALESCE({mes_mapeado}, 'N/A')
                ELSE 'N/A'
            END AS mes_lote,
            CASE
                WHEN anio_lote_origen IS NULL OR {anio_lote_es_nulo} THEN NULL
                WHEN TRY_CAST(regexp_replace(anio_lote_origen, '\\.0+$', '') AS INTEGER)
                     BETWEEN 1900 AND 2100
                THEN TRY_CAST(regexp_replace(anio_lote_origen, '\\.0+$', '') AS INTEGER)
                ELSE NULL
            END AS anio_lote_preliminar,
            COALESCE({tipo_doc_mapeado}, 'N/A') AS tipo_documento,
            COALESCE({estado_mapeado}, 'N/A') AS estado,
            COALESCE({moneda_mapeada}, 'N/A') AS moneda,
            ({temporada_conocida}) AS temporada_reconocida,
            ({mes_conocido}) AS mes_lote_reconocido,
            CASE
                WHEN {rubro_invalido}
                     AND NOT (
                         codigo_nissei = '0000000000017'
                         OR descripcion LIKE '%PIJAMA%'
                         OR codigo_nissei = 'DEPOSTO'
                         OR descripcion = 'PAGO POR PEDIDO'
                     )
                THEN TRUE ELSE FALSE
            END AS rubro_sin_clasificar
        FROM raw
    ),
    fechas AS (
        SELECT
            *,
            CAST(fecha_hora_venta AS DATE) AS fecha_venta,
            CAST(fecha_hora_venta AS TIME) AS hora_venta,
            date_part('day', fecha_hora_venta)::INTEGER AS dia_venta,
            date_part('month', fecha_hora_venta)::INTEGER AS mes_numero_venta,
            {sql_nombre_mes("date_part('month', fecha_hora_venta)::INTEGER")} AS mes_nombre_venta,
            date_part('quarter', fecha_hora_venta)::INTEGER AS trimestre_venta,
            date_part('year', fecha_hora_venta)::INTEGER AS anio_venta,
            date_part('week', fecha_hora_venta)::INTEGER AS semana_venta,
            date_part('isodow', fecha_hora_venta)::INTEGER AS dia_semana_numero,
            {sql_nombre_dia("date_part('isodow', fecha_hora_venta)::INTEGER")} AS dia_semana_nombre,
            CASE mes_lote
                {numero_mes_casos}
                ELSE NULL
            END::INTEGER AS mes_lote_numero,
            CASE
                WHEN anio_lote_preliminar IS NULL THEN NULL
                WHEN anio_lote_preliminar <= date_part('year', fecha_hora_venta)::INTEGER
                    THEN anio_lote_preliminar
                ELSE NULL
            END AS anio_lote,
            CASE
                WHEN estado = 'ANULADO' THEN 'ANULACIÓN'
                WHEN tipo_documento LIKE 'NOTA DE CRÉDITO%' THEN 'NOTA DE CRÉDITO'
                WHEN COALESCE(cantidad, 0) < 0 OR COALESCE(total_venta, 0) < 0
                    THEN 'MOVIMIENTO NEGATIVO'
                WHEN COALESCE(cantidad, 0) > 0 OR COALESCE(total_venta, 0) > 0
                    THEN 'VENTA'
                ELSE 'REVISAR'
            END AS tipo_movimiento,
            CASE
                WHEN cantidad IS NOT NULL AND precio_real IS NOT NULL AND total_venta IS NOT NULL
                THEN CAST(total_venta - (cantidad * precio_real) AS DECIMAL(20, 4))
                ELSE NULL
            END AS diferencia_total_calculado
        FROM tipado
    ),
    fechas_validas AS (
        -- Regla solicitada: no publicar filas sin una fecha/día de venta válido.
        SELECT *
        FROM fechas
        WHERE fecha_hora_venta IS NOT NULL
          AND dia_venta IS NOT NULL
          AND fecha_venta >= make_date({ANIO_INICIO_MODELO}, 1, 1)
    ),
    control AS (
        SELECT
            *,
            NULLIF(
                concat_ws('; ',
                    CASE WHEN fecha_venta < make_date({ANIO_INICIO_MODELO}, 1, 1)
                               OR fecha_venta > CURRENT_DATE + INTERVAL '1 day'
                         THEN 'FECHA_VENTA_FUERA_DE_RANGO' END,
                    CASE WHEN anio_venta <> anio_archivo
                         THEN 'AÑO_VENTA_DISTINTO_AL_ARCHIVO' END,
                    CASE WHEN cantidad_origen IS NOT NULL AND cantidad IS NULL
                         THEN 'CANTIDAD_INVÁLIDA' END,
                    CASE WHEN precio_sugerido_origen IS NOT NULL AND precio_sugerido IS NULL
                         THEN 'PRECIO_SUGERIDO_INVÁLIDO' END,
                    CASE WHEN precio_real_origen IS NOT NULL AND precio_real IS NULL
                         THEN 'PRECIO_REAL_INVÁLIDO' END,
                    CASE WHEN total_venta_origen IS NOT NULL AND total_venta IS NULL
                         THEN 'TOTAL_VENTA_INVÁLIDO' END,
                    CASE WHEN precio_real < 0 THEN 'PRECIO_REAL_NEGATIVO' END,
                    CASE WHEN anio_lote_origen IS NOT NULL
                               AND NOT {anio_lote_es_nulo}
                               AND anio_lote_preliminar IS NULL
                         THEN 'AÑO_LOTE_INVÁLIDO' END,
                    CASE WHEN anio_lote_preliminar IS NOT NULL
                               AND anio_lote_preliminar > anio_venta
                         THEN 'AÑO_LOTE_POSTERIOR_A_LA_VENTA' END,
                    CASE WHEN mes_lote_origen IS NOT NULL AND NOT mes_lote_reconocido
                         THEN 'MES_LOTE_NO_ESTANDARIZADO' END,
                    CASE WHEN temporada_origen IS NOT NULL AND NOT temporada_reconocida
                         THEN 'TEMPORADA_NO_ESTANDARIZADA' END,
                    CASE WHEN rubro_sin_clasificar THEN 'RUBRO_NO_CLASIFICADO' END,
                    CASE WHEN tipo_movimiento = 'MOVIMIENTO NEGATIVO'
                         THEN 'NEGATIVO_SIN_NOTA_DE_CRÉDITO' END,
                    CASE WHEN estado = 'ACTIVO' AND total_venta = 0
                         THEN 'VENTA_ACTIVA_CON_TOTAL_CERO' END,
                    CASE WHEN cantidad = 0 AND COALESCE(total_venta, 0) <> 0
                         THEN 'CANTIDAD_CERO_CON_TOTAL' END,
                    CASE WHEN total_venta = 0 AND COALESCE(cantidad, 0) <> 0
                         THEN 'TOTAL_CERO_CON_CANTIDAD' END,
                    CASE WHEN diferencia_total_calculado IS NOT NULL
                               AND abs(diferencia_total_calculado) > 0.10
                         THEN 'TOTAL_DIFIERE_DE_CANTIDAD_POR_PRECIO' END
                ),
                ''
            ) AS motivo_revision
        FROM fechas_validas
    ),
    duplicados_exactos_ordenados AS (
        -- Duplicado exacto: todos los campos comerciales limpios coinciden.
        -- Se conserva una sola fila de forma determinística.
        SELECT
            *,
            ROW_NUMBER() OVER (
                PARTITION BY fecha_hora_venta, nro_venta, tienda, codigo_nissei,
                             proveedor, lote, rubro, linea, sub_linea, marca,
                             modelo, descripcion, cliente, temporada, cantidad,
                             precio_sugerido, precio_real, total_venta,
                             tipo_documento, estado, nro_documento, talla,
                             mes_lote, anio_lote, vendedor_codigo, moneda,
                             vendedor_nombre
                ORDER BY COALESCE(
                    TRY_CAST(regexp_extract(archivo_origen, '\\(([0-9]+)\\)', 1)
                             AS INTEGER),
                    0
                ) DESC,
                archivo_origen DESC,
                COALESCE(
                    TRY_CAST(regexp_extract(hoja_origen, '([0-9]+)', 1)
                             AS INTEGER),
                    999999
                ) ASC,
                hoja_origen ASC,
                fila_origen ASC
            )::BIGINT AS orden_duplicado_exacto_interno
        FROM control
    ),
    sin_duplicados_exactos AS (
        SELECT * EXCLUDE (orden_duplicado_exacto_interno)
        FROM duplicados_exactos_ordenados
        WHERE orden_duplicado_exacto_interno = 1
    ),
    lineas_repetidas_evaluadas AS (
        -- Línea repetida estricta: coincide la identidad de la operación,
        -- producto, precios, cantidades, documento, vendedor y clasificación.
        -- Solo se depura si aparece en más de un archivo u hoja de origen.
        SELECT
            *,
            COUNT(*) OVER (
                PARTITION BY fecha_hora_venta, nro_venta, tienda, nro_documento,
                             codigo_nissei, lote, proveedor, rubro, linea,
                             sub_linea, marca, modelo, talla, cantidad,
                             precio_sugerido, precio_real, total_venta,
                             tipo_documento, estado, vendedor_codigo, moneda
            )::BIGINT AS cantidad_lineas_repetidas_interna,
            MIN(archivo_origen || '|' || hoja_origen) OVER (
                PARTITION BY fecha_hora_venta, nro_venta, tienda, nro_documento,
                             codigo_nissei, lote, proveedor, rubro, linea,
                             sub_linea, marca, modelo, talla, cantidad,
                             precio_sugerido, precio_real, total_venta,
                             tipo_documento, estado, vendedor_codigo, moneda
            ) AS fuente_minima_interna,
            MAX(archivo_origen || '|' || hoja_origen) OVER (
                PARTITION BY fecha_hora_venta, nro_venta, tienda, nro_documento,
                             codigo_nissei, lote, proveedor, rubro, linea,
                             sub_linea, marca, modelo, talla, cantidad,
                             precio_sugerido, precio_real, total_venta,
                             tipo_documento, estado, vendedor_codigo, moneda
            ) AS fuente_maxima_interna,
            ROW_NUMBER() OVER (
                PARTITION BY fecha_hora_venta, nro_venta, tienda, nro_documento,
                             codigo_nissei, lote, proveedor, rubro, linea,
                             sub_linea, marca, modelo, talla, cantidad,
                             precio_sugerido, precio_real, total_venta,
                             tipo_documento, estado, vendedor_codigo, moneda
                ORDER BY COALESCE(
                    TRY_CAST(regexp_extract(archivo_origen, '\\(([0-9]+)\\)', 1)
                             AS INTEGER),
                    0
                ) DESC,
                archivo_origen DESC,
                COALESCE(
                    TRY_CAST(regexp_extract(hoja_origen, '([0-9]+)', 1)
                             AS INTEGER),
                    999999
                ) ASC,
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
        FROM lineas_repetidas_evaluadas
        WHERE NOT (
            fecha_hora_venta IS NOT NULL
            AND nro_venta IS NOT NULL
            AND tienda IS NOT NULL
            AND nro_documento IS NOT NULL
            AND codigo_nissei IS NOT NULL
            AND cantidad IS NOT NULL
            AND total_venta IS NOT NULL
            AND cantidad_lineas_repetidas_interna > 1
            AND fuente_minima_interna <> fuente_maxima_interna
            AND orden_linea_repetida_interno > 1
        )
    )
    SELECT
        fecha_hora_venta,
        fecha_venta,
        hora_venta,
        dia_venta,
        mes_numero_venta,
        mes_nombre_venta,
        trimestre_venta,
        anio_venta,
        semana_venta,
        dia_semana_numero,
        dia_semana_nombre,
        nro_venta,
        tienda,
        codigo_nissei,
        proveedor,
        lote,
        rubro,
        linea,
        sub_linea,
        marca,
        modelo,
        descripcion,
        cliente,
        temporada,
        cantidad,
        precio_sugerido,
        precio_real,
        total_venta,
        tipo_documento,
        estado,
        nro_documento,
        talla,
        mes_lote,
        mes_lote_numero,
        anio_lote,
        vendedor_codigo,
        moneda,
        vendedor_nombre,
        tipo_movimiento
    FROM sin_lineas_repetidas
    """


# ==========================================================
# 6. CAPA 2: LIMPIEZA Y ESTANDARIZACIÓN
# ==========================================================


def crear_capa2(conexion: duckdb.DuckDBPyConnection) -> None:
    verificar_capa1(conexion, mostrar_detalle=False)
    if CAPA2_TEMP.exists():
        CAPA2_TEMP.unlink()

    sql_transformacion = construir_sql_capa2(datetime.now())
    copiar_sql = f"""
        COPY (
            {sql_transformacion}
        )
        TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
    """

    print("\nGenerando Capa 2...")
    print("Aplicando limpieza integral, tiendas estandarizadas y depuración estricta de duplicados.")
    print(f"Salida temporal: {CAPA2_TEMP}")
    inicio = time.perf_counter()
    try:
        conexion.execute(copiar_sql)
    except Exception:
        if CAPA2_TEMP.exists():
            CAPA2_TEMP.unlink()
        raise
    print(f"Parquet temporal creado en {(time.perf_counter() - inicio) / 60:.2f} minutos.")


def contar_filas_fecha_invalida_capa1(
    conexion: duckdb.DuckDBPyConnection,
) -> int:
    """Cuenta filas que no son ventas porque la fecha no puede convertirse."""
    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
    fecha_expr = sql_fecha_excel(sql_identificador("FECHA Y HORA VENTA"))
    return conexion.execute(
        f"SELECT COUNT(*) FROM {origen} WHERE ({fecha_expr}) IS NULL"
    ).fetchone()[0]


def validar_y_publicar_capa2(conexion: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """Valida Ventas con una sola lectura en el modo normal.

    Las reglas de limpieza y deduplicación permanecen en construir_sql_capa2().
    La recomputación exhaustiva sobre Capa 1 se reserva para
    ETL_VALIDACION_ESTRICTA=1.
    """
    if not CAPA2_TEMP.exists() or CAPA2_TEMP.stat().st_size == 0:
        raise RuntimeError("El archivo temporal de Capa 2 no existe o está vacío.")

    origen2 = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen2}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_CAPA2:
        raise RuntimeError(
            "Las columnas de Capa 2 no coinciden con el esquema final esperado.\n"
            f"Esperado: {COLUMNAS_CAPA2}\nObtenido: {nombres}"
        )

    columnas_tecnicas = sorted(set(nombres) & COLUMNAS_NO_PUBLICABLES_CAPA2)
    if columnas_tecnicas:
        raise RuntimeError(
            "La Capa 2 intentó publicar columnas técnicas u originales: "
            + ", ".join(columnas_tecnicas)
        )

    resumen = conexion.execute(
        f"""
        SELECT
            COUNT(*) AS filas,
            SUM(CASE WHEN fecha_hora_venta IS NULL OR fecha_venta IS NULL
                          OR dia_venta IS NULL OR mes_numero_venta IS NULL
                          OR anio_venta IS NULL
                     THEN 1 ELSE 0 END) AS fechas_incompletas,
            SUM(CASE WHEN tienda IN ('AGUAS VERDES', 'AYA', 'PP', 'PU',
                                     'PLAZA UNION', 'PLAZA UNIÓN',
                                     'UNION 797', 'UNIÓN 797', 'JR UNION',
                                     'ALMACEN VIRTUAL', 'ALMACÉN VIRTUAL',
                                     'ALMACEN VIRUTAL', 'ALMACÉN VIRUTAL')
                     THEN 1 ELSE 0 END) AS tiendas_sin_normalizar,
            SUM(CASE WHEN proveedor IN ('CHILIA', 'CHILIA S.A.') THEN 1 ELSE 0 END)
                AS proveedores_sin_normalizar,
            SUM(CASE WHEN marca IN ('HITECH', 'AIR WALK', 'LA COSTE',
                                    'POLO RALPH LAUREN', 'BOSS',
                                    'MIA BY APOLO', 'APOLITO')
                     THEN 1 ELSE 0 END) AS marcas_sin_normalizar,
            SUM(CASE WHEN mes_lote IN ('FEFRERO', 'DICIEMPRE', 'OCTUBE',
                                      'NOBIEMBRE', 'SETIEMBRE', 'SEPTIEMBREE')
                     THEN 1 ELSE 0 END) AS meses_sin_normalizar,
            SUM(CASE WHEN total_venta < 0 THEN 1 ELSE 0 END) AS totales_negativos,
            SUM(CASE WHEN tipo_movimiento = 'NOTA DE CRÉDITO' THEN 1 ELSE 0 END)
                AS notas_credito,
            SUM(CASE WHEN temporada = 'N/A' THEN 1 ELSE 0 END) AS temporada_na
        FROM {origen2}
        """
    ).fetchone()

    filas_capa2 = int(resumen[0] or 0)
    if filas_capa2 <= 0:
        raise RuntimeError("FactVentasLimpio.parquet está vacío.")
    pendientes = [int(v or 0) for v in resumen[1:6]]
    if any(pendientes):
        raise RuntimeError(
            "Persisten datos sin normalizar: "
            f"fechas={pendientes[0]:,}, tiendas={pendientes[1]:,}, "
            f"proveedores={pendientes[2]:,}, marcas={pendientes[3]:,}, "
            f"meses={pendientes[4]:,}."
        )

    filas_capa1 = int(
        conexion.execute(
            f"SELECT COUNT(*) FROM read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
        ).fetchone()[0]
    )
    if filas_capa2 > filas_capa1:
        raise RuntimeError(
            f"Cantidad final incoherente: Capa 1={filas_capa1:,}, Capa 2={filas_capa2:,}."
        )

    validacion_estricta = os.getenv("ETL_VALIDACION_ESTRICTA", "0") == "1"
    filas_descartadas_fecha = 0
    duplicados_eliminados = 0
    if validacion_estricta:
        filas_descartadas_fecha = contar_filas_fecha_invalida_capa1(conexion)
        filas_validas = filas_capa1 - filas_descartadas_fecha
        if filas_capa2 > filas_validas:
            raise RuntimeError(
                f"Capa 2={filas_capa2:,} supera filas válidas={filas_validas:,}."
            )
        duplicados_eliminados = filas_validas - filas_capa2

    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    return {
        "filas": filas_capa2,
        "filas_capa1": filas_capa1,
        "columnas": len(esquema),
        "duplicados_eliminados": max(0, int(duplicados_eliminados)),
        "fechas_invalidas": 0,
        "filas_descartadas_fecha": max(0, int(filas_descartadas_fecha)),
        "filas_retiradas_total": max(0, filas_capa1 - filas_capa2),
        "validacion_estricta": int(validacion_estricta),
        "totales_negativos": int(resumen[6] or 0),
        "notas_credito": int(resumen[7] or 0),
        "temporada_na": int(resumen[8] or 0),
        "tamano_bytes": CAPA2_FINAL.stat().st_size,
    }


def verificar_capa2(conexion: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_FINAL.exists() or CAPA2_FINAL.stat().st_size == 0:
        raise FileNotFoundError(f"No existe una Capa 2 válida en: {CAPA2_FINAL}")

    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_CAPA2:
        raise RuntimeError("FactVentasLimpio.parquet tiene un esquema inesperado.")

    columnas_tecnicas = sorted(set(nombres) & COLUMNAS_NO_PUBLICABLES_CAPA2)
    if columnas_tecnicas:
        raise RuntimeError(
            "El Parquet final todavía contiene columnas no publicables: "
            + ", ".join(columnas_tecnicas)
        )

    resumen = conexion.execute(
        f"""
        SELECT
            COUNT(*) AS filas,
            SUM(CASE WHEN fecha_hora_venta IS NULL OR dia_venta IS NULL
                     THEN 1 ELSE 0 END) AS fechas_invalidas,
            SUM(CASE WHEN total_venta < 0 THEN 1 ELSE 0 END) AS negativos,
            SUM(CASE WHEN tienda IN ('AGUAS VERDES', 'AYA', 'PP', 'PU',
                                     'PLAZA UNION', 'PLAZA UNIÓN',
                                     'UNION 797', 'UNIÓN 797', 'JR UNION',
                                     'ALMACEN VIRTUAL', 'ALMACÉN VIRTUAL',
                                     'ALMACEN VIRUTAL', 'ALMACÉN VIRUTAL')
                     THEN 1 ELSE 0 END) AS tiendas_sin_normalizar
        FROM {origen}
        """
    ).fetchone()
    if resumen[1]:
        raise RuntimeError(
            f"La Capa 2 contiene {resumen[1]:,} filas sin fecha/día válido."
        )
    if resumen[3]:
        raise RuntimeError(
            f"La Capa 2 contiene {resumen[3]:,} tiendas conocidas sin estandarizar."
        )

    print("\nMuestra de Capa 2 final limpia:")
    muestra = conexion.execute(
        f"""
        SELECT fecha_hora_venta, tienda, proveedor, marca, cantidad,
               precio_real, total_venta, tipo_documento, tipo_movimiento
        FROM {origen}
        LIMIT 10
        """
    ).fetchall()
    for fila in muestra:
        print("  ", fila)

    filas_capa1 = conexion.execute(
        f"SELECT COUNT(*) FROM read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"
    ).fetchone()[0]
    filas_descartadas_fecha = contar_filas_fecha_invalida_capa1(conexion)
    filas_validas_antes_duplicados = filas_capa1 - filas_descartadas_fecha
    duplicados_eliminados = max(0, filas_validas_antes_duplicados - resumen[0])

    return {
        "filas": resumen[0],
        "columnas": len(esquema),
        "duplicados_eliminados": duplicados_eliminados,
        "fechas_invalidas": resumen[1] or 0,
        "negativos": resumen[2] or 0,
        "tamano_bytes": CAPA2_FINAL.stat().st_size,
    }


# ==========================================================
# 7. PRESENTACIÓN DE RESULTADOS
# ==========================================================


def imprimir_resumen_capa1(resumen: dict[str, int]) -> None:
    print("\n" + "=" * 68)
    print("CAPA 1 GENERADA CORRECTAMENTE")
    print("=" * 68)
    if "archivos" in resumen:
        print(f"Archivos procesados : {resumen['archivos']}")
        print(f"Hojas procesadas    : {resumen['hojas']}")
    print(f"Filas                : {resumen['filas']:,}")
    print(f"Columnas             : {resumen['columnas']}")
    print(f"Tamaño               : {resumen['tamano_bytes'] / (1024**2):,.2f} MB")
    print(f"Resultado            : {CAPA1_FINAL}")
    print("=" * 68)


def imprimir_resumen_capa2(resumen: dict[str, int]) -> None:
    print("\n" + "=" * 68)
    print("CAPA 2 GENERADA CORRECTAMENTE")
    print("=" * 68)
    print(f"Filas                        : {resumen['filas']:,}")
    print(f"Columnas                     : {resumen['columnas']}")
    if resumen.get("validacion_estricta"):
        print(f"Duplicados eliminados        : {resumen['duplicados_eliminados']:,}")
        print(f"Filas descartadas por fecha  : {resumen['filas_descartadas_fecha']:,}")
        print("Validación                   : ESTRICTA")
    else:
        print(f"Filas retiradas total        : {resumen['filas_retiradas_total']:,}")
        print("Validación                   : RÁPIDA (reglas de limpieza intactas)")
    print(f"Fechas nulas en resultado    : {resumen['fechas_invalidas']:,}")
    print(f"Totales negativos            : {resumen['totales_negativos']:,}")
    print(f"Notas de crédito detectadas  : {resumen['notas_credito']:,}")
    print(f"Temporada N/A                : {resumen['temporada_na']:,}")
    print(f"Tamaño                       : {resumen['tamano_bytes'] / (1024**2):,.2f} MB")
    print(f"Resultado                    : {CAPA2_FINAL}")
    print("=" * 68)


def crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Pipeline de Ventas: Excel RMS -> Capa 1 -> Capa 2 final limpia."
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument(
        "--solo-capa1",
        action="store_true",
        help="Genera únicamente capa1/Fact_Ventas.parquet.",
    )
    grupo.add_argument(
        "--solo-capa2",
        action="store_true",
        help="Genera Capa 2 usando una Capa 1 existente.",
    )
    grupo.add_argument(
        "--verificar-capa1",
        action="store_true",
        help="Comprueba filas, esquema, trazabilidad y muestra de Capa 1.",
    )
    grupo.add_argument(
        "--verificar-capa2",
        action="store_true",
        help="Comprueba filas, esquema y muestra de Capa 2.",
    )
    return parser


# ==========================================================
# 8. EJECUCIÓN PRINCIPAL
# ==========================================================


def main() -> int:
    args = crear_parser().parse_args()
    preparar_carpetas()

    print("=" * 68)
    print("PIPELINE DE VENTAS")
    print("Capa 1: Excel RMS consolidado | Capa 2: datos limpios")
    print("=" * 68)

    conexion = None
    try:
        if args.verificar_capa1:
            conexion = crear_conexion(cargar_excel=False)
            resumen = verificar_capa1(conexion, mostrar_detalle=True)
            imprimir_resumen_capa1(resumen)
            return 0

        if args.verificar_capa2:
            conexion = crear_conexion(cargar_excel=False)
            resumen = verificar_capa2(conexion)
            print("\n" + "=" * 68)
            print("CAPA 2 VERIFICADA CORRECTAMENTE")
            print("=" * 68)
            print(f"Filas                  : {resumen['filas']:,}")
            print(f"Columnas               : {resumen['columnas']}")
            print(f"Duplicados eliminados  : {resumen['duplicados_eliminados']:,}")
            print(f"Fechas inválidas       : {resumen['fechas_invalidas']:,}")
            print(f"Totales negativos      : {resumen['negativos']:,}")
            print(f"Resultado              : {CAPA2_FINAL}")
            print("=" * 68)
            return 0

        if args.solo_capa2:
            conexion = crear_conexion(cargar_excel=False)
            crear_capa2(conexion)
            resumen2 = validar_y_publicar_capa2(conexion)
            imprimir_resumen_capa2(resumen2)
            return 0

        # Capa 1 sola o flujo completo.
        conexion = crear_conexion(cargar_excel=True)
        archivos = buscar_archivos_ventas()
        print(f"\nCarpeta de entrada: {INPUT_DIR}")
        print(f"Archivos encontrados: {len(archivos)}")
        for archivo in archivos:
            print(f"  - {archivo.name}")

        hojas = inspeccionar_fuentes(conexion, archivos)
        crear_capa1(conexion, hojas)
        resumen1 = validar_y_publicar_capa1(conexion, hojas)
        imprimir_resumen_capa1(resumen1)

        if args.solo_capa1:
            return 0

        # Libera recursos de la lectura Excel antes de transformar millones de filas.
        cerrar_duckdb_seguro(conexion)
        conexion = crear_conexion(cargar_excel=False)
        crear_capa2(conexion)
        resumen2 = validar_y_publicar_capa2(conexion)
        imprimir_resumen_capa2(resumen2)
        return 0

    except KeyboardInterrupt:
        print("\nProceso cancelado por el usuario.", file=sys.stderr)
        for temporal in (CAPA1_TEMP, CAPA2_TEMP):
            if temporal.exists():
                temporal.unlink()
        return 130
    except Exception as exc:
        print("\n" + "=" * 68, file=sys.stderr)
        print("ERROR EN LA PIPELINE", file=sys.stderr)
        print("=" * 68, file=sys.stderr)
        print(str(exc), file=sys.stderr)
        print(
            "Los Parquet finales anteriores, si existían, no fueron reemplazados.",
            file=sys.stderr,
        )
        for temporal in (CAPA1_TEMP, CAPA2_TEMP):
            if temporal.exists():
                temporal.unlink()
        return 1
    finally:
        if conexion is not None:
            cerrar_duckdb_seguro(conexion)


if __name__ == "__main__":
    finalizar_proceso(main())
