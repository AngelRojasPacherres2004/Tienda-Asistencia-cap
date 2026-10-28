"""Verify a staged Supabase dashboard release without activating it."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "piplines"))
from publicar_supabase import (  # noqa: E402
    DATA_DIR, api_headers, discover_dashboard_files, get_postgrest,
    load_env_file, request, sha256_file,
)
from particionar_dashboard import scope_catalog  # noqa: E402


def source_bytes(base_url: str, api_key: str, parts: list[dict]) -> bytes:
    compressed = bytearray()
    for part in parts:
        path = urllib.parse.quote(part["path"], safe="/")
        chunk = request("GET", f"{base_url}/storage/v1/object/dashboard-data/{path}",
                        api_headers(api_key, api_key))
        if hashlib.sha256(chunk).hexdigest() != part["sha256"]:
            raise ValueError(f"Parte alterada: {part['path']}")
        compressed.extend(chunk)
    return gzip.decompress(compressed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version")
    parser.add_argument("--env", type=Path, default=ROOT / ".env")
    args = parser.parse_args()
    load_env_file(args.env)
    base_url = os.environ["SUPABASE_URL"].rstrip("/")
    if urllib.parse.urlparse(base_url).hostname != "xtnihjzqnxozbotymoma.supabase.co":
        raise ValueError("El proyecto no es bd-app.")
    key = os.environ["SUPABASE_SECRET_KEY"]
    rows = get_postgrest(base_url, key, key,
                         "dashboard_releases?select=id,version,status,total_bytes,manifest"
                         f"&version=eq.{urllib.parse.quote(args.version)}&limit=1") or []
    if len(rows) != 1 or rows[0]["status"] != "staging":
        raise ValueError("La versión no existe o ya está activa.")
    release = rows[0]
    release_id = urllib.parse.quote(str(release["id"]))
    file_rows = get_postgrest(base_url, key, key,
                              "dashboard_files?select=logical_name,byte_size,checksum_sha256,parts"
                              f"&release_id=eq.{release_id}&limit=1000") or []
    expected, missing = discover_dashboard_files(DATA_DIR)
    if missing or {row["logical_name"] for row in file_rows} != set(expected):
        raise ValueError("Faltan archivos o hay nombres inesperados en la versión preparada.")
    if "dashboard-stock-products.json" in expected:
        raise ValueError("El detalle masivo de SKU no debe publicarse.")
    if sum(row["byte_size"] for row in file_rows) != release["total_bytes"]:
        raise ValueError("El total de bytes del manifiesto no coincide.")
    for row in file_rows:
        name = row["logical_name"]
        if row["byte_size"] != (DATA_DIR / name).stat().st_size or row["checksum_sha256"] != sha256_file(DATA_DIR / name):
            raise ValueError(f"Checksum local distinto: {name}")
    scopes = scope_catalog(json.loads((DATA_DIR / "dashboard.json").read_text(encoding="utf-8"))["stores"])
    scope_rows = []
    for offset in range(0, len(expected) * len(scopes), 1000):
        batch = get_postgrest(base_url, key, key,
                              "dashboard_scope_files?select=scope_type,scope_value,logical_name,byte_size,checksum_sha256,parts"
                              f"&release_id=eq.{release_id}&limit=1000&offset={offset}") or []
        scope_rows.extend(batch)
    actual = {(row["scope_type"], row["scope_value"], row["logical_name"]) for row in scope_rows}
    wanted = {(kind, scope, name) for kind, scope in scopes for name in expected}
    if len(scope_rows) != len(wanted) or actual != wanted:
        raise ValueError("Los archivos privados por tienda o clúster están incompletos.")
    sample = next(row for row in file_rows if row["logical_name"] == "dashboard.json")
    if hashlib.sha256(source_bytes(base_url, key, sample["parts"])).hexdigest() != sample["checksum_sha256"]:
        raise ValueError("No coincide el contenido del núcleo publicado.")
    scoped = next(row for row in scope_rows if row["scope_type"] == "store" and row["logical_name"] == "dashboard-stock-sizes-calzado.json")
    if hashlib.sha256(source_bytes(base_url, key, scoped["parts"])).hexdigest() != scoped["checksum_sha256"]:
        raise ValueError("No coincide el contenido privado de tallas.")
    print(f"Versión staging verificada: {args.version}; {len(file_rows)} archivos; {len(scope_rows)} alcances; {release['total_bytes']} bytes lógicos.")


if __name__ == "__main__":
    main()
