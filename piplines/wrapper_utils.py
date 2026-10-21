from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from project_paths import SCRIPT_DIR
BASE_DIR = SCRIPT_DIR

# Windows puede devolver el mismo código de forma firmada o sin firmar.
# 0xC00000FD = STATUS_STACK_OVERFLOW.
CODIGOS_CIERRE_DUCKDB_WINDOWS = {
    3221225725,
    -1073741571,
}


def ejecutar_base(nombre: str, argumentos: list[str]) -> None:
    """
    Ejecuta una pipeline base especializada.

    Algunas combinaciones de Windows + Python 3.14 + la extensión Excel de
    DuckDB pueden terminar el subproceso con STATUS_STACK_OVERFLOW después
    de haber cerrado correctamente la etapa y publicado su Parquet.

    En ese caso se permite continuar. La pipeline envolvente valida de
    inmediato que el archivo generado exista, tenga el esquema correcto y
    pueda volver a leerse; por tanto, un archivo inexistente o incompleto
    seguirá produciendo un error real en la etapa siguiente.
    """
    script = BASE_DIR / nombre

    if not script.exists():
        raise FileNotFoundError(f"No existe el módulo base: {script}")

    comando = [sys.executable, str(script), *argumentos]
    resultado = subprocess.run(comando, cwd=BASE_DIR)

    if resultado.returncode == 0:
        return

    if resultado.returncode in CODIGOS_CIERRE_DUCKDB_WINDOWS:
        print(
            "\nAVISO TÉCNICO: la etapa base terminó con "
            "STATUS_STACK_OVERFLOW al cerrar el proceso de DuckDB/Excel "
            f"(código {resultado.returncode})."
        )
        print(
            "Se continuará porque la siguiente etapa comprobará la existencia, "
            "el esquema y la integridad del Parquet generado."
        )
        return

    raise RuntimeError(
        f"La etapa base {nombre} terminó con código {resultado.returncode}."
    )
