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

CAPA1_FINAL = CAPA1_DIR / "Fact_Ingresos.parquet"
CAPA1_TEMP = WORK_TEMP_DIR / "Fact_Ingresos_temporal.parquet"
CAPA2_FINAL = WORK_INTERMEDIATE_DIR / "FactIngresosLimpio.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactIngresosLimpio_temporal.parquet"

CACHE_VERSION_CAPA1 = "ingresos_v24_1"

# El encabezado visible del reporte RMS no coincide con la posición real
# de las columnas. El orden correcto se confirmó evaluando los tres archivos.
COLUMNAS_INGRESOS = [
    "FECHA INGRESO",
    "TIENDA",
    "CODIGO NISSEI",
    "PROVEEDOR",
    "LOTE",
    "DEP",
    "RUBRO",
    "LINEA",
    "SUB LINEA",
    "MARCA",
    "MODELO",
    "DESCRIPCION",
    "CANTIDAD RECIBIDA",
    "PRECIO SUGERIDO",
    "TOTAL",
    "ESTADO",
    "MES",
    "AÑO",
    "MODELO CODIGO",
    "PERSONAL",
]

COLUMNAS_TRAZABILIDAD = [
    "archivo_origen",
    "hoja_origen",
    "fila_origen",
    "anio_archivo",
    "fecha_modificacion_archivo",
    "fecha_procesamiento",
]

# Capa 2 publica solamente campos analíticos limpios. Las columnas de
# auditoría, incidencias técnicas y duplicados se usan internamente y no se exportan.
COLUMNAS_CAPA2 = [
    "fecha_hora_ingreso",
    "fecha_ingreso",
    "hora_ingreso",
    "dia_ingreso",
    "mes_numero_ingreso",
    "mes_nombre_ingreso",
    "trimestre_ingreso",
    "anio_ingreso",
    "semana_ingreso",
    "dia_semana_numero",
    "dia_semana_nombre",
    "tienda",
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
    "cantidad_recibida",
    "precio_sugerido",
    "total_ingreso",
    "estado_producto",
    "mes_lote",
    "mes_lote_numero",
    "anio_lote",
    "personal",
    "tipo_movimiento_ingreso",
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

TOTAL_COLUMNAS_ORIGEN = len(COLUMNAS_INGRESOS)
COLUMNA_FINAL_EXCEL = "T"

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


# ==========================================================
# 2. REGLAS DE NORMALIZACIÓN
# ==========================================================

TOKENS_NULOS = {
    "", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A", "(EN BLANCO)"
}

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

# Mismas tiendas estandarizadas en Ventas y Transferencias.
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

# Catálogo incorporado al código. Incluye las equivalencias aprobadas en
# Ventas/Transferencias y las variantes halladas en Ingresos 2024-2026.
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
    "CORPORACIÓN CARDINALE S.R.L.": "CORPORACIÓN CARDENALES S.R.L.",
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
    "SMART BRANDS S.A.C": "SMART BRANDS S.A.C.",
    "SMART BRANDS S.A.C.": "SMART BRANDS S.A.C.",
    "INTERSPORT S.A.C.": "INTER SPORT S.A.C.",
    "INTER SPORT S.A.C.": "INTER SPORT S.A.C.",
    "SEGURO HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "SEGUROS HOMECENTERS PERUANOS S.A.": "SEGUROS HOMECENTERS PERUANOS S.A.",
    "MARCIMEX S.A": "MARCIMEX S.A.",
    "MARCIMEX S.A.": "MARCIMEX S.A.",
    "SKECHERS PERU S.R.L.": "SKECHERS PERÚ S.R.L.",
    "SKECHERS PERÚ S.R.L.": "SKECHERS PERÚ S.R.L.",
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
    "HORNO ELECTRICO": "HORNO ELÉCTRICO",
    "HORNO ELÉCTRICO": "HORNO ELÉCTRICO",
    "SANDWICHERA/ WAFLERA": "SANDWICHERA/WAFLERA",
}

