from __future__ import annotations

"""Pipeline estable para METAS_TIENDAS.xlsx.

La homologación y las validaciones se realizan en Python porque la fuente es
pequeña y controlada. DuckDB se usa únicamente para convertir un CSV final ya
validado a Parquet tipado. Esto evita el árbol SQL profundo que provocaba
STATUS_STACK_OVERFLOW en Windows + Python 3.14 + DuckDB 1.5.x.
"""

import argparse
import csv
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt"
    ) from exc

from maestros import (
    ANIO_INICIO_MODELO,
    TIENDA_IDS,
    homologar_tienda_python,
    limpiar_texto_python,
    sql_literal,
    tienda_id_python,
)
from project_paths import CAPA1_DIR, CAPA2_DIR, PROJECT_ROOT, WORK_TEMP_DIR
from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from xlsx_staging import materializar_hoja_csv

SALIDA = CAPA2_DIR / "FactMetasTienda.parquet"
TEMP = WORK_TEMP_DIR / "FactMetasTienda_temporal.parquet"
CSV_FINAL = WORK_TEMP_DIR / "FactMetasTienda_final.csv"
DIM_TIENDAS = CAPA2_DIR / "DimTiendas.parquet"

ARCHIVOS_PREFERIDOS = (
    "METAS_TIENDAS.xlsx",
    "METAS_TIENDAS_MENSUALES_CAPA1.xlsx",
)
HOJAS_PERMITIDAS = ("METAS_TIENDAS", "METAS_TIENDAS_C1")
COLUMNAS_MINIMAS = {
    "fecha_periodo",
    "anio",
    "mes_numero",
    "mes_nombre",
    "nivel_periodo",
    "tienda",
    "meta_ventas",
}
COLUMNAS_SALIDA = [
    "meta_tienda_id",
    "fecha_id",
    "periodo_id",
    "fecha_inicio_periodo",
    "fecha_fin_periodo",
    "anio",
    "mes_numero",
    "mes_nombre",
    "trimestre",
    "nivel_periodo",
    "tienda_id",
    "tienda",
    "indicador",
    "meta_ventas",
    "moneda",
    "estado_registro",
    "es_meta_valida",
]
NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NOMBRES_MESES = {
    1: "ENERO",
    2: "FEBRERO",
    3: "MARZO",
    4: "ABRIL",
    5: "MAYO",
    6: "JUNIO",
    7: "JULIO",
    8: "AGOSTO",
    9: "SEPTIEMBRE",
    10: "OCTUBRE",
    11: "NOVIEMBRE",
    12: "DICIEMBRE",
}
TOKENS_NUMERICOS_NULOS = {"", "N A", "NA", "NULL", "NONE", "NULO", "-", "--"}


@dataclass(frozen=True)
class MetaNormalizada:
    meta_tienda_id: str
    fecha_id: int
    periodo_id: int
    fecha_inicio_periodo: date
    fecha_fin_periodo: date
    anio: int
    mes_numero: int
    mes_nombre: str
    trimestre: int
    nivel_periodo: str
    tienda_id: str
    tienda: str
    indicador: str
    meta_ventas: Decimal | None
    moneda: str
    estado_registro: str
    es_meta_valida: bool

    def como_fila_csv(self) -> dict[str, str]:
        return {
            "meta_tienda_id": self.meta_tienda_id,
            "fecha_id": str(self.fecha_id),
            "periodo_id": str(self.periodo_id),
            "fecha_inicio_periodo": self.fecha_inicio_periodo.isoformat(),
            "fecha_fin_periodo": self.fecha_fin_periodo.isoformat(),
            "anio": str(self.anio),
            "mes_numero": str(self.mes_numero),
            "mes_nombre": self.mes_nombre,
            "trimestre": str(self.trimestre),
            "nivel_periodo": self.nivel_periodo,
            "tienda_id": self.tienda_id,
            "tienda": self.tienda,
            "indicador": self.indicador,
            "meta_ventas": "" if self.meta_ventas is None else format(self.meta_ventas, ".2f"),
            "moneda": self.moneda,
            "estado_registro": self.estado_registro,
            "es_meta_valida": "true" if self.es_meta_valida else "false",
        }


def conectar() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, PROJECT_ROOT, preserve_insertion_order=False)
    return con


