"""Calcula el espacio real de una publicación privada, sin subir datos."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

from particionar_dashboard import scope_catalog, scope_payload


def main() -> None:
    data_dir = Path(__file__).resolve().parents[1] / "dashboard-data"
    catalog = json.loads((data_dir / "dashboard.json").read_text(encoding="utf-8"))
    scopes = scope_catalog(catalog["stores"])
    originals = scoped = 0
    for path in sorted(data_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        original_bytes = gzip.compress(path.read_bytes(), compresslevel=6, mtime=0)
        originals += len(original_bytes)
        scoped_bytes = 0
        for store_ids in scopes.values():
            subset = scope_payload(payload, store_ids)
            encoded = json.dumps(subset, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            scoped_bytes += len(gzip.compress(encoded, compresslevel=6, mtime=0))
        scoped += scoped_bytes
        print(f"{path.name}: general={len(original_bytes) / 1048576:.2f} MiB, alcances={scoped_bytes / 1048576:.2f} MiB", flush=True)
    print(json.dumps({
        "files": len(list(data_dir.glob("*.json"))),
        "scopes": len(scopes),
        "original_mib": round(originals / 1048576, 2),
        "scoped_mib": round(scoped / 1048576, 2),
        "two_releases_mib": round(2 * (originals + scoped) / 1048576, 2),
    }), flush=True)


if __name__ == "__main__":
    main()
