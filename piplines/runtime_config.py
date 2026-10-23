from __future__ import annotations

"""Configuración común y cierre seguro para DuckDB.

La combinación Windows + CPython 3.14 + DuckDB 1.5.x puede finalizar algunos
procesos con ``STATUS_STACK_OVERFLOW`` durante la liberación nativa de una
conexión, aun cuando la consulta y el Parquet ya terminaron correctamente.

Para evitarlo, todas las pipelines deben:

1. crear conexiones con :func:`configurar_duckdb`;
2. liberarlas con :func:`cerrar_duckdb_seguro`;
3. terminar el proceso con :func:`finalizar_proceso`.

En plataformas estables se usa el cierre normal. En el entorno problemático la
conexión se conserva hasta que ``os._exit`` termina el subproceso sin ejecutar
finalizadores nativos. Cada pipeline se ejecuta como un subproceso aislado, por
lo que el sistema operativo libera todos sus recursos.
"""

import os
import sys
from pathlib import Path
from typing import Any

from project_paths import WORK_DUCKDB_DIR

# Evita que el recuento de referencias destruya la conexión antes de que el
# subproceso llegue a ``finalizar_proceso`` en el entorno problemático.
_CONEXIONES_RETENIDAS: list[Any] = []


def _entero_entorno(nombre: str, minimo: int, maximo: int | None = None) -> int | None:
    valor = os.getenv(nombre, "").strip()
    if not valor:
        return None
    try:
        numero = int(valor)
    except ValueError as exc:
        raise RuntimeError(f"{nombre} debe ser un entero; recibido: {valor!r}") from exc
    if numero < minimo or (maximo is not None and numero > maximo):
        limite = f" entre {minimo} y {maximo}" if maximo is not None else f" >= {minimo}"
        raise RuntimeError(f"{nombre} debe estar{limite}; recibido: {numero}")
    return numero


def hilos_recomendados() -> int:
    configurados = _entero_entorno("ETL_DUCKDB_THREADS", 1, 64)
    if configurados is not None:
        return configurados
    disponibles = os.cpu_count() or 4
    return max(2, min(disponibles - 1 if disponibles > 2 else disponibles, 12))


def entorno_duckdb_problematico() -> bool:
    """Indica si debe evitarse la destrucción normal de conexiones nativas.

    ``ETL_DUCKDB_HARD_EXIT`` permite forzar o desactivar el comportamiento:
    ``1/true`` lo activa, ``0/false`` lo desactiva y ``auto`` usa la detección.
    """

    valor = os.getenv("ETL_DUCKDB_HARD_EXIT", "auto").strip().casefold()
    if valor in {"1", "true", "si", "sí", "yes", "on"}:
        return True
    if valor in {"0", "false", "no", "off"}:
        return False
    return os.name == "nt" and sys.version_info >= (3, 14)


def configurar_duckdb(
    conexion: Any,
    base_dir: Path | None = None,
    preserve_insertion_order: bool = False,
) -> None:
    """Configura DuckDB para ETL local, concurrencia y uso estable de disco."""

    del base_dir
    temporal_proceso = WORK_DUCKDB_DIR / f"pid_{os.getpid()}"
    temporal_proceso.mkdir(parents=True, exist_ok=True)

    conexion.execute(f"SET threads={hilos_recomendados()}")
    conexion.execute(
        "SET preserve_insertion_order = "
        + ("true" if preserve_insertion_order else "false")
    )
    ruta = temporal_proceso.resolve().as_posix().replace("'", "''")
    conexion.execute(f"SET temp_directory='{ruta}'")

    memoria = os.getenv("ETL_DUCKDB_MEMORY_LIMIT", "").strip()
    if memoria:
        memoria_sql = memoria.replace("'", "''")
        conexion.execute(f"SET memory_limit='{memoria_sql}'")

    mostrar_progreso = os.getenv("ETL_PROGRESS", "1").strip().casefold() not in {
        "0",
        "false",
        "no",
        "off",
    }
    sentencias = [
        "SET enable_object_cache=true",
    ]
    if mostrar_progreso:
        sentencias.extend(
            ["SET enable_progress_bar=true", "SET enable_progress_bar_print=true"]
        )
    else:
        sentencias.extend(
            ["SET enable_progress_bar=false", "SET enable_progress_bar_print=false"]
        )
    for sentencia in sentencias:
        try:
            conexion.execute(sentencia)
        except Exception:
            # Algunas opciones varían entre versiones de DuckDB. Nunca se oculta
            # un error de consulta; solo se tolera una opción de configuración.
            pass


def cerrar_duckdb_seguro(conexion: Any) -> None:
    """Libera una conexión sin provocar el fallo nativo observado en Windows.

    En el entorno problemático se conserva la referencia y el proceso termina
    posteriormente mediante :func:`finalizar_proceso`. En el resto de sistemas
    se ejecuta ``close`` de forma normal.
    """

    if conexion is None:
        return
    if entorno_duckdb_problematico():
        _CONEXIONES_RETENIDAS.append(conexion)
        return
    try:
        conexion.close()
    except Exception:
        # El error real de la consulta ya se produjo antes. El cierre no debe
        # reemplazarlo ni impedir la validación del archivo temporal.
        pass


def finalizar_proceso(codigo: int = 0) -> None:
    """Finaliza una pipeline evitando finalizadores nativos inestables.

    Debe llamarse únicamente en el bloque ``if __name__ == '__main__'`` de los
    scripts ejecutables. Los buffers se vacían antes de usar ``os._exit``.
    """

    try:
        sys.stdout.flush()
        sys.stderr.flush()
    finally:
        if entorno_duckdb_problematico():
            os._exit(int(codigo))
    raise SystemExit(int(codigo))
