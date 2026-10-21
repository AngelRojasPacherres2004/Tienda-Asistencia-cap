from __future__ import annotations

import argparse
import sys
from pathlib import Path

from modelo_relacional import validar_dimension
from project_paths import CAPA2_DIR
from runtime_config import finalizar_proceso
from wrapper_utils import ejecutar_base

SALIDA = CAPA2_DIR / "DimTiendas.parquet"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tiendas -> DimTiendas histórica y escalable"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--solo-capa2", action="store_true")
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    args = parser.parse_args()

    try:
        if args.verificar_capa2:
            print(validar_dimension(SALIDA, "tienda_id"))
            return 0

        argumentos = ["--verificar-capa1"] if args.verificar_capa1 else []
        ejecutar_base("_base_tiendas.py", argumentos)

        if not args.verificar_capa1:
            if not SALIDA.exists() or SALIDA.stat().st_size == 0:
                raise FileNotFoundError(f"No se publicó {SALIDA}")
            # _base_tiendas.py ya utiliza el maestro central y valida la salida.
            # No se vuelve a leer y reescribir la dimensión: esa segunda pasada
            # era redundante y provocaba STATUS_STACK_OVERFLOW en Python 3.14.
            print(f"Resultado modelo: {SALIDA}")
        return 0
    except Exception as exc:
        print(f"\nERROR EN TIENDAS: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