# Estado físico del producto. Se corrigen errores ortográficos y se conservan
# categorías diferentes cuando tienen significado propio.
ESTADOS_PRODUCTO_EQUIVALENCIAS = {
    "BUENO": "BUENO",
    "BUENA": "BUENO",
    "BUENAS": "BUENO",
    "OK": "OK",
    "OK PARA TIENDA": "OK",
    "NUEVO": "NUEVO",
    "VENDIBLE": "VENDIBLE",
    "RECUPERADO": "RECUPERADO",
    "REPARADO": "REPARADO",
    "SUCIO": "SUCIO",
    "SUCIOS": "SUCIO",
    "SUC IO": "SUCIO",
    "SUCION": "SUCIO",
    "MANCHA": "MANCHADO",
    "MANCHAS": "MANCHADO",
    "MANCHAD": "MANCHADO",
    "MANCHADO": "MANCHADO",
    "SERVICIO TECNICO": "SERVICIO TÉCNICO",
    "SERVICO TECNICO": "SERVICIO TÉCNICO",
    "SERVICIO/TECNICO": "SERVICIO TÉCNICO",
    "FALLADO": "FALLADO",
    "FALLADA": "FALLADO",
    "FALLAD0": "FALLADO",
    "FALALDO": "FALLADO",
    "FALLAO": "FALLADO",
    "FALLAR": "FALLADO",
    "FALADO": "FALLADO",
    "INCOMPLETO": "INCOMPLETO",
    "INCOMPLETA": "INCOMPLETO",
    "IMCOMPLETO": "INCOMPLETO",
    "INCOMPLETP": "INCOMPLETO",
    "INCOMPLETOO": "INCOMPLETO",
    "ICOMPLETO": "INCOMPLETO",
    "P/REPARADA": "PANTALLA REPARADA",
    "P. REPARADA": "PANTALLA REPARADA",
    "PANTALLA/REPARADA": "PANTALLA REPARADA",
    "PANTALLA REPARADA": "PANTALLA REPARADA",
    "P/ROTA": "PANTALLA ROTA",
    "P. ROTA": "PANTALLA ROTA",
    "PANTALLA ROTA": "PANTALLA ROTA",
    "RAYADA": "RAYADO",
    "RAYADO": "RAYADO",
    "CHANCADA": "CHANCADO",
    "CHANCADO": "CHANCADO",
    "PUNTO BLANCO": "PUNTOS BLANCOS",
    "PUNTOS BLANCOS": "PUNTOS BLANCOS",
    "SUCIO/MANCHADO": "SUCIO / MANCHADO",
    "SUCIO MANCHADO": "SUCIO / MANCHADO",
    "SUCIO Y MANCHADO": "SUCIO / MANCHADO",
    "FALLADO/INCOMPLETO": "FALLADO / INCOMPLETO",
    "INCOMPLETO/FALLADO": "FALLADO / INCOMPLETO",
    "FALLADO E INCOMPLETO": "FALLADO / INCOMPLETO",
    "SUCIO/INCOMPLETO": "SUCIO / INCOMPLETO",
    "INCOMPLETO/SUCIO": "SUCIO / INCOMPLETO",
    "SUCIO/FALLADO": "SUCIO / FALLADO",
    "FALLADO/SUCIO": "SUCIO / FALLADO",
    "PELADO/SUCIO": "PELADO / SUCIO",
    "LAVADO/MANCHADO": "LAVADO / MANCHADO",
    "SUCIO/USADO": "SUCIO / USADO",
    "FALLADO/PUNTOS BLANCOS": "FALLADO / PUNTOS BLANCOS",
    "MANCHADO/PELADO": "MANCHADO / PELADO",
    "FALLADO/MANCHADO": "FALLADO / MANCHADO",
    "PANTALLA RAYADA/SUCIO": "PANTALLA RAYADA / SUCIO",
    "RAYADO/SUCIO": "RAYADO / SUCIO",
    "FALLADO/DESCOLORIDO": "FALLADO / DESCOLORIDO",
    "INCOMPLETO/DESTALLADO": "INCOMPLETO / DESTALLADO",
    "MANCHADO/INCOMPLETO": "MANCHADO / INCOMPLETO",
    "DESTALLADO/SUCIO": "DESTALLADO / SUCIO",
}

PERSONAL_EQUIVALENCIAS = {
    "JACKEYN": "JACKELYN",
    "JAKELYN": "JACKELYN",
    "JACKELYN": "JACKELYN",
    "NICOLE": "NICOL",
    "NICOL": "NICOL",
    "VICTORIA P.": "VICTORIA PAZ",
    "VICTORIA PAZ": "VICTORIA PAZ",
}

# DEP funciona como código de rubro. Esta dimensión es común con Transferencias.
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
MESES_NO_NORMALIZADOS = {
    "FEFRERO", "SETIEMBRE", "SEPTIEMBREE", "OCTUBE", "NOBIEMBRE",
    "DICIEMPRE"
}


@dataclass(frozen=True)
class HojaExcel:
    archivo: Path
    nombre: str
    ultima_fila: int
    fila_inicio: int
    anio_archivo: int
    fecha_modificacion: datetime

    @property
    def rango_datos(self) -> str:
        return f"A{self.fila_inicio}:{COLUMNA_FINAL_EXCEL}{self.ultima_fila}"

    @property
    def filas_datos_esperadas(self) -> int:
        return max(0, self.ultima_fila - self.fila_inicio + 1)


# ==========================================================
# 3. FUNCIONES AUXILIARES Y LECTURA DE EXCEL
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
            if cantidad_columnas < TOTAL_COLUMNAS_ORIGEN:
                raise ValueError(
                    f"{archivo.name} / {nombre_hoja}: se necesitan al menos "
                    f"{TOTAL_COLUMNAS_ORIGEN} columnas (A:{COLUMNA_FINAL_EXCEL}), "
                    f"pero la dimensión es {dimension}."
                )
            if cantidad_columnas > TOTAL_COLUMNAS_ORIGEN:
                print(
                    f"  - Aviso: {nombre_hoja} tiene {cantidad_columnas} columnas; "
                    f"se procesarán únicamente A:{COLUMNA_FINAL_EXCEL}."
                )
            hojas.append((nombre_hoja, ultima_fila, cantidad_columnas))
        return hojas


