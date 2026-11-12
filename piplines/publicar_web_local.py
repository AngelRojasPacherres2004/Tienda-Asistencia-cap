from __future__ import annotations

"""Publica un lote RMS desde una copia portable completa.

El equipo conserva Capa 1/Capa 2 histórica, procesa el acumulado del mes y
publica directamente una versión atómica del dashboard.  El candado se guarda
en Supabase Storage, por lo que dos copias del ZIP no pueden publicar al mismo
tiempo.
"""

import argparse
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from operacion_mensual import SALIDA
from procesar_cola_comercial import (
    SOURCE_FILES,
    StorageError,
    read_env,
    request,
    service_key,
    stage_merge,
)
from project_paths import CAPA1_DIR, CAPA2_DIR, PROJECT_ROOT, WORK_DIR


BUCKET = "dashboard-data"
LOCK_PATH = "local-publication-lock/global.json"
BASE_PREFIX = "local-processing-base"
CHUNK_BYTES = 5 * 1024 * 1024
STATE_FILE = WORK_DIR / "local_publication_state.json"
REQUIRED_C1 = {source: fact for source, (_raw, fact) in SOURCE_FILES.items()}
REQUIRED_C2 = (
    "FactVentas.parquet", "FactIngresos.parquet", "FactTransferencias.parquet", "FactStock.parquet",
)


class PublishLocalError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def storage_url(path: str) -> str:
    return "/storage/v1/object/" + BUCKET + "/" + urllib.parse.quote(path, safe="/")


def fetch_object(url: str, key: str, path: str) -> bytes:
    return request(url, key, "GET", storage_url(path))


def put_object(url: str, key: str, path: str, data: bytes, *, upsert: bool, content_type: str = "application/json") -> None:
    request(
        url, key, "POST", storage_url(path), payload=data, content_type=content_type,
        headers={"x-upsert": str(upsert).lower(), "cache-control": "no-store"},
    )


def delete_object(url: str, key: str, path: str) -> None:
    request(url, key, "DELETE", storage_url(path))


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def valid_parquet(path: Path, label: str) -> None:
    if not path.is_file() or path.stat().st_size < 8:
        raise PublishLocalError(f"Falta un histórico válido de {label}: {path}")
    with path.open("rb") as stream:
        if stream.read(4) != b"PAR1":
            raise PublishLocalError(f"{path.name} no es un archivo Parquet válido.")
        stream.seek(-4, 2)
        if stream.read(4) != b"PAR1":
            raise PublishLocalError(f"{path.name} está incompleto.")


def verify_local_baseline() -> None:
    for source, fact in REQUIRED_C1.items():
        valid_parquet(CAPA1_DIR / fact, f"Capa 1 de {source}")
    for fact in REQUIRED_C2:
        valid_parquet(CAPA2_DIR / fact, f"Capa 2 {fact}")


def get_latest_cutoff(url: str, key: str) -> str | None:
    query = urllib.parse.urlencode({
        "select": "sales_cutoff", "status": "eq.published", "order": "published_at.desc", "limit": "1",
    })
    payload = request(url, key, "GET", f"/rest/v1/dashboard_releases?{query}")
    rows = json.loads(payload or b"[]")
    return str(rows[0]["sales_cutoff"]) if rows else None


def load_json_object(url: str, key: str, path: str) -> dict[str, object] | None:
    try:
        payload = json.loads(fetch_object(url, key, path))
    except StorageError as error:
        if error.status == 404:
            return None
        raise
    if not isinstance(payload, dict):
        raise PublishLocalError(f"El objeto remoto {path} es inválido.")
    return payload


def acquire_lock(url: str, key: str, cutoff: str) -> dict[str, object]:
    owner = {
        "id": str(uuid4()), "cutoff": cutoff, "startedAt": utc_now(),
        "computer": os.getenv("COMPUTERNAME") or socket.gethostname(),
        "windowsUser": os.getenv("USERNAME", "desconocido"),
    }
    try:
        # El alta sin upsert es la operación atómica: Storage permite solo al
        # primer equipo crear esta ruta. Ver documentación de Storage.
        put_object(url, key, LOCK_PATH, json.dumps(owner, ensure_ascii=False).encode("utf-8"), upsert=False)
    except StorageError as error:
        if error.status not in {400, 409}:
            raise
        active = load_json_object(url, key, LOCK_PATH) or {}
        who = active.get("computer", "otro equipo")
        since = active.get("startedAt", "hora desconocida")
        raise PublishLocalError(
            f"Publicación en proceso en {who} desde {since}. No se inició una segunda publicación."
        ) from error
    return owner


