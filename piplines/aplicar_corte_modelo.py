from __future__ import annotations

"""Aplica un corte único a Capa 2 y registra la frescura de cada fuente.

No inventa transacciones ni modifica Capa 1. Los ceros se generan después en
las agregaciones analíticas; aquí solamente se excluyen hechos posteriores al
corte y se crea un reporte visible para el usuario.
"""

import argparse
import json
import os
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import duckdb

from project_paths import CAPA2_DIR, WORK_TEMP_DIR, preparar_directorios
from reglas_corte import validar_fecha_corte
from runtime_config import finalizar_proceso


REPORTE_COBERTURA = CAPA2_DIR / "Reporte_Cobertura.json"


@dataclass(frozen=True)
class Fuente:
    archivo: str
    nombre: str
    columna_fecha: str
    frecuencia: str
    tolerancia_dias: int
    condicion_extra: str = ""
    recortar: bool = True


FUENTES = (
    Fuente("FactVentas.parquet", "Ventas", "fecha_venta", "semanal", 0),
    Fuente("FactIngresos.parquet", "Ingresos", "fecha_ingreso", "semanal", 7),
    Fuente(
        "FactTransferencias.parquet",
        "Transferencias",
        "fecha_transferencia",
        "semanal",
        7,
    ),
    Fuente(
        "FactGuiasTransito.parquet",
        "Guías en tránsito",
        "fecha_transferencia",
        "semanal",
        7,
        "AND CAST(fecha_corte AS DATE) <= DATE '{corte}'",
    ),
    Fuente("FactStock.parquet", "Stock", "fecha_corte", "mensual", 35),
    Fuente("FactMerma.parquet", "Merma", "fecha_analisis", "mensual", 35),
    Fuente(
        "FactMetasTienda.parquet",
        "Metas",
        "fecha_inicio_periodo",
        "anual / cuando cambie",
        35,
        recortar=False,
    ),
    Fuente(
        "FactPersonalTienda.parquet",
        "Personal",
        "fecha_inicio_periodo",
        "mensual",
        35,
    ),
    Fuente("FactTraficoClientes.parquet", "Tráfico", "fecha", "semanal", 7),
)


def _fecha(valor: object) -> date | None:
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return date.fromisoformat(str(valor)[:10])


def _literal(ruta: Path) -> str:
    return "'" + ruta.resolve().as_posix().replace("'", "''") + "'"


def _condicion(fuente: Fuente, corte: date) -> str:
    iso = corte.isoformat()
    extra = fuente.condicion_extra.format(corte=iso)
    return f'CAST("{fuente.columna_fecha}" AS DATE) <= DATE \'{iso}\' {extra}'


def aplicar(fecha_corte: date) -> dict:
    preparar_directorios()
    conexion = duckdb.connect()
    fuentes: list[dict] = []

    for fuente in FUENTES:
        ruta = CAPA2_DIR / fuente.archivo
        if not ruta.exists():
            fuentes.append(
                {
                    "source": fuente.nombre,
                    "file": fuente.archivo,
                    "frequency": fuente.frecuencia,
                    "status": "warning",
                    "message": f"Falta {fuente.archivo}; sus indicadores se mostrarán en 0.",
                    "maxAvailable": None,
                    "dataThrough": None,
                    "lagDays": None,
                    "rowsOriginal": 0,
                    "rowsIncluded": 0,
                    "rowsExcludedAfterCutoff": 0,
                }
            )
            continue

        tabla = f"read_parquet({_literal(ruta)})"
        condicion = _condicion(fuente, fecha_corte)
        original, filas_hasta_corte, maxima, maxima_incluida = conexion.execute(
            f"""
            SELECT COUNT(*),
                   COUNT(*) FILTER (WHERE {condicion}),
                   MAX(CAST("{fuente.columna_fecha}" AS DATE)),
                   MAX(CAST("{fuente.columna_fecha}" AS DATE)) FILTER (WHERE {condicion})
            FROM {tabla}
            """
        ).fetchone()
        incluidas = int(filas_hasta_corte) if fuente.recortar else int(original)
        maxima_fecha = _fecha(maxima)
        disponible_hasta = _fecha(maxima_incluida)
        rezago = (
            (fecha_corte - disponible_hasta).days
            if disponible_hasta is not None
            else None
        )
        estado = (
            "ok"
            if rezago is not None and rezago <= fuente.tolerancia_dias
            else "warning"
        )
        if disponible_hasta is None:
            mensaje = (
                f"No hay {fuente.nombre.lower()} hasta el corte; "
                "sus indicadores se mostrarán en 0."
            )
        elif estado == "warning":
            mensaje = (
                f"{fuente.nombre} llega hasta {disponible_hasta.isoformat()} "
                f"({rezago} días antes del corte)."
            )
        else:
            mensaje = f"{fuente.nombre} está dentro de su frecuencia esperada."

        excluidas = int(original) - incluidas
        if excluidas > 0:
            temporal = WORK_TEMP_DIR / f"{ruta.stem}_corte_temporal.parquet"
            temporal.unlink(missing_ok=True)
            conexion.execute(
                f"COPY (SELECT * FROM {tabla} WHERE {condicion}) "
                f"TO {_literal(temporal)} (FORMAT PARQUET, COMPRESSION ZSTD)"
            )
            if not temporal.exists():
                raise RuntimeError(f"No se pudo preparar el corte de {fuente.archivo}.")
            os.replace(temporal, ruta)

        fuentes.append(
            {
                "source": fuente.nombre,
                "file": fuente.archivo,
                "frequency": fuente.frecuencia,
                "cutoffBehavior": "filter" if fuente.recortar else "completePlan",
                "status": estado,
                "message": mensaje,
                "maxAvailable": maxima_fecha.isoformat() if maxima_fecha else None,
                "dataThrough": disponible_hasta.isoformat() if disponible_hasta else None,
                "lagDays": rezago,
                "rowsOriginal": int(original),
                "rowsIncluded": incluidas,
                "rowsExcludedAfterCutoff": excluidas,
            }
        )

    reporte = {
        "selectedCutoff": fecha_corte.isoformat(),
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "defaultRule": "Último lunes disponible en el calendario",
        "manualWarnings": validar_fecha_corte(fecha_corte),
        "sources": fuentes,
    }
    temporal_reporte = REPORTE_COBERTURA.with_suffix(".json.tmp")
    temporal_reporte.write_text(
        json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.replace(temporal_reporte, REPORTE_COBERTURA)
    return reporte


def main() -> int:
    parser = argparse.ArgumentParser(description="Aplica y audita la fecha de corte de Capa 2.")
    parser.add_argument("--fecha-corte", required=True, type=date.fromisoformat)
    args = parser.parse_args()
    reporte = aplicar(args.fecha_corte)
    print(f"Corte comercial aplicado: {reporte['selectedCutoff']}")
    for fuente in reporte["sources"]:
        prefijo = "OK" if fuente["status"] == "ok" else "ADVERTENCIA"
        print(f"[{prefijo}] {fuente['message']}")
    print(f"Reporte: {REPORTE_COBERTURA}")
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