def buscar_archivo() -> Path:
    for nombre in ARCHIVOS_PREFERIDOS:
        candidato = CAPA1_DIR / nombre
        if candidato.exists():
            return candidato
    candidatos = sorted(
        p
        for p in CAPA1_DIR.glob("*.xlsx")
        if not p.name.startswith("~$")
        and "META" in p.stem.upper()
        and "TIENDA" in p.stem.upper()
    )
    if not candidatos:
        raise FileNotFoundError(f"No se encontró un Excel de metas dentro de {CAPA1_DIR}.")
    if len(candidatos) > 1:
        raise RuntimeError(
            "Hay varios archivos de metas. Conserva solamente el vigente:\n"
            + "\n".join(f"- {p.name}" for p in candidatos)
        )
    return candidatos[0]


def nombres_hojas(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as libro:
        workbook = ET.fromstring(libro.read("xl/workbook.xml"))
        contenedor = workbook.find(f"{{{NS_MAIN}}}sheets")
        return [] if contenedor is None else [h.attrib["name"] for h in contenedor]


def buscar_hoja(archivo: Path) -> str:
    hojas = nombres_hojas(archivo)
    for nombre in HOJAS_PERMITIDAS:
        if nombre in hojas:
            return nombre
    candidatas = [h for h in hojas if "META" in h.upper() and "TIENDA" in h.upper()]
    if len(candidatas) == 1:
        return candidatas[0]
    raise RuntimeError(
        f"No se encontró una hoja válida. Permitidas={HOJAS_PERMITIDAS}; encontradas={hojas}"
    )


def _texto(valor: Any) -> str:
    return "" if valor is None else str(valor).strip()


def parsear_entero(valor: Any) -> int | None:
    texto = _texto(valor)
    if not texto:
        return None
    try:
        return int(Decimal(texto.replace(",", ".")))
    except (InvalidOperation, ValueError):
        return None


def parsear_fecha(valor: Any) -> date | None:
    texto = _texto(valor)
    if not texto:
        return None

    numero = texto.replace(",", ".")
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", numero):
        try:
            serial = Decimal(numero)
            if Decimal("1") <= serial <= Decimal("100000"):
                return date(1899, 12, 30) + timedelta(days=int(serial))
        except (InvalidOperation, OverflowError):
            pass

    # ISO con hora o zona: se usa solamente la parte de fecha.
    iso = texto.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(iso).date()
    except ValueError:
        pass

    for formato in ("%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def parsear_decimal(valor: Any) -> Decimal | None:
    texto = _texto(valor).replace("\u00a0", " ")
    if not texto:
        return None
    clave = re.sub(r"[^A-Z0-9]+", " ", texto.upper()).strip()
    if clave in TOKENS_NUMERICOS_NULOS:
        return None

    limpio = re.sub(r"[^0-9,\.\-]", "", texto)
    if limpio in {"", "-", ".", ","}:
        return None

    # Soporta 1234.56, 1234,56, 1,234.56 y 1.234,56.
    if "," in limpio and "." in limpio:
        if limpio.rfind(",") > limpio.rfind("."):
            limpio = limpio.replace(".", "").replace(",", ".")
        else:
            limpio = limpio.replace(",", "")
    elif "," in limpio:
        if limpio.count(",") == 1:
            entero, decimales = limpio.split(",", 1)
            limpio = f"{entero}.{decimales}"
        else:
            limpio = limpio.replace(",", "")

    try:
        return Decimal(limpio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None


def ultimo_dia_mes(fecha: date) -> date:
    if fecha.month == 12:
        siguiente = date(fecha.year + 1, 1, 1)
    else:
        siguiente = date(fecha.year, fecha.month + 1, 1)
    return siguiente - timedelta(days=1)


def cargar_tiendas_maestras() -> set[str]:
    """Obtiene IDs válidos del maestro, incluidas tiendas futuras de TIENDAS.xlsx."""
    ids = set(TIENDA_IDS.values())
    archivo = CAPA1_DIR / "TIENDAS.xlsx"
    if not archivo.exists():
        return ids
    hojas = nombres_hojas(archivo)
    hoja = "TIENDAS" if "TIENDAS" in hojas else (hojas[0] if hojas else None)
    if not hoja:
        return ids
    csv_tiendas = materializar_hoja_csv(archivo, hoja)
    with csv_tiendas.open("r", encoding="utf-8-sig", newline="") as f:
        lector = csv.DictReader(f)
        if not lector.fieldnames or "tienda" not in lector.fieldnames:
            raise RuntimeError("TIENDAS.xlsx no contiene la columna 'tienda'.")
        for fila in lector:
            identificador = tienda_id_python(fila.get("tienda"))
            if identificador:
                ids.add(identificador)
    return ids


def normalizar_fila(fila: dict[str, str], numero_fila: int, anio_inicio: int) -> MetaNormalizada | None:
    fecha_fuente = parsear_fecha(fila.get("fecha_periodo"))
    anio_fuente = parsear_entero(fila.get("anio"))
    mes_fuente = parsear_entero(fila.get("mes_numero"))

    fecha_inicio = fecha_fuente
    if fecha_inicio is None and anio_fuente is not None and mes_fuente is not None:
        if anio_inicio <= anio_fuente <= 9999 and 1 <= mes_fuente <= 12:
            fecha_inicio = date(anio_fuente, mes_fuente, 1)
    if fecha_inicio is None or fecha_inicio.year < anio_inicio:
        return None

    # El grano de negocio es mensual. Se normaliza siempre al primer día del mes,
    # incluso cuando el Excel contiene otra fecha válida dentro del mismo mes.
    fecha_inicio = date(fecha_inicio.year, fecha_inicio.month, 1)

    tienda = homologar_tienda_python(fila.get("tienda"))
    tienda_id = tienda_id_python(tienda)
    if tienda is None or tienda_id is None:
        raise RuntimeError(f"Fila {numero_fila}: tienda vacía o no homologable.")

    meta_original = parsear_decimal(fila.get("meta_ventas"))
    meta = meta_original if meta_original is not None and meta_original > 0 else None
    estado = "META DEFINIDA" if meta is not None else "SIN META"
    anio = fecha_inicio.year
    mes = fecha_inicio.month
    periodo_id = anio * 100 + mes
    fecha_id = anio * 10000 + mes * 100 + 1
    trimestre = ((mes - 1) // 3) + 1
    meta_id = f"{periodo_id}_{tienda_id}_META_VENTAS"

    return MetaNormalizada(
        meta_tienda_id=meta_id,
        fecha_id=fecha_id,
        periodo_id=periodo_id,
        fecha_inicio_periodo=fecha_inicio,
        fecha_fin_periodo=ultimo_dia_mes(fecha_inicio),
        anio=anio,
        mes_numero=mes,
        mes_nombre=NOMBRES_MESES[mes],
        trimestre=trimestre,
        nivel_periodo="MENSUAL",
        tienda_id=tienda_id,
        tienda=tienda,
        indicador="META VENTAS",
        meta_ventas=meta,
        moneda="PEN",
        estado_registro=estado,
        es_meta_valida=meta is not None,
    )


def cargar_y_normalizar(archivo: Path, hoja: str, anio_inicio: int) -> list[MetaNormalizada]:
    csv_origen = materializar_hoja_csv(archivo, hoja)
    with csv_origen.open("r", encoding="utf-8-sig", newline="") as f:
        lector = csv.DictReader(f)
        columnas = set(lector.fieldnames or [])
        faltan = sorted(COLUMNAS_MINIMAS - columnas)
        if faltan:
            raise RuntimeError(
                f"El Excel de metas no contiene columnas mínimas. "
                f"Faltan={faltan}; encontradas={sorted(columnas)}"
            )
        filas: list[MetaNormalizada] = []
        for numero, fila in enumerate(lector, start=2):
            if not any(_texto(v) for v in fila.values()):
                continue
            normalizada = normalizar_fila(fila, numero, anio_inicio)
            if normalizada is not None:
                filas.append(normalizada)
    return filas


def validar_filas(filas: list[MetaNormalizada]) -> dict[str, int]:
    if not filas:
        raise RuntimeError("No hay registros de metas válidos para publicar.")

    ids_validos = cargar_tiendas_maestras()
    ids_meta: set[str] = set()
    claves: set[tuple[int, str, str]] = set()
    duplicados: list[str] = []
    huerfanas: set[str] = set()
    sin_meta = 0

    for fila in filas:
        if fila.meta_tienda_id in ids_meta:
            duplicados.append(fila.meta_tienda_id)
        ids_meta.add(fila.meta_tienda_id)

        clave = (fila.periodo_id, fila.tienda_id, fila.indicador)
        if clave in claves:
            duplicados.append("|".join(map(str, clave)))
        claves.add(clave)

        if fila.tienda_id not in ids_validos:
            huerfanas.add(f"{fila.tienda_id}:{fila.tienda}")
        if fila.estado_registro == "SIN META":
            sin_meta += 1
        if fila.meta_ventas is not None and fila.meta_ventas < 0:
            raise RuntimeError(f"Meta negativa no permitida: {fila.meta_tienda_id}")

    if duplicados:
        muestra = ", ".join(duplicados[:10])
        raise RuntimeError(f"Hay claves duplicadas de metas: {muestra}")
    if huerfanas:
        raise RuntimeError(
            "Hay tiendas de metas que no existen en TIENDAS.xlsx: "
            + ", ".join(sorted(huerfanas))
        )

    return {
        "filas": len(filas),
        "tiendas": len({f.tienda_id for f in filas}),
        "periodos": len({f.periodo_id for f in filas}),
        "sin_meta": sin_meta,
    }


def escribir_csv_final(filas: list[MetaNormalizada]) -> None:
    CSV_FINAL.parent.mkdir(parents=True, exist_ok=True)
    temporal = CSV_FINAL.with_suffix(".csv.tmp")
    temporal.unlink(missing_ok=True)
    with temporal.open("w", encoding="utf-8", newline="") as f:
        escritor = csv.DictWriter(f, fieldnames=COLUMNAS_SALIDA, lineterminator="\n")
        escritor.writeheader()
        for fila in filas:
            escritor.writerow(fila.como_fila_csv())
    os.replace(temporal, CSV_FINAL)


def publicar_parquet(filas_esperadas: int) -> int:
    """Convierte el CSV validado a Parquet con una consulta plana y pequeña."""
    TEMP.unlink(missing_ok=True)
    con = conectar()
    try:
        origen = sql_literal(CSV_FINAL.as_posix())
        destino = sql_literal(TEMP.as_posix())
        consulta = f"""
        SELECT
            CAST(meta_tienda_id AS VARCHAR) AS meta_tienda_id,
            CAST(fecha_id AS INTEGER) AS fecha_id,
            CAST(periodo_id AS INTEGER) AS periodo_id,
            CAST(fecha_inicio_periodo AS DATE) AS fecha_inicio_periodo,
            CAST(fecha_fin_periodo AS DATE) AS fecha_fin_periodo,
            CAST(anio AS INTEGER) AS anio,
            CAST(mes_numero AS INTEGER) AS mes_numero,
            CAST(mes_nombre AS VARCHAR) AS mes_nombre,
            CAST(trimestre AS INTEGER) AS trimestre,
            CAST(nivel_periodo AS VARCHAR) AS nivel_periodo,
            CAST(tienda_id AS VARCHAR) AS tienda_id,
            CAST(tienda AS VARCHAR) AS tienda,
            CAST(indicador AS VARCHAR) AS indicador,
            TRY_CAST(NULLIF(meta_ventas, '') AS DECIMAL(20,2)) AS meta_ventas,
            CAST(moneda AS VARCHAR) AS moneda,
            CAST(estado_registro AS VARCHAR) AS estado_registro,
            CAST(es_meta_valida AS BOOLEAN) AS es_meta_valida
        FROM read_csv({origen}, header=true, auto_detect=true, all_varchar=true, sample_size=-1)
        """
        con.execute(
            f"COPY ({consulta}) TO {destino} "
            "(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)"
        )

        if not TEMP.exists() or TEMP.stat().st_size == 0:
            raise RuntimeError("DuckDB no generó el Parquet temporal de metas.")

        filas, nulos, inconsistentes = con.execute(
            f"""
            SELECT
                COUNT(*),
                COUNT(*) FILTER (
                    WHERE meta_tienda_id IS NULL OR fecha_id IS NULL
                       OR periodo_id IS NULL OR tienda_id IS NULL
                ),
                COUNT(*) FILTER (
                    WHERE (estado_registro = 'META DEFINIDA') IS DISTINCT FROM es_meta_valida
                       OR (es_meta_valida AND (meta_ventas IS NULL OR meta_ventas <= 0))
                       OR (NOT es_meta_valida AND meta_ventas IS NOT NULL)
                )
            FROM read_parquet({destino})
            """
        ).fetchone()
        if int(filas) != filas_esperadas or int(nulos) or int(inconsistentes):
            raise RuntimeError(
                "FactMetasTienda temporal inválida: "
                f"filas={filas}, esperadas={filas_esperadas}, "
                f"nulos={nulos}, inconsistentes={inconsistentes}"
            )

        SALIDA.parent.mkdir(parents=True, exist_ok=True)
        os.replace(TEMP, SALIDA)
        return int(filas)
    finally:
        cerrar_duckdb_seguro(con)


def validar_parquet() -> int:
    if not SALIDA.exists() or SALIDA.stat().st_size == 0:
        raise FileNotFoundError(f"No existe un Parquet válido en {SALIDA}")
    con = conectar()
    try:
        p = sql_literal(SALIDA.as_posix())
        columnas = [
            fila[0]
            for fila in con.execute(
                f"DESCRIBE SELECT * FROM read_parquet({p})"
            ).fetchall()
        ]
        faltan = [c for c in COLUMNAS_SALIDA if c not in columnas]
        if faltan:
            raise RuntimeError(f"FactMetasTienda no contiene columnas: {faltan}")
        filas, ids, nulos = con.execute(
            f"""
            SELECT COUNT(*), COUNT(DISTINCT meta_tienda_id),
                   COUNT(*) FILTER (
                       WHERE meta_tienda_id IS NULL OR fecha_id IS NULL
                          OR periodo_id IS NULL OR tienda_id IS NULL
                   )
            FROM read_parquet({p})
            """
        ).fetchone()
        if not filas or filas != ids or nulos:
            raise RuntimeError(
                f"FactMetasTienda inválida: filas={filas}, ids={ids}, nulos={nulos}"
            )
        return int(filas)
    finally:
        cerrar_duckdb_seguro(con)


def ejecutar(modo: str, anio_inicio: int) -> None:
    if modo == "verificar-capa2":
        filas = validar_parquet()
        print("\nFACT_METAS_TIENDA VERIFICADA")
        print(f"Filas   : {filas:,}")
        print(f"Archivo : {SALIDA}")
        return

    archivo = buscar_archivo()
    hoja = buscar_hoja(archivo)
    print("\nPreparando metas con motor Python estable...", flush=True)
    filas = cargar_y_normalizar(archivo, hoja, anio_inicio)
    resumen = validar_filas(filas)

    print("\nCAPA 1 DE METAS VERIFICADA")
    print(f"Archivo       : {archivo}")
    print(f"Hoja          : {hoja}")
    print(f"Registros     : {resumen['filas']:,}")
    print(f"Tiendas       : {resumen['tiendas']:,}")
    print(f"Periodos      : {resumen['periodos']:,}")
    print(f"Registros sin meta: {resumen['sin_meta']:,}")
    print("Homologación  : Python + maestro central; sin SQL anidado")

    if modo == "verificar-capa1":
        return

    escribir_csv_final(filas)
    filas_publicadas = publicar_parquet(len(filas))
    print("\nFACT_METAS_TIENDA GENERADA CORRECTAMENTE")
    print(f"Registros : {filas_publicadas:,}")
    print(f"Resultado : {SALIDA}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="METAS_TIENDAS.xlsx -> capa2/FactMetasTienda.parquet"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    grupo.add_argument("--solo-capa2", action="store_true")
    parser.add_argument("--anio-inicio", type=int, default=ANIO_INICIO_MODELO)
    args = parser.parse_args()

    try:
        modo = (
            "verificar-capa1"
            if args.verificar_capa1
            else "verificar-capa2"
            if args.verificar_capa2
            else "crear"
        )
        ejecutar(modo, args.anio_inicio)
        return 0
    except KeyboardInterrupt:
        TEMP.unlink(missing_ok=True)
        CSV_FINAL.unlink(missing_ok=True)
        print("\nProceso cancelado por el usuario.", file=sys.stderr)
        return 130
    except Exception as exc:
        TEMP.unlink(missing_ok=True)
        print("\nERROR EN PIPELINE DE METAS", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