def download_part(url: str, key: str, remote_path: str, destination, digest) -> int:
    target = f"{url.rstrip('/')}{storage_url(remote_path)}"
    req = urllib.request.Request(target, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=240) as response:
            total = 0
            while block := response.read(1024 * 1024):
                destination.write(block)
                digest.update(block)
                total += len(block)
            return total
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise StorageError(error.code, f"GET {remote_path}: {detail}") from error


def download_baseline(url: str, key: str, manifest: dict[str, object]) -> str:
    base_id = str(manifest.get("id") or "")
    files = manifest.get("files")
    if not base_id or not isinstance(files, dict):
        raise PublishLocalError("El histórico remoto no tiene el formato esperado.")
    stage = WORK_DIR / "remote_base" / base_id
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True, exist_ok=True)
    for source, fact in REQUIRED_C1.items():
        item = files.get(source)
        if not isinstance(item, dict) or not isinstance(item.get("parts"), list):
            raise PublishLocalError(f"El histórico remoto no contiene {source}.")
        output = stage / fact
        digest = hashlib.sha256()
        with output.open("wb") as writer:
            for part in item["parts"]:
                if not isinstance(part, dict) or not isinstance(part.get("path"), str):
                    raise PublishLocalError(f"La parte remota de {source} es inválida.")
                received = download_part(url, key, str(part["path"]), writer, digest)
                if received != int(part.get("bytes") or 0):
                    raise PublishLocalError(f"La descarga histórica de {source} llegó incompleta.")
        if output.stat().st_size != int(item.get("bytes") or 0) or digest.hexdigest() != str(item.get("sha256") or ""):
            raise PublishLocalError(f"La descarga histórica de {source} no pasó checksum.")
        valid_parquet(output, f"histórico remoto de {source}")
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    for source, fact in REQUIRED_C1.items():
        shutil.copy2(stage / fact, CAPA1_DIR / fact)
    return base_id


def local_state() -> dict[str, object]:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


def synchronize_baseline(url: str, key: str) -> str | None:
    remote = load_json_object(url, key, f"{BASE_PREFIX}/current.json")
    if remote is None:
        verify_local_baseline()
        return None
    state = local_state()
    remote_id = str(remote.get("id") or "")
    if not remote_id:
        raise PublishLocalError("El puntero del histórico remoto no es válido.")
    if state.get("baseId") != remote_id:
        print("[SINCRONIZAR] Descargando histórico Capa 1 publicado más reciente...", flush=True)
        download_baseline(url, key, remote)
    else:
        for source, fact in REQUIRED_C1.items():
            valid_parquet(CAPA1_DIR / fact, f"Capa 1 de {source}")
    return remote_id


def upload_c1_file(url: str, key: str, base_id: str, source: str, file_path: Path) -> dict[str, object]:
    parts: list[dict[str, object]] = []
    digest = hashlib.sha256()
    with file_path.open("rb") as stream:
        index = 0
        while chunk := stream.read(CHUNK_BYTES):
            index += 1
            digest.update(chunk)
            path = f"{BASE_PREFIX}/{base_id}/{source}/part-{index:05d}"
            put_object(url, key, path, chunk, upsert=False, content_type="application/octet-stream")
            parts.append({"path": path, "bytes": len(chunk), "sha256": hashlib.sha256(chunk).hexdigest()})
    return {"bytes": file_path.stat().st_size, "sha256": digest.hexdigest(), "parts": parts}


def upload_baseline(url: str, key: str, cutoff: str, owner: dict[str, object]) -> dict[str, object]:
    base_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid4().hex[:10]}"
    files = {}
    for source, fact in REQUIRED_C1.items():
        print(f"[RESPALDO] Subiendo histórico Capa 1 · {source}...", flush=True)
        files[source] = upload_c1_file(url, key, base_id, source, CAPA1_DIR / fact)
    payload = {
        "schema": 1, "id": base_id, "cutoff": cutoff, "createdAt": utc_now(),
        "publisher": owner, "files": files,
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    put_object(url, key, f"{BASE_PREFIX}/history/{base_id}.json", encoded, upsert=False)
    return payload


def activate_baseline(url: str, key: str, payload: dict[str, object]) -> None:
    """Mueve el puntero solo tras activar el dashboard web."""
    put_object(
        url, key, f"{BASE_PREFIX}/current.json",
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), upsert=True,
    )


