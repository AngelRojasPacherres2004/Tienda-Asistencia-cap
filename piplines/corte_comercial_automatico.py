from __future__ import annotations

"""Selecciona y comprueba el corte sin confundir tráfico, RMS y stock.

El tráfico diario determina el último día operativo suficientemente completo.
El stock es una foto independiente y nunca adelanta artificialmente ese corte.
"""

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from project_paths import PROJECT_ROOT
from xlsx_staging import materializar_hoja_csv


TRAFICO = PROJECT_ROOT / "capa1" / "TRAFICO_CLIENTES.xlsx"
COBERTURA = PROJECT_ROOT / "capa2" / "Reporte_Cobertura.json"
DATOS_WEB = PROJECT_ROOT / "dashboard-web" / "public" / "assets" / "data" / "dashboard.json"
ORIGEN_EXCEL = date(1899, 12, 30)


def fecha_excel(valor: str) -> date:
    valor = valor.strip()
    if not valor:
        raise ValueError("fecha vacía")
    try:
        numero = float(valor)
        if numero.is_integer() and 1 <= numero <= 100000:
            return ORIGEN_EXCEL + timedelta(days=int(numero))
    except ValueError:
        pass
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(valor[:10], formato).date()
        except ValueError:
            continue
    raise ValueError(f"Fecha de tráfico no reconocida: {valor!r}")


def conteos_diarios() -> dict[date, set[str]]:
    if not TRAFICO.is_file():
        raise RuntimeError(f"Falta {TRAFICO}")
    ruta_csv = materializar_hoja_csv(TRAFICO, "TRAFICO_CLIENTE")
    conteos: dict[date, set[str]] = defaultdict(set)
    with ruta_csv.open(newline="", encoding="utf-8") as archivo:
        for fila in csv.DictReader(archivo):
            cantidad = (fila.get("cantidad_personas") or "").strip()
            if not cantidad:
                continue
            try:
                numero = float(cantidad.replace(",", "."))
            except ValueError:
                raise RuntimeError(f"Conteo de tráfico inválido: {cantidad!r}") from None
            if not numero.is_integer() or numero < 0:
                raise RuntimeError(f"Conteo de tráfico inválido: {cantidad!r}")
            fecha = fecha_excel(fila.get("fecha") or "")
            tienda = (fila.get("tienda") or "").strip().upper()
            if not tienda or tienda in conteos[fecha]:
                raise RuntimeError(f"Tienda duplicada o vacía en tráfico: {fecha} {tienda}")
            conteos[fecha].add(tienda)
    if not conteos:
        raise RuntimeError("No hay tráfico diario registrado para elegir el corte.")
    return conteos


def seleccionar(explicita: date | None) -> date:
    conteos = conteos_diarios()
    ultimo = max(conteos)
    recientes = [cantidad for dia, tiendas in conteos.items()
                if ultimo - timedelta(days=45) <= dia <= ultimo
                for cantidad in [len(tiendas)]]
    tiendas_esperadas = max(recientes)
    minimo = max(1, math.ceil(tiendas_esperadas * 0.8))
    if explicita:
        if explicita not in conteos or len(conteos[explicita]) < minimo:
            raise RuntimeError(
                f"El {explicita} tiene {len(conteos.get(explicita, set()))} tiendas con tráfico; "
                f"se necesitan al menos {minimo} de {tiendas_esperadas}."
            )
        elegida = explicita
    else:
        elegida = max(dia for dia, tiendas in conteos.items() if len(tiendas) >= minimo)
    if elegida > date.today():
        raise RuntimeError(f"El corte {elegida} está en el futuro.")
    print(
        f"Tráfico: {len(conteos[elegida])}/{tiendas_esperadas} tiendas con datos; "
        f"corte elegido {elegida}.", file=sys.stderr
    )
    return elegida


def validar(fecha: date) -> None:
    if not COBERTURA.is_file() or not DATOS_WEB.is_file():
        raise RuntimeError("Faltan el reporte de cobertura o los datos web generados.")
    cobertura = json.loads(COBERTURA.read_text(encoding="utf-8"))
    web = json.loads(DATOS_WEB.read_text(encoding="utf-8"))["metadata"]
    esperado = fecha.isoformat()
    if cobertura.get("selectedCutoff") != esperado or web.get("selectedCutoff") != esperado:
        raise RuntimeError("El modelo y el dashboard no comparten la fecha de corte solicitada.")
    fuentes = {fila["source"]: fila for fila in cobertura.get("sources", [])}
    for nombre in ("Ventas", "Tráfico"):
        if fuentes.get(nombre, {}).get("dataThrough") != esperado:
            raise RuntimeError(f"{nombre} no llega al corte {esperado}.")
    for nombre in ("Ingresos", "Transferencias"):
        fuente = fuentes.get(nombre, {})
        if fuente.get("status") != "ok" or not fuente.get("dataThrough"):
            raise RuntimeError(f"{nombre} no está dentro de su frecuencia esperada.")
    stock = fuentes.get("Stock", {}).get("dataThrough")
    if web.get("stockCutoff") != stock:
        raise RuntimeError("La fecha de stock publicada no coincide con su foto real.")
    print(f"Corte {esperado} validado; stock real {stock or 'sin datos'}.")


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
