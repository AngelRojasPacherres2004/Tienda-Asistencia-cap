from __future__ import annotations
from runtime_config import finalizar_proceso

import argparse
import sys
from datetime import date
from pathlib import Path

from modelo_relacional import transformar_guias, validar_claves
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
        description="Guías en tránsito -> tabla relacional lista para Power BI"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--solo-capa2", action="store_true")
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    parser.add_argument("--fecha-corte", type=parsear_fecha, default=None)
    args = parser.parse_args()
    try:
        if args.verificar_capa2:
            print(
                validar_claves(
                    BASE / "capa2" / "FactGuiasTransito.parquet",
                    [
                        "guia_transito_id", "fecha_corte_id", "tienda_origen_id",
                        "tienda_destino_id", "producto_id",
                    ],
                    permitir_nulos={"producto_id"},
                )
            )
            return 0
        base_args = ["--verificar-capa1"] if args.verificar_capa1 else []
        if args.solo_capa2:
            base_args = ["--solo-capa2"]
        ejecutar_base("_base_guias_transito.py", base_args)
        if not args.verificar_capa1:
            fecha_corte = args.fecha_corte or date.today()
            if args.fecha_corte is None:
                print(
                    "ADVERTENCIA: no se indicó --fecha-corte; se usará la fecha actual."
                )
            print(f"Resultado modelo: {transformar_guias(fecha_corte)}")
        return 0
    except Exception as exc:
        print(f"\nERROR EN GUÍAS EN TRÁNSITO: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