def buscar_archivos_ingresos() -> list[Path]:
    archivos: list[Path] = []
    for archivo in INPUT_DIR.glob("*.xlsx"):
        if archivo.name.startswith("~$"):
            continue
        clave = normalizar_clave_python(archivo.stem)
        if "INGRESO" in clave or "INGRESOS" in clave:
            archivos.append(archivo)
    archivos.sort()
    if not archivos:
        raise FileNotFoundError(
            f"No se encontraron archivos INGRESO .xlsx en: {INPUT_DIR}"
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


def es_serial_excel(valor: object) -> bool:
    if valor is None:
        return False
    texto = str(valor).strip().replace(",", ".")
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", texto):
        return False
    try:
        numero = float(texto)
    except ValueError:
        return False
    return 1 <= numero <= 80000


def detectar_fila_inicio(
    conexion: duckdb.DuckDBPyConnection,
    archivo: Path,
    hoja: str,
    ultima_fila: int,
) -> int:
    """Detecta encabezado o primera fila de datos leyendo solo el XML inicial."""
    del conexion
    limite = min(30, ultima_fila)
    filas = leer_filas_xlsx(
        archivo, hoja, max_filas=limite, max_columnas=TOTAL_COLUMNAS_ORIGEN
    )
    for numero_fila, fila in enumerate(filas, start=1):
        valores = [normalizar_encabezado(x) for x in fila]
        if (
            valores
            and "FECHA INGRESO" in valores[0]
            and len(valores) >= 4
            and valores[1] == "CODIGO NISSEI"
            and valores[2] == "TIENDA"
            and valores[3] == "PROVEEDOR"
        ):
            return numero_fila + 1
    for numero_fila, fila in enumerate(filas, start=1):
        if (
            len(fila) >= 4
            and es_serial_excel(fila[0])
            and fila[1] not in (None, "")
            and fila[2] not in (None, "")
        ):
            return numero_fila
    raise ValueError(
        f"No se pudo detectar la primera fila de datos en {archivo.name} / {hoja}."
    )


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
    print("\nInspeccionando archivos y hojas de Ingresos...")

    for archivo in archivos:
        anio = extraer_anio_archivo(archivo)
        fecha_modificacion = datetime.fromtimestamp(archivo.stat().st_mtime)
        hojas_estructura = obtener_hojas_desde_xlsx(archivo)
        if not hojas_estructura:
            raise ValueError(f"El archivo no contiene hojas utilizables: {archivo.name}")

        print(f"\n{archivo.name}")
        for nombre_hoja, ultima_fila, _ in hojas_estructura:
            fila_inicio = detectar_fila_inicio(
                conexion, archivo, nombre_hoja, ultima_fila
            )
            hoja = HojaExcel(
                archivo=archivo,
                nombre=nombre_hoja,
                ultima_fila=ultima_fila,
                fila_inicio=fila_inicio,
                anio_archivo=anio,
                fecha_modificacion=fecha_modificacion,
            )
            if hoja.filas_datos_esperadas <= 0:
                print(f"  - Se omite {nombre_hoja}: no contiene datos.")
                continue
            resultado.append(hoja)
            print(
                f"  - {nombre_hoja}: {hoja.rango_datos} | "
                f"filas esperadas: {hoja.filas_datos_esperadas:,}"
            )
    return resultado


def construir_select_hoja(
    conexion: duckdb.DuckDBPyConnection,
    hoja: HojaExcel,
    fecha_procesamiento: datetime,
) -> str:
    del conexion
    origen = consulta_read_xlsx(hoja.archivo, hoja.nombre, hoja.rango_datos)
    alias_columnas = ", ".join(sql_identificador(c) for c in COLUMNAS_INGRESOS)
    expresiones = [
        f"CAST({sql_identificador(nombre)} AS VARCHAR) "
        f"AS {sql_identificador(nombre)}"
        for nombre in COLUMNAS_INGRESOS
    ]

    fecha_proceso_sql = fecha_procesamiento.strftime("%Y-%m-%d %H:%M:%S.%f")
    fecha_mod_sql = hoja.fecha_modificacion.strftime("%Y-%m-%d %H:%M:%S.%f")
    desplazamiento = hoja.fila_inicio - 1
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
            "ingresos", archivo, CACHE_VERSION_CAPA1, Path(__file__)
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
        raise RuntimeError("No se generaron fuentes cacheadas de Ingresos.")
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
    esperadas = COLUMNAS_INGRESOS + COLUMNAS_TRAZABILIDAD
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
    if nombres != COLUMNAS_INGRESOS + COLUMNAS_TRAZABILIDAD:
        raise RuntimeError("Fact_Ingresos.parquet tiene un esquema inesperado.")

    filas = conexion.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas <= 0:
        raise RuntimeError("Fact_Ingresos.parquet está vacío.")

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
            SELECT "FECHA INGRESO", "TIENDA", "CODIGO NISSEI",
                   "PROVEEDOR", "LOTE", "CANTIDAD RECIBIDA",
                   "PRECIO SUGERIDO", "TOTAL"
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


def construir_ctes_limpieza() -> str:
    origen = f"read_parquet({sql_texto(CAPA1_FINAL.as_posix())})"

    tienda_mapeada = sql_mapear(
        "tienda_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen"
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
        "estado_origen", ESTADOS_PRODUCTO_EQUIVALENCIAS, "estado_origen"
    )
    mes_mapeado = sql_mapear(
        "mes_lote_origen", MESES_EQUIVALENCIAS, "'N/A'"
    )
    personal_mapeado = sql_mapear(
        "personal_origen", PERSONAL_EQUIVALENCIAS, "personal_origen"
    )
    casos_mes_numero = "\n".join(
        f"WHEN {sql_texto(mes)} THEN {numero}"
        for mes, numero in MESES_NUMERO.items()
    )

    return f"""
    raw AS (
        SELECT
            {sql_limpiar_texto(sql_identificador('FECHA INGRESO'), False)} AS fecha_ingreso_origen,
            {sql_limpiar_texto(sql_identificador('TIENDA'))} AS tienda_origen,
            {sql_limpiar_identificador(sql_identificador('CODIGO NISSEI'))} AS codigo_nissei_origen,
            {sql_limpiar_texto(sql_identificador('PROVEEDOR'))} AS proveedor_origen,
            {sql_limpiar_identificador(sql_identificador('LOTE'))} AS lote_origen,
            {sql_limpiar_identificador(sql_identificador('DEP'))} AS departamento_codigo_origen,
            {sql_limpiar_texto(sql_identificador('RUBRO'))} AS rubro_origen,
            {sql_limpiar_texto(sql_identificador('LINEA'))} AS linea_origen,
            {sql_limpiar_texto(sql_identificador('SUB LINEA'))} AS sub_linea_origen,
            {sql_limpiar_texto(sql_identificador('MARCA'))} AS marca_origen,
            {sql_limpiar_texto(sql_identificador('MODELO'))} AS modelo_origen,
            {sql_limpiar_texto(sql_identificador('DESCRIPCION'))} AS descripcion_origen,
            {sql_limpiar_texto(sql_identificador('CANTIDAD RECIBIDA'), False)} AS cantidad_origen,
            {sql_limpiar_texto(sql_identificador('PRECIO SUGERIDO'), False)} AS precio_sugerido_origen,
            {sql_limpiar_texto(sql_identificador('TOTAL'), False)} AS total_origen,
            {sql_limpiar_texto(sql_identificador('ESTADO'))} AS estado_origen,
            {sql_limpiar_texto(sql_identificador('MES'))} AS mes_lote_origen,
            {sql_limpiar_texto(sql_identificador('AÑO'), False)} AS anio_lote_origen,
            {sql_limpiar_identificador(sql_identificador('MODELO CODIGO'))} AS modelo_codigo_origen,
            {sql_limpiar_texto(sql_identificador('PERSONAL'))} AS personal_origen,
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
            {sql_fecha_excel('fecha_ingreso_origen')} AS fecha_hora_ingreso,
            TRY_CAST(({sql_numero('cantidad_origen')}) AS DECIMAL(20, 4)) AS cantidad_recibida,
            TRY_CAST(({sql_numero('precio_sugerido_origen')}) AS DECIMAL(20, 4)) AS precio_sugerido,
            TRY_CAST(({sql_numero('total_origen')}) AS DECIMAL(20, 4)) AS total_origen_numero,
            TRY_CAST(({sql_numero('anio_lote_origen')}) AS INTEGER) AS anio_lote_numero,
            COALESCE({tienda_mapeada}, 'N/A') AS tienda,
            COALESCE({proveedor_mapeado}, 'N/A') AS proveedor_preliminar,
            COALESCE({marca_mapeada}, 'N/A') AS marca,
            COALESCE({linea_mapeada}, 'N/A') AS linea_preliminar,
            COALESCE({sublinea_mapeada}, 'N/A') AS sub_linea_preliminar,
            COALESCE({estado_mapeado}, 'N/A') AS estado_preliminar,
            COALESCE({mes_mapeado}, 'N/A') AS mes_lote,
            COALESCE({personal_mapeado}, 'N/A') AS personal_preliminar
        FROM raw
    ),
    corregido AS (
        SELECT
            *,
            CASE
                WHEN {sql_clave('codigo_nissei_origen')} IN ('ER', 'ERROR53')
                    THEN 'SIN CÓDIGO'
                ELSE codigo_nissei_origen
            END AS codigo_nissei,
            CASE
                WHEN {sql_clave('codigo_nissei_origen')} = 'ER'
                     AND (descripcion_origen LIKE '%PANTALON%'
                          OR modelo_origen LIKE '%PANTALON%')
                    THEN '1'
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR53'
                     AND (descripcion_origen LIKE '%POLO%'
                          OR modelo_origen LIKE '%POLO%')
                    THEN '1'
                ELSE departamento_codigo_origen
            END AS departamento_codigo,
            CASE
                WHEN {sql_clave('codigo_nissei_origen')} = 'ER'
                     AND (descripcion_origen LIKE '%PANTALON%'
                          OR modelo_origen LIKE '%PANTALON%')
                    THEN 'ROPA DAMA'
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR53'
                     AND (descripcion_origen LIKE '%POLO%'
                          OR modelo_origen LIKE '%POLO%')
                    THEN 'ROPA DAMA'
                ELSE linea_preliminar
            END AS linea,
            CASE
                WHEN {sql_clave('codigo_nissei_origen')} = 'ER'
                     AND (descripcion_origen LIKE '%PANTALON%'
                          OR modelo_origen LIKE '%PANTALON%')
                    THEN 'PANTALON'
                WHEN {sql_clave('codigo_nissei_origen')} = 'ERROR53'
                     AND (descripcion_origen LIKE '%POLO%'
                          OR modelo_origen LIKE '%POLO%')
                    THEN 'POLO'
                WHEN sub_linea_preliminar <> 'N/A' THEN sub_linea_preliminar
                WHEN COALESCE(descripcion_origen, '') LIKE '%PANTALON%'
                     OR COALESCE(modelo_origen, '') LIKE '%PANTALON%'
                    THEN 'PANTALON'
                WHEN COALESCE(descripcion_origen, '') LIKE '%BERMUDA%'
                     OR COALESCE(modelo_origen, '') LIKE '%BERMUDA%'
                    THEN 'BERMUDA'
                WHEN COALESCE(descripcion_origen, '') LIKE '%ENTERIZO%'
                     OR COALESCE(modelo_origen, '') LIKE '%ENTERIZO%'
                    THEN 'ENTERIZO'
                WHEN COALESCE(descripcion_origen, '') LIKE '%MEDIA%'
                     OR COALESCE(modelo_origen, '') LIKE '%MEDIA%'
                    THEN 'MEDIA'
                WHEN COALESCE(descripcion_origen, '') LIKE '%POLO%'
                     OR COALESCE(modelo_origen, '') LIKE '%POLO%'
                    THEN 'POLO'
                WHEN COALESCE(descripcion_origen, '') LIKE '%VESTIDO DE BAÑO%'
                     OR COALESCE(descripcion_origen, '') LIKE '%TRUZA%'
                     OR COALESCE(modelo_origen, '') LIKE '%VESTIDO DE BAÑO%'
                    THEN 'ROPA DE BAÑO'
                WHEN COALESCE(descripcion_origen, '') LIKE '%MOP%'
                     OR COALESCE(modelo_origen, '') LIKE '%MOP%'
                    THEN 'MOPA'
                WHEN (COALESCE(descripcion_origen, '') LIKE '%DISPEN%'
                      OR COALESCE(modelo_origen, '') LIKE '%DISPEN%')
                     AND (COALESCE(descripcion_origen, '') LIKE '%JABON%'
                          OR COALESCE(modelo_origen, '') LIKE '%JABON%')
                    THEN 'DISPENSADOR DE JABÓN'
                WHEN COALESCE(descripcion_origen, '') LIKE '%GANCHO%'
                     OR COALESCE(modelo_origen, '') LIKE '%GANCHO%'
                    THEN 'GANCHO'
                ELSE 'N/A'
            END AS sub_linea,
            COALESCE(NULLIF(proveedor_preliminar, ''), 'N/A') AS proveedor,
            COALESCE(NULLIF(lote_origen, ''), 'N/A') AS lote,
            COALESCE(NULLIF(modelo_origen, ''), 'N/A') AS modelo,
            COALESCE(NULLIF(descripcion_origen, ''), 'N/A') AS descripcion,
            COALESCE(NULLIF(modelo_codigo_origen, ''), 'N/A') AS modelo_codigo,
            CASE
                WHEN {sql_clave('estado_preliminar')} IN ('', 'N A', 'NA')
                    THEN 'N/A'
                WHEN estado_preliminar = 'GRAND COURT 2.0 CF I'
                    THEN 'N/A'
                ELSE estado_preliminar
            END AS estado_producto,
            CASE
                WHEN personal_preliminar IS NULL
                     OR {sql_clave('personal_preliminar')} IN ('', 'N A', 'NA', 'EN BLANCO')
                     OR regexp_full_match(personal_preliminar, '^[0-9]{{3,4}}-[0-9]+$')
                    THEN 'N/A'
                ELSE personal_preliminar
            END AS personal,
            CASE
                WHEN (
                    {sql_clave('codigo_nissei_origen')} = '5555555555'
                    AND {sql_clave('proveedor_origen')} = 'ERROR'
                    AND {sql_clave('rubro_origen')} = 'X ERROR'
                ) OR (
                    {sql_clave('codigo_nissei_origen')} = 'ERROR50'
                    AND {sql_clave('rubro_origen')} = 'X ERROR'
                    AND {sql_clave('linea_origen')} = 'ERROR'
                    AND {sql_clave('sub_linea_origen')} = 'ERROR'
                )
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
                WHEN cantidad_recibida IS NOT NULL AND precio_sugerido IS NOT NULL
                    THEN TRY_CAST(cantidad_recibida * precio_sugerido AS DECIMAL(20, 4))
                ELSE total_origen_numero
            END AS total_ingreso,
            CAST(fecha_hora_ingreso AS DATE) AS fecha_ingreso,
            CAST(fecha_hora_ingreso AS TIME) AS hora_ingreso,
            date_part('day', fecha_hora_ingreso)::INTEGER AS dia_ingreso,
            date_part('month', fecha_hora_ingreso)::INTEGER AS mes_numero_ingreso,
            {sql_nombre_mes("date_part('month', fecha_hora_ingreso)::INTEGER")} AS mes_nombre_ingreso,
            date_part('quarter', fecha_hora_ingreso)::INTEGER AS trimestre_ingreso,
            date_part('year', fecha_hora_ingreso)::INTEGER AS anio_ingreso,
            date_part('week', fecha_hora_ingreso)::INTEGER AS semana_ingreso,
            date_part('isodow', fecha_hora_ingreso)::INTEGER AS dia_semana_numero,
            {sql_nombre_dia("date_part('isodow', fecha_hora_ingreso)::INTEGER")} AS dia_semana_nombre,
            CASE mes_lote
                {casos_mes_numero}
                ELSE NULL
            END::INTEGER AS mes_lote_numero,
            CASE
                WHEN anio_lote_numero BETWEEN 2000
                     AND date_part('year', fecha_hora_ingreso)::INTEGER + 2
                    THEN anio_lote_numero
                ELSE NULL
            END::INTEGER AS anio_lote,
            CASE
                WHEN cantidad_recibida < 0 THEN 'REVERSIÓN DE INGRESO'
                WHEN cantidad_recibida > 0 THEN 'INGRESO'
                ELSE 'SIN MOVIMIENTO'
            END AS tipo_movimiento_ingreso
        FROM corregido
    ),
    validos AS (
        SELECT *
        FROM enriquecido
        WHERE fecha_hora_ingreso IS NOT NULL
          AND fecha_ingreso BETWEEN make_date({ANIO_INICIO_MODELO}, 1, 1)
                                AND CURRENT_DATE + INTERVAL '2 years'
          AND tienda <> 'N/A'
          AND codigo_nissei IS NOT NULL
          AND cantidad_recibida IS NOT NULL
          AND cantidad_recibida <> 0
          AND precio_sugerido IS NOT NULL
          AND precio_sugerido >= 0
          AND total_ingreso IS NOT NULL
          AND departamento_codigo IN (
              '1','2','3','4','5','6','7','8','9','10','11','12','13',
              '14','15','16','17','18','19','20','21','22','23','24','25','26'
          )
          AND rubro <> 'N/A'
          AND NOT registro_descartable
    )
    """


def construir_sql_capa2() -> str:
    ctes = construir_ctes_limpieza()
    return f"""
    WITH {ctes},
    duplicados_exactos AS (
        SELECT
            *,
            ROW_NUMBER() OVER (
                PARTITION BY
                    fecha_hora_ingreso, tienda, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo, descripcion, modelo_codigo,
                    cantidad_recibida, precio_sugerido, total_ingreso,
                    estado_producto, mes_lote, mes_lote_numero, anio_lote,
                    personal, tipo_movimiento_ingreso
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
        -- Criterio estricto para versiones repetidas del mismo reporte.
        -- No se elimina una línea repetida dentro de la misma fuente; solo
        -- la copia adicional que aparece en otro archivo u otra hoja.
        SELECT
            *,
            COUNT(*) OVER (
                PARTITION BY
                    fecha_hora_ingreso, tienda, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad_recibida, precio_sugerido,
                    total_ingreso, estado_producto, mes_lote, anio_lote,
                    tipo_movimiento_ingreso
            )::BIGINT AS cantidad_lineas_repetidas_interna,
            MIN(archivo_origen || '|' || hoja_origen) OVER (
                PARTITION BY
                    fecha_hora_ingreso, tienda, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad_recibida, precio_sugerido,
                    total_ingreso, estado_producto, mes_lote, anio_lote,
                    tipo_movimiento_ingreso
            ) AS fuente_minima_interna,
            MAX(archivo_origen || '|' || hoja_origen) OVER (
                PARTITION BY
                    fecha_hora_ingreso, tienda, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad_recibida, precio_sugerido,
                    total_ingreso, estado_producto, mes_lote, anio_lote,
                    tipo_movimiento_ingreso
            ) AS fuente_maxima_interna,
            ROW_NUMBER() OVER (
                PARTITION BY
                    fecha_hora_ingreso, tienda, codigo_nissei, proveedor,
                    lote, departamento_codigo, rubro, linea, sub_linea,
                    marca, modelo_codigo, cantidad_recibida, precio_sugerido,
                    total_ingreso, estado_producto, mes_lote, anio_lote,
                    tipo_movimiento_ingreso
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
            cantidad_lineas_repetidas_interna > 1
            AND fuente_minima_interna <> fuente_maxima_interna
            AND orden_linea_repetida_interno > 1
        )
    )
    SELECT
        fecha_hora_ingreso,
        fecha_ingreso,
        hora_ingreso,
        dia_ingreso,
        mes_numero_ingreso,
        mes_nombre_ingreso,
        trimestre_ingreso,
        anio_ingreso,
        semana_ingreso,
        dia_semana_numero,
        dia_semana_nombre,
        tienda,
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
        cantidad_recibida,
        precio_sugerido,
        total_ingreso,
        estado_producto,
        mes_lote,
        mes_lote_numero,
        anio_lote,
        personal,
        tipo_movimiento_ingreso
    FROM sin_lineas_repetidas
    """


def contar_validos_antes_duplicados(
    conexion: duckdb.DuckDBPyConnection,
) -> int:
    consulta = f"WITH {construir_ctes_limpieza()} SELECT COUNT(*) FROM validos"
    return conexion.execute(consulta).fetchone()[0]


def crear_capa2(conexion: duckdb.DuckDBPyConnection) -> None:
    verificar_capa1(conexion, mostrar_detalle=False)
    if CAPA2_TEMP.exists():
        CAPA2_TEMP.unlink()

    consulta = construir_sql_capa2()
    copiar_sql = f"""
        COPY (
            {consulta}
        )
        TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)
    """

    print("\nGenerando Capa 2 limpia de Ingresos...")
    print(f"Salida temporal: {CAPA2_TEMP}")
    inicio = time.perf_counter()
    try:
        conexion.execute(copiar_sql)
    except Exception:
        if CAPA2_TEMP.exists():
            CAPA2_TEMP.unlink()
        raise
    print(f"Parquet temporal creado en {(time.perf_counter() - inicio) / 60:.2f} minutos.")


def validar_y_publicar_capa2(
    conexion: duckdb.DuckDBPyConnection,
) -> dict[str, int]:
    """Valida la salida sin volver a ejecutar toda la transformación.

    La consulta de creación ya aplica las reglas de limpieza y las ventanas de
    deduplicación. En modo normal se valida el archivo resultante con una sola
    lectura. La auditoría exhaustiva anterior queda disponible mediante
    ETL_VALIDACION_ESTRICTA=1 para controles ocasionales.
    """
    if not CAPA2_TEMP.exists() or CAPA2_TEMP.stat().st_size == 0:
        raise RuntimeError("El archivo temporal de Capa 2 no existe o está vacío.")

    origen = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_CAPA2:
        raise RuntimeError(
            "Las columnas finales de Capa 2 no coinciden con el esquema esperado.\n"
            f"Esperado: {COLUMNAS_CAPA2}\nObtenido: {nombres}"
        )

    columnas_prohibidas = sorted(set(nombres) & COLUMNAS_NO_PUBLICABLES_CAPA2)
    if columnas_prohibidas:
        raise RuntimeError(
            "Capa 2 contiene columnas técnicas no publicables: "
            + ", ".join(columnas_prohibidas)
        )

    tiendas_lista = ", ".join(sql_texto(x) for x in sorted(TIENDAS_NO_NORMALIZADAS))
    proveedores_lista = ", ".join(
        sql_texto(x) for x in sorted(PROVEEDORES_NO_NORMALIZADOS)
    )
    marcas_lista = ", ".join(sql_texto(x) for x in sorted(MARCAS_NO_NORMALIZADAS))
    meses_lista = ", ".join(sql_texto(x) for x in sorted(MESES_NO_NORMALIZADOS))

    controles = conexion.execute(
        f"""
        SELECT
            COUNT(*) AS filas,
            SUM(CASE WHEN fecha_hora_ingreso IS NULL OR fecha_ingreso IS NULL
                          OR dia_ingreso IS NULL OR tienda IS NULL OR tienda = 'N/A'
                          OR codigo_nissei IS NULL OR cantidad_recibida IS NULL
                          OR cantidad_recibida = 0 OR precio_sugerido IS NULL
                          OR total_ingreso IS NULL OR rubro IS NULL OR rubro = 'N/A'
                     THEN 1 ELSE 0 END) AS nulos_criticos,
            SUM(CASE WHEN ABS(total_ingreso - cantidad_recibida * precio_sugerido) > 0.01
                     THEN 1 ELSE 0 END) AS totales_inconsistentes,
            SUM(CASE WHEN tienda IN ({tiendas_lista}) THEN 1 ELSE 0 END)
                AS tiendas_sin_normalizar,
            SUM(CASE WHEN proveedor IN ({proveedores_lista}) THEN 1 ELSE 0 END)
                AS proveedores_sin_normalizar,
            SUM(CASE WHEN marca IN ({marcas_lista}) THEN 1 ELSE 0 END)
                AS marcas_sin_normalizar,
            SUM(CASE WHEN mes_lote IN ({meses_lista}) THEN 1 ELSE 0 END)
                AS meses_sin_normalizar,
            SUM(CASE WHEN departamento_codigo = '101'
                          OR rubro IN ('X.ERROR', 'ERROR')
                          OR linea = 'ERROR' OR sub_linea = 'ERROR'
                          OR codigo_nissei IN ('ERROR50', 'ERROR53', 'ER', '5555555555')
                     THEN 1 ELSE 0 END) AS clasificacion_error
        FROM {origen}
        """
    ).fetchone()

    filas_finales = int(controles[0] or 0)
    if filas_finales <= 0:
        raise RuntimeError("FactIngresosLimpio.parquet está vacío.")
    etiquetas = [
        "campos críticos", "totales", "tiendas", "proveedores",
        "marcas", "meses", "clasificación",
    ]
    errores = [int(valor or 0) for valor in controles[1:]]
    if any(errores):
        detalle = ", ".join(f"{nombre}={valor:,}" for nombre, valor in zip(etiquetas, errores))
        raise RuntimeError("La validación final de Ingresos detectó pendientes: " + detalle)

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
        filas_validas = contar_validos_antes_duplicados(conexion)
        if filas_finales > filas_validas:
            raise RuntimeError(
                f"Capa 2={filas_finales:,} supera filas válidas={filas_validas:,}."
            )
        duplicados_restantes = conexion.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT 1 FROM {origen}
                GROUP BY ALL
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
        "filas_validas": int(filas_validas),
        "filas_finales": filas_finales,
        "filas_descartadas": max(0, filas_capa1 - filas_validas),
        "filas_retiradas_total": max(0, filas_capa1 - filas_finales),
        "duplicados_eliminados": max(0, int(duplicados_eliminados)),
        "validacion_estricta": int(validacion_estricta),
        "columnas": len(esquema),
        "tamano_bytes": CAPA2_FINAL.stat().st_size,
    }


