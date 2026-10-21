from __future__ import annotations
from runtime_config import finalizar_proceso

import argparse
import sys
from datetime import date
from pathlib import Path

from modelo_relacional import transformar_stock, validar_claves
from wrapper_utils import ejecutar_base

from project_paths import PROJECT_ROOT
BASE = PROJECT_ROOT


def parsear_fecha(valor: str) -> date:
    try:
        return date.fromisoformat(valor)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Usa YYYY-MM-DD") from exc


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Stock RMS -> Capa 1 técnica + FactStock relacional"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--solo-capa1", action="store_true")
    grupo.add_argument("--solo-capa2", action="store_true")
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    parser.add_argument("--fecha-corte", type=parsear_fecha, default=None)
    args = parser.parse_args()
    argumentos_capa1: list[str] = ["--solo-capa1"]
    if args.fecha_corte is not None:
        argumentos_capa1.extend(["--fecha-corte", args.fecha_corte.isoformat()])
    try:
        if args.verificar_capa2:
            print(
                validar_claves(
                    BASE / "capa2" / "FactStock.parquet",
                    ["stock_id", "fecha_corte_id", "tienda_id", "producto_id"],
                )
            )
            return 0
        if args.verificar_capa1:
            ejecutar_base("_base_stock.py", ["--verificar-capa1"])
            return 0
        if args.solo_capa1:
            ejecutar_base("_base_stock.py", argumentos_capa1)
            return 0
        if not args.solo_capa2:
            # Usamos el parser RMS probado únicamente para la Capa 1. La Capa 2
            # se construye aquí para no crear Dim_Producto desde una sola foto.
            ejecutar_base("_base_stock.py", argumentos_capa1)
        fecha_corte = args.fecha_corte or date.today()
        if args.fecha_corte is None:
            print("ADVERTENCIA: no se indicó --fecha-corte; se usará la fecha actual.")
        print(f"Resultado modelo: {transformar_stock(fecha_corte)}")
        return 0
    except Exception as exc:
        print(f"\nERROR EN STOCK: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
