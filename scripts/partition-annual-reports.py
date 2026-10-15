"""Partition an existing private annual report release by month, without changing source data.

Run against the already validated annual export in a *different* destination folder.
The new manifest is additive (schemaVersion 2); the legacy export remains intact.
"""

import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path
from shutil import copyfile


def partition(source: Path, output: Path):
    if source.resolve() == output.resolve():
        raise ValueError("La carpeta de salida debe ser distinta de la fuente.")
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") == 2:
        raise ValueError("La fuente ya está particionada.")
    if (output / "manifest.json").exists():
        raise FileExistsError("La salida ya tiene un manifiesto; usa una carpeta nueva.")
    handles = {}
    counts = defaultdict(int)
    try:
        for item in manifest["files"]:
            with gzip.open(source / item["path"], "rt", encoding="utf-8") as rows:
                for line in rows:
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    month = int(row["mes"])
                    if month < 1 or month > 12:
                        raise ValueError(f"Mes inválido en {item['path']}")
                    key = (item["year"], item["kind"], item["storeId"], month)
                    if key not in handles:
                        target = output / str(key[0]) / key[1] / key[2] / f"{month:02d}.jsonl.gz"
                        target.parent.mkdir(parents=True, exist_ok=True)
                        handles[key] = gzip.open(target, "wt", encoding="utf-8", compresslevel=6)
                    handles[key].write(line)
                    counts[key] += 1
    finally:
        for handle in handles.values():
            handle.close()
    files = []
    for (year, kind, store_id, month), count in sorted(counts.items()):
        path = f"{year}/{kind}/{store_id}/{month:02d}.jsonl.gz"
        files.append({"year": year, "kind": kind, "storeId": store_id, "month": month,
                      "rows": count, "bytes": (output / path).stat().st_size, "path": path})
    summaries = []
    for item in manifest["summaries"]:
        target = output / item["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        copyfile(source / item["path"], target)
        summaries.append(item)
    result = {**manifest, "schemaVersion": 2, "files": files, "summaries": summaries}
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {"files": len(files), "detailRows": sum(item["rows"] for item in files),
            "compressedBytes": sum(item["bytes"] for item in files + summaries)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(partition(args.source, args.output)))
