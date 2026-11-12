from __future__ import annotations

"""Procesador único de los lotes RMS cargados desde el portal.

Este servicio se ejecuta en la computadora que conserva Capa 1/Capa 2
históricas. Descarga un lote validado, lo integra de manera atómica, reconstruye
el modelo y publica una nueva versión. El portal continúa atendiendo la versión
anterior hasta que la publicación termina correctamente.

Uso en el equipo procesador:
    .venv/Scripts/python.exe piplines/procesar_cola_comercial.py --watch
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from calendar import monthrange
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import duckdb

from operacion_mensual import DATE_COLUMNS
from project_paths import CAPA1_DIR, CAPA2_DIR, PROJECT_ROOT, WORK_DIR


BUCKET = "dashboard-data"
SOURCE_FILES = {
    "ventas": ("Ventas.parquet", "Fact_Ventas.parquet"),
    "ingresos": ("Ingresos.parquet", "Fact_Ingresos.parquet"),
    "transferencias": ("Transferencias.parquet", "Fact_Transferencias.parquet"),
    "stock": ("Stock.parquet", "Fact_Stock.parquet"),
}
PENDING_STATES = {"pending_processing", "queued"}
STATUS_PREFIX = "commercial-batch-status"
LOCK_PREFIX = "commercial-batch-worker-locks"


class StorageError(RuntimeError):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise RuntimeError(f"Falta la configuración privada: {path}")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if not values.get("SUPABASE_URL"):
        raise RuntimeError("Falta SUPABASE_URL en .env.")
    if not (values.get("SUPABASE_SECRET_KEY") or values.get("SUPABASE_SERVICE_ROLE_KEY")):
        raise RuntimeError("Falta una clave de servicio de Supabase en .env.")
    return values


def service_key(env: dict[str, str]) -> str:
    return env.get("SUPABASE_SECRET_KEY") or env["SUPABASE_SERVICE_ROLE_KEY"]


def request(url: str, key: str, method: str, path: str, *, payload: object | None = None,
            content_type: str = "application/json", headers: dict[str, str] | None = None) -> bytes:
    body = None if payload is None else (payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8"))
    target = f"{url.rstrip('/')}{path}"
    req = urllib.request.Request(target, data=body, method=method, headers={
        "apikey": key, "Authorization": f"Bearer {key}",
        **({"Content-Type": content_type} if body is not None else {}),
        **(headers or {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise StorageError(error.code, f"{method} {path}: {detail}") from error


def storage_path(path: str) -> str:
    return "/storage/v1/object/" + BUCKET + "/" + urllib.parse.quote(path, safe="/")


def download_object(url: str, key: str, path: str) -> bytes:
    return request(url, key, "GET", storage_path(path))


def upload_object(url: str, key: str, path: str, payload: bytes, *, upsert: bool) -> None:
    request(url, key, "POST", storage_path(path), payload=payload,
            content_type="application/json", headers={"x-upsert": str(upsert).lower()})


def remove_object(url: str, key: str, path: str) -> None:
    request(url, key, "DELETE", storage_path(path))


def list_objects(url: str, key: str, prefix: str) -> list[dict[str, object]]:
    raw = request(url, key, "POST", f"/storage/v1/object/list/{BUCKET}", payload={
        "prefix": prefix, "limit": 1000, "offset": 0,
        "sortBy": {"column": "name", "order": "asc"},
    })
    result = json.loads(raw or b"[]")
    return result if isinstance(result, list) else []


def status_path(batch_id: str) -> str:
    return f"{STATUS_PREFIX}/{batch_id}.json"


def lock_path(batch_id: str) -> str:
    return f"{LOCK_PREFIX}/{batch_id}.json"


def write_status(url: str, key: str, batch: dict[str, object], state: str, **extra: object) -> None:
    payload = {
        "batchId": batch["id"], "cutoff": batch["cutoff"], "state": state,
        "updatedAt": now(), **extra,
    }
    upload_object(url, key, status_path(str(batch["id"])), json.dumps(payload, ensure_ascii=False).encode("utf-8"), upsert=True)


def read_status(url: str, key: str, batch_id: str) -> dict[str, object] | None:
    try:
        payload = json.loads(download_object(url, key, status_path(batch_id)))
        return payload if isinstance(payload, dict) else None
    except StorageError as error:
        if error.status == 404:
            return None
        raise


def latest_published_cutoff(url: str, key: str) -> str | None:
    query = urllib.parse.urlencode({
        "select": "sales_cutoff", "status": "eq.published", "order": "published_at.desc", "limit": "1",
    })
    rows = json.loads(request(url, key, "GET", f"/rest/v1/dashboard_releases?{query}") or b"[]")
    return str(rows[0]["sales_cutoff"]) if rows else None


def pending_batches(url: str, key: str, published_cutoff: str | None) -> list[dict[str, object]]:
    batches: list[dict[str, object]] = []
    for item in list_objects(url, key, "commercial-intake"):
        name = str(item.get("name") or "")
        if not name.endswith(".json"):
            continue
        try:
            batch = json.loads(download_object(url, key, f"commercial-intake/{name}"))
        except (StorageError, ValueError, json.JSONDecodeError):
            continue
        if not isinstance(batch, dict) or not isinstance(batch.get("id"), str) or not isinstance(batch.get("cutoff"), str):
            continue
        state = (read_status(url, key, batch["id"]) or {}).get("state", batch.get("status"))
        if state not in PENDING_STATES:
            continue
        if published_cutoff and batch["cutoff"] <= published_cutoff:
            write_status(url, key, batch, "obsolete", message=f"El dashboard ya está publicado hasta {published_cutoff}.")
            continue
        batches.append(batch)
    return sorted(batches, key=lambda row: (str(row["cutoff"]), str(row["receivedAt"])))


def claim_batch(url: str, key: str, batch: dict[str, object], worker_id: str) -> bool:
    try:
        upload_object(url, key, lock_path(str(batch["id"])), json.dumps({"workerId": worker_id, "claimedAt": now()}).encode("utf-8"), upsert=False)
    except StorageError as error:
        if error.status in {400, 409}:
            return False
        raise
    write_status(url, key, batch, "processing", startedAt=now())
    return True


def verify_parquet(path: Path, expected_size: int, expected_checksum: str | None = None) -> None:
    if not path.is_file() or path.stat().st_size != expected_size:
        raise RuntimeError(f"Descarga incompleta: {path.name}.")
    if expected_size < 8:
        raise RuntimeError(f"{path.name} es demasiado pequeño para ser Parquet.")
    with path.open("rb") as stream:
        if stream.read(4) != b"PAR1":
            raise RuntimeError(f"{path.name} no contiene cabecera Parquet.")
        stream.seek(-4, 2)
        if stream.read(4) != b"PAR1":
            raise RuntimeError(f"{path.name} no contiene cierre Parquet.")
    if expected_checksum:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected_checksum:
            raise RuntimeError(f"El checksum descargado de {path.name} no coincide con el lote validado.")


def download_files(url: str, key: str, batch: dict[str, object], destination: Path) -> dict[str, Path]:
    expected = {"ventas", "ingresos", "transferencias"}
    files = batch.get("files")
    if not isinstance(files, list):
        raise RuntimeError("El manifiesto de carga no contiene archivos.")
    result: dict[str, Path] = {}
    for item in files:
        if not isinstance(item, dict):
            raise RuntimeError("El manifiesto de carga es inválido.")
        source = str(item.get("source") or "")
        if source not in SOURCE_FILES or source in result:
            raise RuntimeError("El manifiesto contiene fuentes repetidas o desconocidas.")
        name = str(item.get("fileName") or "")
        expected_name = SOURCE_FILES[source][0]
        if name != expected_name:
            raise RuntimeError(f"El archivo de {source} debe llamarse {expected_name}.")
        parts = item.get("parts")
        size = int(item.get("fileSize") or 0)
        if not isinstance(parts, list) or not parts or size <= 0:
            raise RuntimeError(f"El manifiesto de {source} está incompleto.")
        output = destination / name
        with output.open("wb") as stream:
            for part in parts:
                stream.write(download_object(url, key, str(part)))
        checksum = item.get("sha256")
        if checksum is not None and (not isinstance(checksum, str) or len(checksum) != 64):
            raise RuntimeError(f"El checksum de {source} no es válido.")
        verify_parquet(output, size, checksum)
        result[source] = output
    if set(result) - {"ventas", "ingresos", "transferencias", "stock"} or not expected.issubset(result):
        raise RuntimeError("El lote no contiene exactamente las tres fuentes RMS requeridas.")
    closing = str(batch["cutoff"])[8:] == f"{monthrange(int(str(batch['cutoff'])[:4]), int(str(batch['cutoff'])[5:7]))[1]:02d}"
    if closing != ("stock" in result):
        raise RuntimeError("Stock solo se acepta en el cierre mensual.")
    return result


def date_sql(column: str) -> str:
    quoted = '"' + column.replace('"', '""') + '"'
    raw = f"trim(CAST({quoted} AS VARCHAR))"
    return f"""COALESCE(
      CASE WHEN try_cast({raw} AS DOUBLE) BETWEEN 1 AND 100000
        THEN DATE '1899-12-30' + CAST(floor(try_cast({raw} AS DOUBLE)) AS INTEGER) END,
      CAST(try_strptime({raw}, '%Y-%m-%d') AS DATE),
      CAST(try_strptime({raw}, '%d/%m/%Y') AS DATE),
      CAST(try_strptime({raw}, '%Y-%m-%d %H:%M:%S') AS DATE),
      CAST(try_strptime({raw}, '%d/%m/%Y %H:%M:%S') AS DATE)
    )"""


def stage_merge(existing: Path, incoming: Path, source: str, cutoff: str, stage: Path) -> None:
    first_day = cutoff[:8] + "01"
    date_column = "fecha_corte" if source == "stock" else DATE_COLUMNS[source]
    expression = date_sql(date_column)
    con = duckdb.connect(database=":memory:")
    try:
        metrics = con.execute(
            f"""SELECT count(*), count({expression}), min({expression}), max({expression}),
                       count(*) FILTER (WHERE {expression} < CAST(? AS DATE)),
                       count(*) FILTER (WHERE {expression} > CAST(? AS DATE))
                FROM read_parquet(?)""", [first_day, cutoff, str(incoming)]
        ).fetchone()
        total, valid, minimum, maximum, before, after = metrics
        if not valid or minimum is None or maximum is None:
            raise RuntimeError(f"{incoming.name} no contiene fechas RMS válidas.")
        if before or after or str(maximum) != cutoff:
            raise RuntimeError(
                f"{incoming.name} no coincide con {cutoff}: rango {minimum} a {maximum}; "
                f"fuera del período={before}, posteriores al corte={after}."
            )
        old_sql = str(existing.resolve()).replace("\\", "/").replace("'", "''")
        new_sql = str(incoming.resolve()).replace("\\", "/").replace("'", "''")
        stage_sql = str(stage.resolve()).replace("\\", "/").replace("'", "''")
        con.execute(
            f"""COPY (
                  SELECT * FROM read_parquet('{old_sql}')
                  WHERE NOT ({expression} >= DATE '{first_day}' AND {expression} <= DATE '{cutoff}')
                  UNION ALL BY NAME
                  SELECT * FROM read_parquet('{new_sql}')
                ) TO '{stage_sql}' (FORMAT PARQUET, COMPRESSION SNAPPY)"""
        )
    finally:
        con.close()
    if not stage.is_file() or not stage.stat().st_size:
        raise RuntimeError(f"No se pudo integrar {incoming.name}.")


def verify_baseline(files: dict[str, Path]) -> None:
    required = [CAPA1_DIR / name for _, name in SOURCE_FILES.values()]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError(
            "Este equipo no contiene el histórico base de Capa 1. "
            "El procesador debe ejecutarse en el equipo central que conserva capa1/capa2: " + ", ".join(missing)
        )
    if not (CAPA2_DIR / "FactVentas.parquet").is_file():
        raise RuntimeError("Falta Capa 2 histórica; no se puede publicar sobre una base incompleta.")
    if "stock" not in files:
        # Se conserva la última foto de stock ya validada en Capa 1.
        return


def run(command: list[str]) -> None:
    result = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
    if result.returncode:
        raise RuntimeError(f"Falló {Path(command[1]).name} (código {result.returncode}).")


def integrate_and_publish(url: str, key: str, batch: dict[str, object]) -> None:
    job = WORK_DIR / "commercial_queue" / str(batch["id"])
    download_dir = job / "download"
    stage_dir = job / "stage"
    backup_dir = job / "backup"
    shutil.rmtree(job, ignore_errors=True)
    download_dir.mkdir(parents=True, exist_ok=True)
    stage_dir.mkdir(parents=True, exist_ok=True)
    files = download_files(url, key, batch, download_dir)
    verify_baseline(files)
    cutoff = str(batch["cutoff"])
    targets: dict[str, tuple[Path, Path]] = {}
    for source, incoming in files.items():
        target = CAPA1_DIR / SOURCE_FILES[source][1]
        staged = stage_dir / target.name
        stage_merge(target, incoming, source, cutoff, staged)
        targets[source] = (target, staged)
    backup_dir.mkdir(parents=True, exist_ok=True)
    try:
        for target, staged in targets.values():
            shutil.copy2(target, backup_dir / target.name)
            shutil.move(str(staged), str(target))
        run([sys.executable, str(PROJECT_ROOT / "piplines" / "ejecutar_todo.py"), "--solo-capa2", "--fecha-corte", cutoff, "--omitir-faltantes"])
        run([sys.executable, str(PROJECT_ROOT / "piplines" / "publicar_corte_completo.py"), "--app-root", str(PROJECT_ROOT)])
    except BaseException:
        for target, _ in targets.values():
            backup = backup_dir / target.name
            if backup.is_file():
                shutil.copy2(backup, target)
        raise
    finally:
        shutil.rmtree(job, ignore_errors=True)


def process_once(env: dict[str, str], worker_id: str) -> bool:
    url, key = env["SUPABASE_URL"], service_key(env)
    batch_list = pending_batches(url, key, latest_published_cutoff(url, key))
    if not batch_list:
        return False
    batch = batch_list[0]
    if not claim_batch(url, key, batch, worker_id):
        return False
    try:
        integrate_and_publish(url, key, batch)
        write_status(url, key, batch, "published", completedAt=now())
        print(f"[PUBLICADO] corte {batch['cutoff']} · lote {batch['id']}", flush=True)
    except Exception as error:
        message = str(error).replace("\n", " ")[:700]
        write_status(url, key, batch, "failed", failedAt=now(), message=message)
        print(f"[ERROR] lote {batch['id']}: {message}", file=sys.stderr, flush=True)
    finally:
        try:
            remove_object(url, key, lock_path(str(batch["id"])))
        except StorageError:
            pass
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Permanece activo y consulta la cola periódicamente.")
    parser.add_argument("--interval", type=int, default=20, help="Segundos entre consultas en modo --watch (5 a 300).")
    args = parser.parse_args()
    if not 5 <= args.interval <= 300:
        raise SystemExit("--interval debe estar entre 5 y 300 segundos.")
    env = read_env(PROJECT_ROOT / ".env")
    worker_id = f"{os.environ.get('COMPUTERNAME', 'worker')}-{uuid4()}"
    while True:
        processed = process_once(env, worker_id)
        if not args.watch:
            return 0
        time.sleep(2 if processed else args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
