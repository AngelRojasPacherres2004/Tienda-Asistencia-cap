from __future__ import annotations

"""Lectura estable de hojas XLSX sin depender de la extensión Excel de DuckDB.

Los Excel manuales se convierten a CSV UTF-8 dentro de ``.etl_work/xlsx_staging``.
El archivo de staging se reutiliza mientras no cambien tamaño ni fecha de
modificación del XLSX. DuckDB solo lee el CSV, evitando instalaciones de
extensiones, cierres nativos y reprocesamiento innecesario del libro.
"""

import csv
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterator

from project_paths import WORK_XLSX_DIR

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"


def _sql_literal(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def _nombre_seguro(valor: str) -> str:
    texto = unicodedata.normalize("NFKD", valor)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Za-z0-9_-]+", "_", texto).strip("_")
    return texto[:80] or "hoja"


def _indice_columna(referencia: str) -> int:
    letras = re.match(r"[A-Za-z]+", referencia or "")
    if not letras:
        return 0
    valor = 0
    for caracter in letras.group(0).upper():
        valor = valor * 26 + (ord(caracter) - 64)
    return max(valor - 1, 0)


def _ruta_hoja(zf: zipfile.ZipFile, hoja: str) -> str:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    relacion_id: str | None = None
    for nodo in workbook.findall(f".//{{{NS_MAIN}}}sheet"):
        if nodo.attrib.get("name") == hoja:
            relacion_id = nodo.attrib.get(f"{{{NS_REL_DOC}}}id")
            break
    if not relacion_id:
        disponibles = [
            n.attrib.get("name", "")
            for n in workbook.findall(f".//{{{NS_MAIN}}}sheet")
        ]
        raise KeyError(f"No existe la hoja {hoja!r}. Hojas disponibles: {disponibles}")

    relaciones = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    objetivo: str | None = None
    for nodo in relaciones.findall(f".//{{{NS_REL_PKG}}}Relationship"):
        if nodo.attrib.get("Id") == relacion_id:
            objetivo = nodo.attrib.get("Target")
            break
    if not objetivo:
        raise RuntimeError(f"No se encontró la relación interna de la hoja {hoja!r}")

    objetivo = objetivo.replace("\\", "/")
    if objetivo.startswith("/"):
        return objetivo.lstrip("/")
    if objetivo.startswith("xl/"):
        return objetivo
    return f"xl/{objetivo.lstrip('./')}"


def nombres_hojas(archivo: Path) -> list[str]:
    with zipfile.ZipFile(archivo) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        return [
            nodo.attrib.get("name", "")
            for nodo in workbook.findall(f".//{{{NS_MAIN}}}sheet")
        ]


def _shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    valores: list[str] = []
    with zf.open("xl/sharedStrings.xml") as archivo:
        for evento, nodo in ET.iterparse(archivo, events=("end",)):
            if nodo.tag == f"{{{NS_MAIN}}}si":
                partes = [
                    t.text or "" for t in nodo.iter(f"{{{NS_MAIN}}}t")
                ]
                valores.append("".join(partes))
                nodo.clear()
    return valores


def _valor_celda(celda: ET.Element, compartidas: list[str]) -> str:
    tipo = celda.attrib.get("t", "")
    if tipo == "inlineStr":
        return "".join(
            t.text or "" for t in celda.iter(f"{{{NS_MAIN}}}t")
        )

    nodo_valor = celda.find(f"{{{NS_MAIN}}}v")
    if nodo_valor is None or nodo_valor.text is None:
        return ""
    valor = nodo_valor.text

    if tipo == "s":
        try:
            return compartidas[int(valor)]
        except (ValueError, IndexError):
            return ""
    if tipo == "b":
        return "TRUE" if valor == "1" else "FALSE"
    return valor


def _iterar_filas(
    zf: zipfile.ZipFile,
    ruta_hoja: str,
    compartidas: list[str],
) -> Iterator[tuple[int, dict[int, str]]]:
    with zf.open(ruta_hoja) as archivo:
        for evento, nodo in ET.iterparse(archivo, events=("end",)):
            if nodo.tag != f"{{{NS_MAIN}}}row":
                continue
            numero = int(nodo.attrib.get("r", "0") or 0)
            celdas: dict[int, str] = {}
            siguiente = 0
            for celda in nodo.findall(f"{{{NS_MAIN}}}c"):
                referencia = celda.attrib.get("r")
                indice = _indice_columna(referencia) if referencia else siguiente
                celdas[indice] = _valor_celda(celda, compartidas)
                siguiente = indice + 1
            yield numero, celdas
            nodo.clear()


def materializar_hoja_csv(
    archivo: Path,
    hoja: str,
    directorio_staging: Path | None = None,
) -> Path:
    archivo = Path(archivo).resolve()
    if not archivo.exists():
        raise FileNotFoundError(archivo)

    staging = directorio_staging or WORK_XLSX_DIR
    staging.mkdir(parents=True, exist_ok=True)
    stat = archivo.stat()
    prefijo = f"{_nombre_seguro(archivo.stem)}__{_nombre_seguro(hoja)}"
    salida = staging / f"{prefijo}__{stat.st_mtime_ns}_{stat.st_size}.csv"
    if salida.exists() and salida.stat().st_size > 0:
        return salida

    temporal = salida.with_suffix(".csv.tmp")
    temporal.unlink(missing_ok=True)

    with zipfile.ZipFile(archivo) as zf:
        ruta = _ruta_hoja(zf, hoja)
        compartidas = _shared_strings(zf)

        max_columna = -1
        filas_con_datos = 0
        for _, celdas in _iterar_filas(zf, ruta, compartidas):
            if celdas:
                max_columna = max(max_columna, max(celdas))
                if any(valor != "" for valor in celdas.values()):
                    filas_con_datos += 1

        if max_columna < 0 or filas_con_datos == 0:
            raise RuntimeError(f"La hoja {hoja!r} de {archivo.name} está vacía")

        with temporal.open("w", newline="", encoding="utf-8") as destino:
            escritor = csv.writer(destino, lineterminator="\n")
            for _, celdas in _iterar_filas(zf, ruta, compartidas):
                fila = [celdas.get(i, "") for i in range(max_columna + 1)]
                if any(valor != "" for valor in fila):
                    escritor.writerow(fila)

    temporal.replace(salida)

    for anterior in staging.glob(f"{prefijo}__*.csv"):
        if anterior != salida:
            anterior.unlink(missing_ok=True)
    return salida


def origen_xlsx_csv(
    archivo: Path,
    hoja: str,
    directorio_staging: Path | None = None,
) -> str:
    csv_path = materializar_hoja_csv(archivo, hoja, directorio_staging)
    return (
        "read_csv("
        f"{_sql_literal(csv_path.as_posix())}, "
        "header=true, auto_detect=true, all_varchar=true, "
        "sample_size=-1, null_padding=true, ignore_errors=false)"
    )
