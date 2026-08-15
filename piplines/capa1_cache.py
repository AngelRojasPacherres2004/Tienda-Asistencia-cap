from __future__ import annotations

"""Cache incremental por archivo RMS para Capa 1.

Cada Excel se convierte una sola vez a un Parquet intermedio. Si únicamente
cambia el archivo del año actual, los históricos no vuelven a leerse.
"""

import hashlib
import re
from pathlib import Path

from project_paths import WORK_C1_CACHE_DIR


def _slug(texto: str) -> str:
    valor = re.sub(r"[^A-Za-z0-9]+", "_", texto).strip("_")
    return (valor or "fuente")[:48]


def ruta_cache(
    entidad: str,
    archivo: Path,
    version: str,
    script: Path,
) -> Path:
    stat = archivo.stat()
    identidad = hashlib.sha1(
        str(archivo.resolve()).casefold().encode("utf-8")
    ).hexdigest()[:10]
    firma = hashlib.sha1(
        (
            f"{stat.st_mtime_ns}|{stat.st_size}|{version}|"
            f"{script.stat().st_mtime_ns}"
        ).encode("utf-8")
    ).hexdigest()[:16]
    carpeta = WORK_C1_CACHE_DIR / entidad.casefold()
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta / f"{_slug(archivo.stem)}__{identidad}__{firma}.parquet"


def limpiar_versiones_anteriores(actual: Path) -> None:
    partes = actual.stem.split("__")
    if len(partes) < 3:
        return
    prefijo = "__".join(partes[:2]) + "__"
    for candidato in actual.parent.glob(prefijo + "*.parquet"):
        if candidato != actual:
            candidato.unlink(missing_ok=True)
