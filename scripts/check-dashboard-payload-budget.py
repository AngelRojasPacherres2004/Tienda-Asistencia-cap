"""Measure uncompressed dashboard payloads before publishing a release.

The core is shared by all charts; panel measurements count additional files
requested by that panel. `--report-only` documents failing gates without
blocking exploratory local generation.
"""

from __future__ import annotations

import argparse
from pathlib import Path


INITIAL_LIMIT = 15_000_000
PANEL_LIMIT = 5_000_000


def largest(directory: Path, pattern: str, count: int = 1) -> tuple[int, str]:
    files = sorted(directory.glob(pattern), key=lambda path: path.stat().st_size, reverse=True)
    if len(files) < count:
        return -1, f"faltan {count - len(files)} archivo(s): {pattern}"
    selected = files[:count]
    return sum(path.stat().st_size for path in selected), ", ".join(path.name for path in selected)


def measure(directory: Path) -> list[tuple[str, int, str, int]]:
    scenarios = [
        ("Carga inicial", "dashboard.json", 1, INITIAL_LIMIT),
        ("Vendedores · resumen", "dashboard-sellers-summary-????.json", 1, PANEL_LIMIT),
        ("Vendedores · rubro", "dashboard-sellers-category-????.json", 1, PANEL_LIMIT),
        ("Vendedores · detalle anual", "dashboard-sellers-????.json", 1, PANEL_LIMIT),
        ("Vendedores · un mes", "dashboard-sellers-????-??.json", 1, PANEL_LIMIT),
        ("Precios · comparación resumida", "dashboard-price-range-summary-????.json", 2, PANEL_LIMIT),
        ("Precios · comparación anual detallada", "dashboard-price-range-????.json", 2, PANEL_LIMIT),
        ("Precios · comparación mensual detallada", "dashboard-price-range-????-??.json", 2, PANEL_LIMIT),
        ("Marcas · rubro", "dashboard-brand-category-????.json", 1, PANEL_LIMIT),
        ("Marcas · detalle anual", "dashboard-brand-????.json", 1, PANEL_LIMIT),
        ("Sublíneas · detalle anual", "dashboard-subline-????.json", 1, PANEL_LIMIT),
        ("Inventario · origen", "dashboard-stock-origin.json", 1, PANEL_LIMIT),
        ("Inventario · productos y tallas", "dashboard-stock-products.json", 1, PANEL_LIMIT),
        ("Inventario · predictivo", "dashboard-predictive.json", 1, PANEL_LIMIT),
        ("Detalle diario · un mes", "dashboard-daily-????-??.json", 1, PANEL_LIMIT),
    ]
    return [(label, *largest(directory, pattern, count), limit) for label, pattern, count, limit in scenarios]


def report(directory: Path) -> bool:
    failed = False
    for label, size, source, limit in measure(directory):
        valid = 0 <= size < limit
        failed |= not valid
        amount = "FALTA" if size < 0 else f"{size / 1_000_000:.3f} MB"
        print(f"{'OK' if valid else 'EXCEDE':7} {label:39} {amount:>10} / {limit / 1_000_000:g} MB · {source}")
    return not failed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    success = report(args.directory)
    raise SystemExit(0 if success or args.report_only else 1)
