from __future__ import annotations

"""Entrega al importador de Excel las filas normalizadas existentes de Capa 1."""

import csv
import json
import sys
from pathlib import Path

from corte_comercial_automatico import fecha_excel
from xlsx_staging import materializar_hoja_csv


def main() -> None:
    origen = Path(sys.argv[1]).resolve()
    csv_path = materializar_hoja_csv(origen, "TRAFICO_CLIENTE")
    with csv_path.open(newline="", encoding="utf-8") as archivo:
        lector = csv.DictReader(archivo)
        esperadas = ["fecha", "tienda", "cantidad_personas", "estado_registro"]
        if lector.fieldnames != esperadas:
            raise RuntimeError("El Excel de Capa 1 no cumple el contrato de cuatro columnas.")
        filas = [{
            "date": fecha_excel(fila["fecha"]).isoformat(),
            "store": fila["tienda"],
            "quantity": int(float(fila["cantidad_personas"])) if fila["cantidad_personas"] else None,
            "state": fila["estado_registro"],
        } for fila in lector]
    print(json.dumps(filas, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