def verificar_capa2(
    conexion: duckdb.DuckDBPyConnection, mostrar_detalle: bool = True
) -> dict[str, int]:
    if not CAPA2_FINAL.exists() or CAPA2_FINAL.stat().st_size == 0:
        raise FileNotFoundError(
            f"No existe una Capa 2 válida en: {CAPA2_FINAL}. "
            "Ejecuta primero --solo-capa2."
        )

    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    esquema = conexion.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()
    nombres = [fila[0] for fila in esquema]
    if nombres != COLUMNAS_CAPA2:
        raise RuntimeError("FactIngresosLimpio.parquet tiene un esquema inesperado.")

    filas = conexion.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas <= 0:
        raise RuntimeError("FactIngresosLimpio.parquet está vacío.")

    if mostrar_detalle:
        resumen = conexion.execute(
            f"""
            SELECT
                COUNT(*) AS filas,
                SUM(CASE WHEN tipo_movimiento_ingreso = 'INGRESO' THEN 1 ELSE 0 END) AS ingresos,
                SUM(CASE WHEN tipo_movimiento_ingreso = 'REVERSIÓN DE INGRESO' THEN 1 ELSE 0 END) AS reversiones,
                SUM(cantidad_recibida) AS cantidad_neta,
                SUM(total_ingreso) AS importe_neto,
                COUNT(DISTINCT proveedor) AS proveedores,
                COUNT(DISTINCT marca) AS marcas,
                COUNT(DISTINCT tienda) AS tiendas
            FROM {origen}
            """
        ).fetchone()
        print("\nResumen de Capa 2:")
        print(f"  - Filas             : {resumen[0]:,}")
        print(f"  - Ingresos          : {resumen[1]:,}")
        print(f"  - Reversiones       : {resumen[2]:,}")
        print(f"  - Cantidad neta     : {resumen[3]:,.4f}")
        print(f"  - Importe neto      : {resumen[4]:,.4f}")
        print(f"  - Proveedores       : {resumen[5]:,}")
        print(f"  - Marcas            : {resumen[6]:,}")
        print(f"  - Tiendas           : {resumen[7]:,}")

        print("\nDistribución por año de ingreso:")
        for anio, cantidad in conexion.execute(
            f"""
            SELECT anio_ingreso, COUNT(*)
            FROM {origen}
            GROUP BY 1
            ORDER BY 1
            """
        ).fetchall():
            print(f"  - {anio}: {cantidad:,} filas")

        print("\nMuestra de datos limpios:")
        for fila in conexion.execute(
            f"""
            SELECT fecha_hora_ingreso, tienda, codigo_nissei, proveedor,
                   rubro, linea, sub_linea, marca, cantidad_recibida,
                   precio_sugerido, total_ingreso, tipo_movimiento_ingreso
            FROM {origen}
            LIMIT 5
            """
        ).fetchall():
            print("  ", fila)

    return {
        "filas": filas,
        "columnas": len(esquema),
        "tamano_bytes": CAPA2_FINAL.stat().st_size,
    }


