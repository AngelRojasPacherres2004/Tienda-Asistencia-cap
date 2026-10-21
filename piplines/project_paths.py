from __future__ import annotations

"""Rutas portables del proyecto DashboardGeneral.

Los scripts pueden vivir dentro de ``<proyecto>/piplines`` o directamente en
la raíz del proyecto. Nunca se fija una ruta perteneciente a un usuario específico.
También puede definirse ``DASHBOARD_PROJECT_ROOT`` para ejecutar desde otra
ubicación sin modificar el código.
"""

import os
import shutil
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

_raiz_entorno = os.getenv("DASHBOARD_PROJECT_ROOT", "").strip()
if _raiz_entorno:
    PROJECT_ROOT = Path(_raiz_entorno).expanduser().resolve()
elif SCRIPT_DIR.name.casefold().startswith(("piplines", "pipelines")):
    PROJECT_ROOT = SCRIPT_DIR.parent
else:
    PROJECT_ROOT = SCRIPT_DIR

INPUT_DIR = PROJECT_ROOT / "input"
CAPA1_DIR = PROJECT_ROOT / "capa1"
CAPA2_DIR = PROJECT_ROOT / "capa2"
POWERBI_DIR = PROJECT_ROOT / "powerbi_modelo"
WORK_DIR = PROJECT_ROOT / ".etl_work"
WORK_TEMP_DIR = WORK_DIR / "temporales"
WORK_INTERMEDIATE_DIR = WORK_DIR / "intermedios"
WORK_XLSX_DIR = WORK_DIR / "xlsx_staging"
WORK_DUCKDB_DIR = WORK_DIR / "duckdb_temp"
WORK_C1_CACHE_DIR = WORK_DIR / "capa1_cache"
WORK_BACKUP_DIR = WORK_DIR / "salida_anterior"


def preparar_directorios() -> None:
    for directorio in (
        INPUT_DIR,
        CAPA1_DIR,
        CAPA2_DIR,
        WORK_TEMP_DIR,
        WORK_INTERMEDIATE_DIR,
        WORK_XLSX_DIR,
        WORK_DUCKDB_DIR,
        WORK_C1_CACHE_DIR,
        WORK_BACKUP_DIR,
    ):
        directorio.mkdir(parents=True, exist_ok=True)


def limpiar_temporales() -> None:
    """Elimina únicamente temporales generados por el ETL."""
    preparar_directorios()
    for directorio in (WORK_TEMP_DIR, WORK_INTERMEDIATE_DIR, WORK_DUCKDB_DIR):
        for elemento in directorio.iterdir():
            if elemento.is_dir():
                shutil.rmtree(elemento, ignore_errors=True)
            else:
                elemento.unlink(missing_ok=True)

    # Compatibilidad con versiones anteriores que dejaban staging en Capa 1.
    shutil.rmtree(CAPA1_DIR / "_staging", ignore_errors=True)
    shutil.rmtree(CAPA2_DIR / "_duckdb_temp", ignore_errors=True)


def ruta_relativa(ruta: Path) -> str:
    try:
        return str(ruta.resolve().relative_to(PROJECT_ROOT.resolve()))
    except ValueError:
        return str(ruta.resolve())

# Garantiza que una pipeline individual tenga disponibles sus directorios.
preparar_directorios()
