"""Validate real dashboard year partitions and estimate their transfer size.

This is read-only: it does not publish data or replace the legacy JSON files.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "piplines"))

from generar_datos_web import particionar_registros_anuales  # noqa: E402


DATASETS = {
    "dashboard-sellers": "sellerPerformance",
    "dashboard-brand": "monthlyBrand",
    "dashboard-price-range": "monthlyPriceRange",
    "dashboard-subline": "monthlySubline",
}


def measure(directory: Path) -> list[dict]:
    results = []
    for name, key in DATASETS.items():
        source = directory / f"{name}.json"
        raw = source.read_bytes()
        original_gzip = len(gzip.compress(raw, compresslevel=6, mtime=0))
        payload = json.loads(raw)
        del raw
        if set(payload) != {key} or not isinstance(payload[key], list):
            raise ValueError(f"{source.name} no tiene el formato de detalle esperado")

        rows = payload[key]
        partitions = particionar_registros_anuales(rows, name, key)
        grouped: dict[int, list[dict]] = {}
        for row in rows:
            year = int(row["periodId"]) // 100
            grouped.setdefault(year, []).append(row)

        per_year = {}
        for filename, part in partitions.items():
            year = int(filename.removesuffix(".json").rsplit("-", 1)[1])
            if part[key] != grouped[year]:
                raise AssertionError(f"{filename} difiere del origen")
            encoded = json.dumps(part, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            per_year[year] = {
                "rows": len(part[key]),
                "bytes": len(encoded),
                "gzipBytes": len(gzip.compress(encoded, compresslevel=6, mtime=0)),
            }
        if sum(item["rows"] for item in per_year.values()) != len(rows):
            raise AssertionError(f"{source.name} perdió filas al dividirse")
        results.append({
            "dataset": name,
            "sourceRows": len(rows),
            "sourceBytes": source.stat().st_size,
            "sourceGzipBytes": original_gzip,
            "years": per_year,
        })
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(measure(args.directory), ensure_ascii=False, indent=2))
