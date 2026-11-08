from __future__ import annotations

"""Prepara los cuatro Parquet RMS que sube manualmente Asistente Comercial."""

import argparse
import shutil
from pathlib import Path

from project_paths import CAPA1_DIR, PROJECT_ROOT


MAX_LOTE_BYTES = 300 * 1024 * 1024
SALIDA_BASE = PROJECT_ROOT / "entrega_asistente_comercial"
FUENTES = (
    ("ventas", "Fact_Ventas.parquet", "Ventas.parquet"),
    ("ingresos", "Fact_Ingresos.parquet", "Ingresos.parquet"),
    ("transferencias", "Fact_Transferencias.parquet", "Transferencias.parquet"),
    ("stock", "Fact_Stock.parquet", "Stock.parquet"),
)


def verificar_parquet(ruta: Path) -> int:
    if not ruta.is_file() or ruta.stat().st_size < 8:
        raise FileNotFoundError(f"Falta o está vacío: {ruta}")
    with ruta.open("rb") as archivo:
        inicio = archivo.read(4)
        archivo.seek(-4, 2)
        final = archivo.read(4)
    if inicio != b"PAR1" or final != b"PAR1":
        raise RuntimeError(f"{ruta.name} no es un Parquet válido.")
    return ruta.stat().st_size


def preparar(fecha_corte: str, reemplazar: bool = False) -> Path:
    if len(fecha_corte) != 10:
        raise ValueError("La fecha de corte debe usar AAAA-MM-DD.")
    fuentes = [(origen, destino, verificar_parquet(CAPA1_DIR / origen)) for _, origen, destino in FUENTES]
    total = sum(tamano for _, _, tamano in fuentes)
    if total > MAX_LOTE_BYTES:
        raise RuntimeError(
            f"El lote ocupa {total / 1024 / 1024:.1f} MB y supera el máximo de 300 MB del portal."
        )
    destino = SALIDA_BASE / fecha_corte
    if destino.exists():
        if not reemplazar:
            raise FileExistsError(f"Ya existe {destino}. Usa --reemplazar para regenerarlo.")
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    for origen, nombre_destino, _ in fuentes:
        shutil.copy2(CAPA1_DIR / origen, destino / nombre_destino)
    print(f"Lote listo: {destino}")
    print(f"Archivos : {len(fuentes)} Parquet RMS")
    print(f"Tamaño   : {total / 1024 / 1024:.1f} MB de {MAX_LOTE_BYTES / 1024 / 1024:.0f} MB")
    for _, nombre_destino, tamano in fuentes:
        print(f"  - {nombre_destino}: {tamano / 1024 / 1024:.1f} MB")
    return destino


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fecha-corte", required=True, help="AAAA-MM-DD")
    parser.add_argument("--reemplazar", action="store_true")
    args = parser.parse_args()
    try:
        preparar(args.fecha_corte, args.reemplazar)
        return 0
    except Exception as exc:
        print(f"ERROR AL PREPARAR LOTE: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
