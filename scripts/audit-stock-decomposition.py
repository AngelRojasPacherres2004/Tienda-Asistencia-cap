"""Measure lossless stock partitions before choosing a delivery strategy."""

from __future__ import annotations

import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "piplines"))
from compactar_dashboard import compactar_stock  # noqa: E402


def encoded_bytes(value: object) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def predictive(row: dict) -> bool:
    if row["category"] not in ("TEXTIL", "CALZADO"):
        return False
    name = "".join(char for char in unicodedata.normalize("NFD", row["product"])
                   if unicodedata.category(char) != "Mn").upper()
    name = " ".join(name.split())
    import re
    return not (re.search(r"BOLSA(S)? (DE )?(PLASTICO|PAPEL)", name)
                or re.search(r"BOLSA -?NO TEJIDA", name))


def main() -> None:
    path = ROOT / "commercial-dashboard/public/assets/data/dashboard-stock-products.json"
    rows = json.loads(path.read_text(encoding="utf-8"))["stockProducts"]
    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(row["category"], []).append(row)
    for category, group in sorted(groups.items(), key=lambda pair: -len(pair[1])):
        print(category, len(group), encoded_bytes({"stockCompact": compactar_stock(group)}))
    selected = [row for row in rows if predictive(row)]
    print("PREDICTIVO", len(selected), encoded_bytes({"stockCompact": compactar_stock(selected)}))
    by_store = Counter(row["storeId"] for row in selected)
    print("TIENDAS_PREDICTIVO", len(by_store), "MAX_FILAS", max(by_store.values()))
    print("FILAS_TOTALES", len(rows))


if __name__ == "__main__":
    main()