# ==========================================================
# 7. ORQUESTACIÓN Y COMANDOS
# ==========================================================


def ejecutar_capa1() -> dict[str, int]:
    preparar_carpetas()
    archivos = buscar_archivos_ingresos()
    conexion = crear_conexion(cargar_excel=True)
    try:
        hojas = inspeccionar_fuentes(conexion, archivos)
        crear_capa1(conexion, hojas)
        resumen = validar_y_publicar_capa1(conexion, hojas)
    finally:
        cerrar_duckdb_seguro(conexion)

    print("\n" + "=" * 68)
    print("CAPA 1 DE INGRESOS GENERADA CORRECTAMENTE")
    print("=" * 68)
    print(f"Archivos procesados : {resumen['archivos']}")
    print(f"Hojas procesadas    : {resumen['hojas']}")
    print(f"Filas generadas     : {resumen['filas']:,}")
    print(f"Columnas            : {resumen['columnas']}")
    print(f"Resultado           : {CAPA1_FINAL}")
    return resumen


def ejecutar_capa2() -> dict[str, int]:
    preparar_carpetas()
    conexion = crear_conexion(cargar_excel=False)
    try:
        crear_capa2(conexion)
        resumen = validar_y_publicar_capa2(conexion)
    finally:
        cerrar_duckdb_seguro(conexion)

    print("\n" + "=" * 68)
    print("CAPA 2 DE INGRESOS GENERADA CORRECTAMENTE")
    print("=" * 68)
    print(f"Filas de Capa 1     : {resumen['filas_capa1']:,}")
    if resumen.get("validacion_estricta"):
        print(f"Filas descartadas   : {resumen['filas_descartadas']:,}")
        print(f"Duplicados quitados : {resumen['duplicados_eliminados']:,}")
        print("Validación          : ESTRICTA")
    else:
        print(f"Filas retiradas     : {resumen['filas_retiradas_total']:,}")
        print("Validación          : RÁPIDA (reglas de limpieza intactas)")
    print(f"Filas finales       : {resumen['filas_finales']:,}")
    print(f"Columnas finales    : {resumen['columnas']}")
    print(f"Resultado           : {CAPA2_FINAL}")
    return resumen


