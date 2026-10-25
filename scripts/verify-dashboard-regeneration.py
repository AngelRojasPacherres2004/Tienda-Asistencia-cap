"""Check regenerated dashboard data against a preserved local release.

Rows may change order; the only accepted shape changes are the brand summary's
empty dimensions and the product code added to stock products.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "piplines"))
from compactar_dashboard import descompactar_diario, descompactar_predictivo, descompactar_registros  # noqa: E402


PARTITIONED = {
    "dashboard-sellers.json": "sellerPerformance",
    "dashboard-brand.json": "monthlyBrand",
    "dashboard-subline.json": "monthlySubline",
    "dashboard-price-range.json": "monthlyPriceRange",
}


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def rows_equal(before: list[dict], after: list[dict]) -> bool:
    def fingerprints(rows: list[dict]) -> Counter[bytes]:
        return Counter(
            hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).digest()
            for row in rows
        )

    return len(before) == len(after) and fingerprints(before) == fingerprints(after)


def verify(before_dir: Path, after_dir: Path) -> list[str]:
    errors: list[str] = []
    checked = 0
    for source in sorted(before_dir.glob("*.json")):
        name = source.name
        if name in PARTITIONED:
            key = PARTITIONED[name]
            original = read(source)[key]
            by_year: dict[int, list[dict]] = defaultdict(list)
            for row in original:
                by_year[int(row["periodId"]) // 100].append(row)
            for year, rows in by_year.items():
                target = after_dir / name.replace(".json", f"-{year}.json")
                if not target.is_file() or not rows_equal(rows, read(target)[key]):
                    errors.append(f"{target.name}: faltan filas o cambió el contenido")
                checked += 1
                if key in ("sellerPerformance", "monthlyBrand", "monthlySubline", "monthlyPriceRange"):
                    compact = after_dir / name.replace(".json", f"-compact-{year}.json")
                    if not compact.is_file() or not rows_equal(rows, descompactar_registros(read(compact)[key])):
                        errors.append(f"{compact.name}: la codificación cambia filas o valores")
                    checked += 1
            continue

        target = after_dir / name
        if not target.is_file():
            errors.append(f"{name}: falta en la nueva generación")
            continue
        original = read(source)
        regenerated = read(target)
        if original.keys() != regenerated.keys():
            errors.append(f"{name}: cambió el esquema principal")
            continue
        for key, old_value in original.items():
            new_value = regenerated[key]
            if isinstance(old_value, list) and isinstance(new_value, list):
                if name == "dashboard.json" and key == "monthlyBrand":
                    old_value = [
                        {field: value for field, value in row.items()
                         if field not in ("category", "line", "subline") or value}
                        for row in old_value
                    ]
                if name == "dashboard-stock-products.json" and key == "stockProducts":
                    new_value = [
                        {field: value for field, value in row.items() if field != "productCode"}
                        for row in new_value
                    ]
                if not rows_equal(old_value, new_value):
                    errors.append(f"{name}/{key}: faltan filas o cambió el contenido")
            elif name == "dashboard.json" and key == "metadata" and isinstance(old_value, dict) and isinstance(new_value, dict):
                old_metadata = {field: value for field, value in old_value.items() if field != "generatedAt"}
                new_metadata = {field: value for field, value in new_value.items() if field != "generatedAt"}
                if old_metadata != new_metadata or not old_value.get("generatedAt") or not new_value.get("generatedAt"):
                    errors.append(f"{name}/{key}: cambió el contenido fuera de generatedAt")
            elif old_value != new_value:
                errors.append(f"{name}/{key}: cambió el contenido")
            checked += 1
        if re.fullmatch(r"dashboard-daily-\d{4}-\d{2}\.json", name):
            compact = after_dir / name.replace("dashboard-daily-", "dashboard-daily-compact-")
            if not compact.is_file():
                errors.append(f"{compact.name}: falta el detalle diario compacto")
            else:
                decoded = descompactar_diario(read(compact)["dailyCompact"])
                for key in ("dailyStore", "hourlySales"):
                    if not rows_equal(original[key], decoded[key]):
                        errors.append(f"{compact.name}/{key}: la codificación cambia filas o valores")
                    checked += 1
        if name == "dashboard-predictive.json":
            compact = after_dir / "dashboard-predictive-compact.json"
            if not compact.is_file():
                errors.append("dashboard-predictive-compact.json: falta el detalle predictivo")
            else:
                decoded = descompactar_predictivo(read(compact)["predictiveCompact"])
                if decoded["note"] != original["note"] or not rows_equal(original["rows"], decoded["rows"]):
                    errors.append("dashboard-predictive-compact.json: cambian las ventanas o la nota")
                checked += 1

    for dataset, key in (("dashboard-sellers", "sellerPerformance"), ("dashboard-price-range", "monthlyPriceRange")):
        yearly_files = sorted(after_dir.glob(f"{dataset}-[0-9][0-9][0-9][0-9].json"))
        for yearly_file in yearly_files:
            year = yearly_file.stem.rsplit("-", 1)[1]
            months = sorted(after_dir.glob(f"{dataset}-{year}-[0-9][0-9].json"))
            yearly_rows = read(yearly_file)[key]
            monthly_rows = [row for month in months for row in read(month)[key]]
            if not rows_equal(yearly_rows, monthly_rows):
                errors.append(f"{dataset}-{year}: particiones mensuales incompletas")
            checked += 1

    original_prices = before_dir / "dashboard-price-range.json"
    if original_prices.is_file():
        totals: dict[tuple[int, str, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
        for row in read(original_prices)["monthlyPriceRange"]:
            values = totals[(row["periodId"], row["storeId"], row["bandOrder"])]
            values[0] += row["net"]
            values[1] += row["units"]
        summaries = sorted(after_dir.glob("dashboard-price-range-summary-????.json"))
        if summaries:
            actual = {
                (row["periodId"], row["storeId"], row["bandOrder"]): row
                for path in summaries for row in read(path)["monthlyPriceRange"]
            }
            if totals.keys() != actual.keys() or any(
                not math.isclose(values[0], actual[key]["net"], rel_tol=0, abs_tol=1e-6)
                or not math.isclose(values[1], actual[key]["units"], rel_tol=0, abs_tol=1e-6)
                for key, values in totals.items() if key in actual
            ):
                errors.append("dashboard-price-range-summary: cambian los totales por banda")
            checked += 1

        category_totals: dict[tuple[int, str, str, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
        for row in read(original_prices)["monthlyPriceRange"]:
            values = category_totals[(row["periodId"], row["storeId"], row["category"], row["bandOrder"])]
            values[0] += row["net"]
            values[1] += row["units"]
        category_summaries = sorted(after_dir.glob("dashboard-price-range-category-????.json"))
        if category_summaries:
            actual = {
                (row["periodId"], row["storeId"], row["category"], row["bandOrder"]): row
                for path in category_summaries for row in read(path)["monthlyPriceRange"]
            }
            if category_totals.keys() != actual.keys() or any(
                not math.isclose(values[0], actual[key]["net"], rel_tol=0, abs_tol=1e-6)
                or not math.isclose(values[1], actual[key]["units"], rel_tol=0, abs_tol=1e-6)
                for key, values in category_totals.items() if key in actual
            ):
                errors.append("dashboard-price-range-category: cambian los totales por rubro y banda")
            checked += 1

    original_brands = before_dir / "dashboard-brand.json"
    if original_brands.is_file():
        totals: dict[tuple[int, str, str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
        for row in read(original_brands)["monthlyBrand"]:
            values = totals[(row["periodId"], row["storeId"], row["category"], row["brand"])]
            values[0] += row["net"]
            values[1] += row["units"]
        summaries = sorted(after_dir.glob("dashboard-brand-category-????.json"))
        if summaries:
            actual = {
                (row["periodId"], row["storeId"], row["category"], row["brand"]): row
                for path in summaries for row in read(path)["monthlyBrand"]
            }
            if totals.keys() != actual.keys() or any(
                not math.isclose(values[0], actual[key]["net"], rel_tol=0, abs_tol=1e-6)
                or not math.isclose(values[1], actual[key]["units"], rel_tol=0, abs_tol=1e-6)
                for key, values in totals.items() if key in actual
            ):
                errors.append("dashboard-brand-category: cambian los totales por rubro y marca")
            checked += 1

    original_sellers = before_dir / "dashboard-sellers.json"
    if original_sellers.is_file():
        totals: dict[tuple[int, str, str, str], list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
        for row in read(original_sellers)["sellerPerformance"]:
            values = totals[(row["periodId"], row["storeId"], row["category"], row["seller"])]
            for index, field in enumerate(("net", "units", "transactions")):
                values[index] += row[field]
        summaries = sorted(after_dir.glob("dashboard-sellers-category-????.json"))
        if summaries:
            actual = {
                (row["periodId"], row["storeId"], row["category"], row["seller"]): row
                for path in summaries for row in read(path)["sellerPerformance"]
            }
            if totals.keys() != actual.keys() or any(
                not math.isclose(value, actual[key][field], rel_tol=0, abs_tol=1e-6)
                for key, values in totals.items() if key in actual
                for field, value in zip(("net", "units", "transactions"), values)
            ):
                errors.append("dashboard-sellers-category: cambian los totales por rubro y vendedor")
            checked += 1

    print(f"Comparaciones: {checked}; diferencias: {len(errors)}")
    for error in errors:
        print(f"ERROR: {error}")
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    args = parser.parse_args()
    raise SystemExit(1 if verify(args.before, args.after) else 0)