def output_manifest(periodo: str, cutoff: str) -> dict[str, object]:
    path = SALIDA / periodo / "manifiesto.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise PublishLocalError("Procesa el período antes de publicar; falta su manifiesto local.") from error
    if manifest.get("periodo") != periodo or manifest.get("fechaCorte") != cutoff:
        raise PublishLocalError("El lote procesado no coincide con el período y corte seleccionados.")
    if not isinstance(manifest.get("archivos"), dict):
        raise PublishLocalError("El manifiesto local no contiene sus archivos validados.")
    return manifest


def integrate(periodo: str, cutoff: str, manifest: dict[str, object]) -> None:
    batch_dir = WORK_DIR / "publicacion_local" / f"{periodo}-{cutoff}-{uuid4().hex[:8]}"
    stage_dir, backup_dir = batch_dir / "stage", batch_dir / "backup"
    stage_dir.mkdir(parents=True, exist_ok=True)
    backup_dir.mkdir(parents=True, exist_ok=True)
    staging: list[tuple[Path, Path]] = []
    files = manifest["archivos"]
    for source, (out_name, fact_name) in SOURCE_FILES.items():
        incoming = SALIDA / periodo / out_name
        if source not in files:
            raise PublishLocalError(f"El lote local no contiene {source}.")
        valid_parquet(incoming, source)
        target = CAPA1_DIR / fact_name
        staged = stage_dir / fact_name
        stage_merge(target, incoming, source, cutoff, staged)
        staging.append((target, staged))
    if bool(manifest.get("stockIncluido")):
        incoming = SALIDA / periodo / "Stock.parquet"
        target = CAPA1_DIR / SOURCE_FILES["stock"][1]
        valid_parquet(incoming, "stock")
        staged = stage_dir / target.name
        stage_merge(target, incoming, "stock", cutoff, staged)
        staging.append((target, staged))
    try:
        for target, staged in staging:
            shutil.copy2(target, backup_dir / target.name)
            shutil.move(str(staged), str(target))
        command = [sys.executable, str(PROJECT_ROOT / "piplines" / "ejecutar_todo.py"), "--solo-capa2", "--fecha-corte", cutoff, "--omitir-faltantes"]
        if subprocess.run(command, cwd=PROJECT_ROOT, check=False).returncode:
            raise PublishLocalError("La actualización de Capa 2 falló; se restauró el histórico anterior.")
    except BaseException:
        for target, _ in staging:
            backup = backup_dir / target.name
            if backup.is_file():
                shutil.copy2(backup, target)
        raise
    finally:
        shutil.rmtree(batch_dir, ignore_errors=True)


def publish(periodo: str, cutoff: str) -> None:
    env = read_env(PROJECT_ROOT / ".env")
    url, key = env["SUPABASE_URL"], service_key(env)
    manifest = output_manifest(periodo, cutoff)
    published = get_latest_cutoff(url, key)
    if published and cutoff <= published:
        raise PublishLocalError(f"El corte {cutoff} no es posterior al ya publicado ({published}).")
    owner = acquire_lock(url, key, cutoff)
    try:
        synchronize_baseline(url, key)
        integrate(periodo, cutoff, manifest)
        # Se replica la nueva base antes de activar la versión web. Si algo
        # falla, el dashboard vigente y el puntero remoto no se modifican.
        remote_base = upload_baseline(url, key, cutoff, owner)
        command = [sys.executable, str(PROJECT_ROOT / "piplines" / "publicar_corte_completo.py"), "--app-root", str(PROJECT_ROOT)]
        if subprocess.run(command, cwd=PROJECT_ROOT, check=False).returncode:
            raise PublishLocalError("La publicación web falló; el dashboard anterior sigue activo.")
        activate_baseline(url, key, remote_base)
        state = {"baseId": remote_base["id"], "cutoff": cutoff, "publishedAt": utc_now(), "publisher": owner}
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        audit_path = f"local-publication-audit/{remote_base['id']}.json"
        put_object(url, key, audit_path, json.dumps(state, ensure_ascii=False).encode("utf-8"), upsert=False)
        print(f"[PUBLICADO] Corte {cutoff} · equipo {owner['computer']} · respaldo {remote_base['id']}")
    finally:
        try:
            delete_object(url, key, LOCK_PATH)
        except StorageError as error:
            print(f"AVISO: no se pudo liberar el candado: {error}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--periodo", required=True, help="AAAAMM")
    parser.add_argument("--fecha-corte", required=True, help="AAAA-MM-DD")
    args = parser.parse_args()
    try:
        publish(args.periodo, args.fecha_corte)
        return 0
    except Exception as error:
        print(f"ERROR DE PUBLICACIÓN: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
