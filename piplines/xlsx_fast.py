from __future__ import annotations

"""Lectura ultraligera de las primeras filas de un XLSX.

No abre la hoja con DuckDB ni carga el libro completo en memoria. Lee únicamente
los XML internos necesarios para detectar encabezados y filas iniciales. Esto
evita que ``read_xlsx`` recorra hojas de cientos de miles de filas solo para
inspeccionar A1 o las primeras 30 filas.
"""

import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _columna_numero(referencia: str) -> int:
    coincidencia = re.match(r"([A-Za-z]+)", referencia or "")
    if not coincidencia:
        return 0
    numero = 0
    for caracter in coincidencia.group(1).upper():
        numero = numero * 26 + ord(caracter) - 64
    return numero


def _ruta_hoja(libro: zipfile.ZipFile, nombre_hoja: str) -> str:
    nombres_zip = {nombre.lower(): nombre for nombre in libro.namelist()}
    workbook = ET.fromstring(libro.read("xl/workbook.xml"))
    relaciones_xml = ET.fromstring(libro.read("xl/_rels/workbook.xml.rels"))
    relaciones = {
        elemento.attrib["Id"]: elemento.attrib["Target"]
        for elemento in relaciones_xml
    }
    contenedor = workbook.find(f"{{{NS_MAIN}}}sheets")
    if contenedor is None:
        raise ValueError("El XLSX no contiene el nodo sheets.")
    for hoja in contenedor:
        if hoja.attrib.get("name") != nombre_hoja:
            continue
        relacion_id = hoja.attrib[f"{{{NS_REL_OFFICE}}}id"]
        destino = relaciones[relacion_id]
        ruta = (
            destino.lstrip("/")
            if destino.startswith("/")
            else f"xl/{destino}".replace("xl//", "xl/")
        )
        real = nombres_zip.get(ruta.lower())
        if real is None:
            raise FileNotFoundError(
                f"No se encontró el XML de la hoja {nombre_hoja}."
            )
        return real
    raise KeyError(f"No existe la hoja {nombre_hoja!r}.")


def _texto_inline(celda: ET.Element) -> str | None:
    nodo_is = celda.find(f"{{{NS_MAIN}}}is")
    if nodo_is is None:
        return None
    partes = [
        nodo.text or ""
        for nodo in nodo_is.iter(f"{{{NS_MAIN}}}t")
    ]
    return "".join(partes)


def _leer_shared_strings(
    libro: zipfile.ZipFile,
    indices: set[int],
) -> dict[int, str]:
    if not indices:
        return {}
    nombres_zip = {nombre.lower(): nombre for nombre in libro.namelist()}
    ruta = nombres_zip.get("xl/sharedstrings.xml")
    if ruta is None:
        return {}
    pendientes = set(indices)
    encontrados: dict[int, str] = {}
    posicion = -1
    with libro.open(ruta) as flujo:
        for evento, elemento in ET.iterparse(flujo, events=("end",)):
            if elemento.tag != f"{{{NS_MAIN}}}si":
                continue
            posicion += 1
            if posicion in pendientes:
                encontrados[posicion] = "".join(
                    nodo.text or ""
                    for nodo in elemento.iter(f"{{{NS_MAIN}}}t")
                )
                pendientes.remove(posicion)
                if not pendientes:
                    break
            elemento.clear()
    return encontrados


def leer_filas_xlsx(
    archivo: Path,
    hoja: str,
    max_filas: int = 30,
    max_columnas: int = 30,
) -> list[list[Any]]:
    """Devuelve las primeras filas de una hoja sin escanear el XLSX completo."""
    if max_filas < 1 or max_columnas < 1:
        return []
    filas_crudas: dict[int, dict[int, tuple[str | None, str | None]]] = {}
    indices_shared: set[int] = set()
    with zipfile.ZipFile(archivo) as libro:
        ruta_hoja = _ruta_hoja(libro, hoja)
        with libro.open(ruta_hoja) as flujo:
            for evento, elemento in ET.iterparse(flujo, events=("end",)):
                if elemento.tag != f"{{{NS_MAIN}}}row":
                    continue
                numero_fila = int(elemento.attrib.get("r", "0") or 0)
                if numero_fila > max_filas:
                    elemento.clear()
                    break
                datos: dict[int, tuple[str | None, str | None]] = {}
                for celda in elemento.findall(f"{{{NS_MAIN}}}c"):
                    columna = _columna_numero(celda.attrib.get("r", ""))
                    if not (1 <= columna <= max_columnas):
                        continue
                    tipo = celda.attrib.get("t")
                    if tipo == "inlineStr":
                        valor = _texto_inline(celda)
                    else:
                        nodo_v = celda.find(f"{{{NS_MAIN}}}v")
                        valor = nodo_v.text if nodo_v is not None else None
                    datos[columna] = (tipo, valor)
                    if tipo == "s" and valor not in (None, ""):
                        try:
                            indices_shared.add(int(valor))
                        except ValueError:
                            pass
                filas_crudas[numero_fila] = datos
                elemento.clear()
        compartidas = _leer_shared_strings(libro, indices_shared)

    filas: list[list[Any]] = []
    for numero_fila in range(1, max_filas + 1):
        datos = filas_crudas.get(numero_fila, {})
        salida: list[Any] = []
        for columna in range(1, max_columnas + 1):
            tipo, valor = datos.get(columna, (None, None))
            if tipo == "s" and valor not in (None, ""):
                try:
                    salida.append(compartidas.get(int(valor), valor))
                except ValueError:
                    salida.append(valor)
            elif tipo == "b":
                salida.append(valor == "1")
            else:
                salida.append(valor)
        filas.append(salida)
    while filas and all(v in (None, "") for v in filas[-1]):
        filas.pop()
    return filas
