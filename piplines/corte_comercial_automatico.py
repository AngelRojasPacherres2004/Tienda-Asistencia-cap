from __future__ import annotations

"""Comprueba el corte RMS sin requerir planillas administrativas.

El tráfico se mantiene en Supabase y se consulta al abrir el dashboard; no
participa de la selección ni validación del batch local.
"""

import argparse
import json
import sys
from datetime import date

from project_paths import PROJECT_ROOT
COBERTURA = PROJECT_ROOT / "capa2" / "Reporte_Cobertura.json"
DATOS_WEB = PROJECT_ROOT / "dashboard-data" / "dashboard.json"


def seleccionar(explicita: date | None) -> date:
    if not explicita:
        raise RuntimeError("--seleccionar requiere --fecha-corte; el tráfico se gestiona en Supabase.")
    if explicita > date.today():
        raise RuntimeError(f"El corte {explicita} está en el futuro.")
    return explicita


def validar(fecha: date) -> None:
    if not COBERTURA.is_file() or not DATOS_WEB.is_file():
        raise RuntimeError("Faltan el reporte de cobertura o los datos web generados.")
    cobertura = json.loads(COBERTURA.read_text(encoding="utf-8"))
    web = json.loads(DATOS_WEB.read_text(encoding="utf-8"))["metadata"]
    esperado = fecha.isoformat()
    if cobertura.get("selectedCutoff") != esperado or web.get("selectedCutoff") != esperado:
        raise RuntimeError("El modelo y el dashboard no comparten la fecha de corte solicitada.")
    fuentes = {fila["source"]: fila for fila in cobertura.get("sources", [])}
    for nombre, corte in (("Ventas", esperado),):
        if fuentes.get(nombre, {}).get("dataThrough") != corte:
            raise RuntimeError(f"{nombre} no llega al corte {corte}.")
    for nombre in ("Ingresos", "Transferencias"):
        fuente = fuentes.get(nombre, {})
        if fuente.get("status") != "ok" or not fuente.get("dataThrough"):
            raise RuntimeError(f"{nombre} no está dentro de su frecuencia esperada.")
    stock = fuentes.get("Stock", {}).get("dataThrough")
    if web.get("stockCutoff") != stock:
        raise RuntimeError("La fecha de stock publicada no coincide con su foto real.")
    print(f"Corte RMS {esperado} validado; stock real {stock or 'sin datos'}.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modo = parser.add_mutually_exclusive_group(required=True)
    modo.add_argument("--seleccionar", action="store_true")
    modo.add_argument("--validar", action="store_true")
    parser.add_argument("--fecha-corte", type=date.fromisoformat)
    args = parser.parse_args()
    try:
        if args.seleccionar:
            print(seleccionar(args.fecha_corte))
        else:
            if not args.fecha_corte:
                raise RuntimeError("--validar requiere --fecha-corte.")
            validar(args.fecha_corte)
    except Exception as exc:
        print(f"ERROR DE CORTE: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