def ejecutar_verificacion_capa1() -> None:
    preparar_carpetas()
    conexion = crear_conexion(cargar_excel=False)
    try:
        resumen = verificar_capa1(conexion, mostrar_detalle=True)
    finally:
        cerrar_duckdb_seguro(conexion)
    print("\nCAPA 1 VERIFICADA CORRECTAMENTE")
    print(f"Filas    : {resumen['filas']:,}")
    print(f"Columnas : {resumen['columnas']}")
    print(f"Archivo  : {CAPA1_FINAL}")


def ejecutar_verificacion_capa2() -> None:
    preparar_carpetas()
    conexion = crear_conexion(cargar_excel=False)
    try:
        resumen = verificar_capa2(conexion, mostrar_detalle=True)
    finally:
        cerrar_duckdb_seguro(conexion)
    print("\nCAPA 2 VERIFICADA CORRECTAMENTE")
    print(f"Filas    : {resumen['filas']:,}")
    print(f"Columnas : {resumen['columnas']}")
    print(f"Archivo  : {CAPA2_FINAL}")


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Pipeline completa de Ingresos: Excel RMS -> Capa 1 Parquet -> "
            "Capa 2 limpia y sin duplicados."
        )
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument(
        "--solo-capa1", action="store_true", help="Genera solamente Capa 1."
    )
    grupo.add_argument(
        "--solo-capa2", action="store_true", help="Genera Capa 2 desde Capa 1."
    )
    grupo.add_argument(
        "--verificar-capa1", action="store_true", help="Valida Capa 1 existente."
    )
    grupo.add_argument(
        "--verificar-capa2", action="store_true", help="Valida Capa 2 existente."
    )
    return parser


def main() -> None:
    parser = construir_parser()
    argumentos = parser.parse_args()

    print("=" * 68)
    print("PIPELINE DE INGRESOS")
    print("Excel RMS -> Fact_Ingresos -> Fact_Ingresos_Limpia")
    print("=" * 68)

    if argumentos.solo_capa1:
        ejecutar_capa1()
    elif argumentos.solo_capa2:
        ejecutar_capa2()
    elif argumentos.verificar_capa1:
        ejecutar_verificacion_capa1()
    elif argumentos.verificar_capa2:
        ejecutar_verificacion_capa2()
    else:
        ejecutar_capa1()
        ejecutar_capa2()


if __name__ == "__main__":
    codigo_salida = 0
    try:
        main()
    except KeyboardInterrupt:
        print("\nEjecución cancelada por el usuario.")
        codigo_salida = 130
    except Exception as exc:
        print("\nERROR EN LA PIPELINE DE INGRESOS")
        print(f"Tipo   : {type(exc).__name__}")
        print(f"Detalle: {exc}")
        codigo_salida = 1
    finalizar_proceso(codigo_salida)
