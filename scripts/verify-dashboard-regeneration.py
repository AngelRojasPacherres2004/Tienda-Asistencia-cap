"""Check regenerated dashboard data against a preserved local release.

Rows may change order; the only accepted shape changes are the brand summary's
empty dimensions and the product code added to stock products.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path


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
