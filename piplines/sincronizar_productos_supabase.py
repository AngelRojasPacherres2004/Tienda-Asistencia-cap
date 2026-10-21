from __future__ import annotations

"""Sincroniza DimProducto con public.productos sin cambiar IDs existentes.

Por defecto solo valida y estima. Usa --apply para escribir en Supabase.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import duckdb

from project_paths import PROJECT_ROOT


EXPECTED_URL = "https://xtnihjzqnxozbotymoma.supabase.co"
DEFAULT_SOURCE = PROJECT_ROOT / "capa2" / "DimProducto.parquet"
FIELDS = (
    "codigo_nissei",
    "proveedor",
    "rubro",
    "linea",
    "sub_linea",
    "marca",
    "modelo",
    "descripcion",
)


def private_environment() -> tuple[str, str]:
    values = dict(os.environ)
    env_path = PROJECT_ROOT / ".env"
    if env_path.is_file():
        for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
            if "=" not in raw_line or raw_line.lstrip().startswith("#"):
                continue
            key, value = raw_line.split("=", 1)
            values.setdefault(key.strip(), value.strip().strip('"'))
    url = values.get("SUPABASE_URL", "").rstrip("/")
    secret = values.get("SUPABASE_SECRET_KEY", "")
    if url != EXPECTED_URL:
        raise RuntimeError("La conexión no apunta al proyecto bd-app esperado.")
    if not secret:
        raise RuntimeError("Falta SUPABASE_SECRET_KEY en la configuración privada.")
    return url, secret


def clean(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def product_query(source: Path) -> str:
    escaped = source.resolve().as_posix().replace("'", "''")
    columns = ", ".join(FIELDS)
    return f"""
        select {columns}
        from read_parquet('{escaped}')
        where codigo_nissei is not null
          and trim(cast(codigo_nissei as varchar)) <> ''
        order by codigo_nissei
    """


def post_batch(url: str, secret: str, rows: list[dict]) -> None:
    endpoint = url + "/rest/v1/productos?" + urllib.parse.urlencode({
        "on_conflict": "codigo_nissei",
    })
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        method="POST",
        headers={
            "apikey": secret,
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    for attempt in range(7):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"Supabase respondió HTTP {response.status}.")
            return
        except urllib.error.HTTPError as error:
            retryable = error.code == 429 or error.code >= 500
            if not retryable or attempt == 6:
                detail = error.read().decode("utf-8", errors="replace")[:500]
                raise RuntimeError(f"Supabase rechazó el lote ({error.code}): {detail}") from error
        except (TimeoutError, urllib.error.URLError) as error:
            if attempt == 6:
                raise RuntimeError("No se pudo completar la sincronización con Supabase.") from error
        time.sleep(min(10, 0.5 * (2**attempt)))


def synchronize(source: Path, batch_size: int, apply: bool) -> dict[str, int | bool]:
    if not source.is_file():
        raise FileNotFoundError(source)
    connection = duckdb.connect()
    query = product_query(source)
    total = connection.execute(f"select count(*) from ({query})").fetchone()[0]
    cursor = connection.execute(query)
    columns = [column[0] for column in cursor.description]
    if columns != list(FIELDS):
        raise RuntimeError(f"Esquema de DimProducto inesperado: {columns}")
    if not apply:
        connection.close()
        return {"productos": int(total), "aplicado": False}

    url, secret = private_environment()
    synced = 0
    updated_at = datetime.now(timezone.utc).isoformat()
    while values := cursor.fetchmany(batch_size):
        rows = []
        for row in values:
            item = {field: clean(value) for field, value in zip(columns, row)}
            item["updated_at"] = updated_at
            rows.append(item)
        post_batch(url, secret, rows)
        synced += len(rows)
        if synced == total or synced % (batch_size * 25) == 0:
            print(f"Sincronizados {synced:,} de {total:,} productos...", flush=True)
    connection.close()
    return {"productos": int(total), "sincronizados": synced, "aplicado": True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.batch_size < 50 or args.batch_size > 1000:
        parser.error("El tamaño de lote debe estar entre 50 y 1000.")
    result = synchronize(args.source, args.batch_size, args.apply)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
