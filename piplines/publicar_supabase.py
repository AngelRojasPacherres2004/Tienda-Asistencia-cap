"""Publica los JSON del dashboard como una versión atómica en Supabase.

Las credenciales limitadas de publicación se leen únicamente desde variables
de entorno o desde ``.env.supabase.local``. Nunca se copian al frontend ni se
imprimen en consola.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from runtime_config import finalizar_proceso
from particionar_dashboard import scope_catalog, scope_payload


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "commercial-dashboard" / "public" / "assets" / "data"
STATIC_CORE_FILES = (
    "dashboard.json",
    "dashboard-predictive.json",
    "dashboard-stock-origin.json",
    "dashboard-stock-hierarchy.json",
    "dashboard-stock-transfers.json",
    "dashboard-stock-sizes-textil.json",
    "dashboard-stock-sizes-calzado.json",
)
YEARLY_DATASETS = (
    "dashboard-sellers",
    "dashboard-brand",
    "dashboard-price-range",
    "dashboard-subline",
)
# La carga estándar de Storage es más estable por debajo de 6 MB.
CHUNK_BYTES = 5 * 1024 * 1024
DEFAULT_RELEASES_TO_KEEP = 2
RUNTIME_CONFIG = ROOT / "commercial-dashboard" / "public" / "runtime-config.js"
class PublishError(RuntimeError):
    pass


def discover_dashboard_files(data_dir: Path) -> tuple[tuple[str, ...], list[str]]:
    """Prefiere particiones anuales y acepta monolitos de una versión antigua."""

    files = list(STATIC_CORE_FILES)
    missing = [name for name in STATIC_CORE_FILES if not (data_dir / name).is_file()]
    if (data_dir / "dashboard-predictive-compact.json").is_file():
        files.remove("dashboard-predictive.json")
        missing = [name for name in missing if name != "dashboard-predictive.json"]
        files.append("dashboard-predictive-compact.json")
    for dataset in YEARLY_DATASETS:
        partitions = tuple(sorted(path.name for path in data_dir.glob(f"{dataset}-????.json")))
        compact = tuple(sorted(path.name for path in data_dir.glob(f"{dataset}-compact-????.json")))
        legacy = f"{dataset}.json"
        if compact:
            raw_years = {name.removeprefix(f"{dataset}-").removesuffix(".json") for name in partitions}
            compact_years = {name.removeprefix(f"{dataset}-compact-").removesuffix(".json") for name in compact}
            missing.extend(f"{dataset}-compact-{year}.json" for year in sorted(raw_years - compact_years))
            files.extend(compact)
        elif partitions:
            files.extend(partitions)
        elif (data_dir / legacy).is_file():
            files.append(legacy)
        else:
            missing.append(f"{dataset}-AAAA.json")
    seller_years = {
        name.rsplit("-", 1)[-1].removesuffix(".json")
        for name in files if re.fullmatch(r"dashboard-sellers-(?:compact-)?\d{4}\.json", name)
    }
    seller_summaries = tuple(sorted(path.name for path in data_dir.glob("dashboard-sellers-summary-????.json")))
    if seller_summaries:
        summary_years = {
            name.removeprefix("dashboard-sellers-summary-").removesuffix(".json")
            for name in seller_summaries
        }
        missing.extend(f"dashboard-sellers-summary-{year}.json" for year in sorted(seller_years - summary_years))
        files.extend(seller_summaries)
    seller_categories = tuple(sorted(path.name for path in data_dir.glob("dashboard-sellers-category-????.json")))
    if seller_categories:
        category_years = {
            name.removeprefix("dashboard-sellers-category-").removesuffix(".json")
            for name in seller_categories
        }
        missing.extend(f"dashboard-sellers-category-{year}.json" for year in sorted(seller_years - category_years))
        files.extend(seller_categories)
    files.extend(sorted(path.name for path in data_dir.glob("dashboard-sellers-????-??.json")))
    price_years = {
        name.rsplit("-", 1)[-1].removesuffix(".json")
        for name in files if re.fullmatch(r"dashboard-price-range-(?:compact-)?\d{4}\.json", name)
    }
    price_summaries = tuple(sorted(path.name for path in data_dir.glob("dashboard-price-range-summary-????.json")))
    if price_summaries:
        summary_years = {
            name.removeprefix("dashboard-price-range-summary-").removesuffix(".json")
            for name in price_summaries
        }
        missing.extend(f"dashboard-price-range-summary-{year}.json" for year in sorted(price_years - summary_years))
        files.extend(price_summaries)
    price_categories = tuple(sorted(path.name for path in data_dir.glob("dashboard-price-range-category-????.json")))
    if price_categories:
        category_years = {
            name.removeprefix("dashboard-price-range-category-").removesuffix(".json")
            for name in price_categories
        }
        missing.extend(f"dashboard-price-range-category-{year}.json" for year in sorted(price_years - category_years))
        files.extend(price_categories)
    files.extend(sorted(path.name for path in data_dir.glob("dashboard-price-range-????-??.json")))
    brand_years = {
        name.rsplit("-", 1)[-1].removesuffix(".json")
        for name in files if re.fullmatch(r"dashboard-brand-(?:compact-)?\d{4}\.json", name)
    }
    brand_summaries = tuple(sorted(path.name for path in data_dir.glob("dashboard-brand-category-????.json")))
    if brand_summaries:
        summary_years = {
            name.removeprefix("dashboard-brand-category-").removesuffix(".json")
            for name in brand_summaries
        }
        missing.extend(f"dashboard-brand-category-{year}.json" for year in sorted(brand_years - summary_years))
        files.extend(brand_summaries)
    daily_raw = tuple(sorted(path.name for path in data_dir.glob("dashboard-daily-????-??.json")))
    daily_compact = tuple(sorted(path.name for path in data_dir.glob("dashboard-daily-compact-????-??.json")))
    if daily_compact:
        raw_periods = {name.removeprefix("dashboard-daily-") for name in daily_raw}
        compact_periods = {name.removeprefix("dashboard-daily-compact-") for name in daily_compact}
        missing.extend(f"dashboard-daily-compact-{period}" for period in sorted(raw_periods - compact_periods))
    daily_files = daily_compact or daily_raw
    if not daily_files and (data_dir / "dashboard-daily.json").is_file():
        daily_files = ("dashboard-daily.json",)
    if not daily_files:
        missing.append("dashboard-daily-AAAA-MM.json")
    files.extend(daily_files)
    return tuple(files), missing


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def load_public_runtime_config() -> dict[str, str]:
    """Obtiene únicamente la URL y la clave pública incluidas en la web."""

    if not RUNTIME_CONFIG.is_file():
        return {}
    content = RUNTIME_CONFIG.read_text(encoding="utf-8")
    match = re.search(r"=\s*({.*})\s*;?\s*$", content, flags=re.DOTALL)
    if not match:
        return {}
    try:
        supplied = json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}
    return {
        "url": str(supplied.get("supabaseUrl", "")).strip(),
        "key": str(supplied.get("supabasePublishableKey", "")).strip(),
    }


def jwt_app_purpose(access_token: str) -> str:
    """Lee el propósito firmado por Supabase para reconocer al publicador."""

    try:
        encoded = access_token.split(".")[1]
        encoded += "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded).decode("utf-8"))
        return str(payload.get("app_metadata", {}).get("purpose", ""))
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return ""


def request(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None = None,
    *,
    attempts: int = 3,
) -> bytes:
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=240) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read(2_000).decode("utf-8", errors="replace")
            if exc.code < 500 and exc.code != 429:
                raise PublishError(f"Supabase respondió HTTP {exc.code}: {detail}") from exc
            last_error = f"HTTP {exc.code}: {detail}"
        except urllib.error.URLError as exc:
            last_error = str(exc.reason)
        if attempt < attempts:
            time.sleep(2**attempt)
    raise PublishError(f"No se pudo completar la solicitud después de {attempts} intentos: {last_error}")


def api_headers(
    api_key: str,
    access_token: str,
    *,
    content_type: str = "application/json",
) -> dict[str, str]:
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": content_type,
    }


def sign_in(base_url: str, publishable_key: str, username: str, password: str) -> str:
    """Inicia la sesión publicadora mediante su nombre de usuario, no correo."""

    payload = json.dumps({"username": username, "password": password}).encode("utf-8")
    raw = request(
        "POST",
        f"{base_url}/functions/v1/username-login",
        {"apikey": publishable_key, "Content-Type": "application/json"},
        payload,
    )
    response = json.loads(raw)
    access_token = str(response.get("access_token", "")).strip()
    if not access_token:
        raise PublishError("Supabase Auth no devolvió una sesión de publicación.")
    return access_token


def control_session(base_url: str, api_key: str, access_token: str, action: str) -> None:
    request(
        "POST",
        f"{base_url}/functions/v1/session-control",
        api_headers(api_key, access_token),
        json.dumps({"action": action}).encode("utf-8"),
    )


def postgrest(
    base_url: str,
    api_key: str,
    access_token: str,
    method: str,
    resource: str,
    payload: Any,
    *,
    prefer: str = "return=minimal",
) -> Any:
    headers = api_headers(api_key, access_token)
    headers["Prefer"] = prefer
    raw = request(
        method,
        f"{base_url}/rest/v1/{resource}",
        headers,
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
    )
    return json.loads(raw) if raw else None


def get_postgrest(base_url: str, api_key: str, access_token: str, resource: str) -> Any:
    raw = request(
        "GET",
        f"{base_url}/rest/v1/{resource}",
        api_headers(api_key, access_token),
    )
    return json.loads(raw) if raw else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def parse_metadata() -> dict[str, str]:
    payload = json.loads((DATA_DIR / "dashboard.json").read_text(encoding="utf-8"))
    metadata = payload.get("metadata", {})
    required = ("generatedAt", "salesCutoff", "stockCutoff")
    if any(not metadata.get(key) for key in required):
        raise PublishError("dashboard.json no contiene generatedAt, salesCutoff y stockCutoff.")
    return {key: str(metadata[key]) for key in required}


def upload_file_parts(
    base_url: str,
    api_key: str,
    access_token: str,
    version: str,
    source_path: Path,
    *,
    object_key: str | None = None,
    source_bytes: bytes | None = None,
    quiet: bool = False,
) -> list[dict[str, Any]]:
    # Los JSON del dashboard repiten muchas claves y comprimen especialmente bien.
    # mtime=0 hace el resultado determinista para una misma entrada.
    compressed = gzip.compress(source_bytes if source_bytes is not None else source_path.read_bytes(), compresslevel=6, mtime=0)
    parts: list[dict[str, Any]] = []
    for offset in range(0, len(compressed), CHUNK_BYTES):
        chunk = compressed[offset:offset + CHUNK_BYTES]
        part_number = offset // CHUNK_BYTES + 1
        object_path = f"{version}/{object_key or source_path.name}.gz/part-{part_number:04d}"
        encoded_path = urllib.parse.quote(object_path, safe="/")
        # El bucket ya admite octet-stream; la codificación real queda registrada
        # en el manifiesto y el cliente la descomprime de forma explícita.
        headers = api_headers(api_key, access_token, content_type="application/octet-stream")
        headers["x-upsert"] = "true"
        headers["cache-control"] = "max-age=31536000, immutable"
        request(
            "POST",
            f"{base_url}/storage/v1/object/dashboard-data/{encoded_path}",
            headers,
            chunk,
        )
        parts.append(
            {
                "path": object_path,
                "bytes": len(chunk),
                "sha256": hashlib.sha256(chunk).hexdigest(),
                "encoding": "gzip",
            }
        )
        if not quiet:
            print(f"  {source_path.name}: parte comprimida {part_number} publicada")
    return parts


def delete_postgrest(
    base_url: str,
    api_key: str,
    access_token: str,
    resource: str,
) -> None:
    headers = api_headers(api_key, access_token)
    headers["Prefer"] = "return=minimal"
    request("DELETE", f"{base_url}/rest/v1/{resource}", headers)


def list_storage_objects(
    base_url: str,
    api_key: str,
    access_token: str,
    prefix: str = "",
) -> list[str]:
    objects: list[str] = []
    offset = 0
    while True:
        payload = json.dumps(
            {
                "prefix": prefix,
                "limit": 1_000,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            },
            separators=(",", ":"),
        ).encode("utf-8")
        raw = request(
            "POST",
            f"{base_url}/storage/v1/object/list/dashboard-data",
            api_headers(api_key, access_token),
            payload,
        )
        entries = json.loads(raw) if raw else []
        for entry in entries:
            name = str(entry.get("name", "")).strip()
            if not name:
                continue
            object_path = f"{prefix}/{name}" if prefix else name
            if entry.get("id") or isinstance(entry.get("metadata"), dict):
                objects.append(object_path)
            else:
                objects.extend(
                    list_storage_objects(base_url, api_key, access_token, object_path)
                )
        if len(entries) < 1_000:
            break
        offset += len(entries)
    return objects


def remove_storage_objects(
    base_url: str,
    api_key: str,
    access_token: str,
    paths: list[str],
) -> None:
    for index in range(0, len(paths), 1_000):
        batch = paths[index:index + 1_000]
        request(
            "DELETE",
            f"{base_url}/storage/v1/object/dashboard-data",
            api_headers(api_key, access_token),
            json.dumps({"prefixes": batch}, separators=(",", ":")).encode("utf-8"),
        )


def cleanup_release_history(
    base_url: str,
    api_key: str,
    access_token: str,
    *,
    keep: int,
) -> dict[str, int]:
    releases = get_postgrest(
        base_url,
        api_key,
        access_token,
        "dashboard_releases?select=id,version,status,published_at&order=published_at.desc.nullslast",
    ) or []
    published = [row for row in releases if row.get("status") == "published"]
    retained_ids = {str(row["id"]) for row in published[:keep]}
    if not retained_ids:
        raise PublishError("No existe una publicación vigente para conservar.")

    file_rows = get_postgrest(
        base_url,
        api_key,
        access_token,
        "dashboard_files?select=release_id,parts",
    ) or []
    retained_paths = {
        str(part["path"])
        for row in file_rows
        if str(row.get("release_id")) in retained_ids
        for part in (row.get("parts") or [])
        if part.get("path")
    }
    for release_id in retained_ids:
        scope_rows = get_postgrest(
            base_url, api_key, access_token,
            "dashboard_scope_files?select=parts"
            f"&release_id=eq.{urllib.parse.quote(release_id)}&limit=1000",
        ) or []
        retained_paths.update(
            str(part["path"])
            for row in scope_rows
            for part in (row.get("parts") or [])
            if part.get("path")
        )
    removable_releases = [
        row
        for row in releases
        if str(row.get("id")) not in retained_ids
    ]
    if not removable_releases:
        return {
            "releases_kept": len(retained_ids),
            "releases_removed": 0,
            "objects_removed": 0,
        }
    # El bucket también contiene reportes y cargas. Solo retirar objetos que
    # pertenecen a versiones obsoletas del dashboard, nunca el resto.
    obsolete_prefixes = tuple(
        f"{row['version']}/" for row in removable_releases if row.get("version")
    )
    stored_paths = list_storage_objects(base_url, api_key, access_token)
    removable_paths = sorted(
        path for path in stored_paths
        if path.startswith(obsolete_prefixes) and path not in retained_paths
    )
    remove_storage_objects(base_url, api_key, access_token, removable_paths)

    for release in removable_releases:
        delete_postgrest(
            base_url,
            api_key,
            access_token,
            f"dashboard_releases?id=eq.{urllib.parse.quote(str(release['id']))}",
        )
    return {
        "releases_kept": len(retained_ids),
        "releases_removed": len(removable_releases),
        "objects_removed": len(removable_paths),
    }


def publish(env_path: Path, *, interactive: bool = False, expected_project_ref: str | None = None) -> None:
    load_env_file(env_path)
    public_config = load_public_runtime_config()
    base_url = (
        os.environ.get("SUPABASE_URL", "").strip()
        or public_config.get("url", "")
    ).rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    publisher_session = False
    if not base_url:
        raise PublishError("No se encontró la URL pública de Supabase.")
    if expected_project_ref and urllib.parse.urlparse(base_url).hostname != f"{expected_project_ref}.supabase.co":
        raise PublishError(f"La URL de Supabase no corresponde al proyecto {expected_project_ref}.")

    service_key = service_key or os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if service_key:
        api_key = service_key
        access_token = service_key
    else:
        api_key = (
            os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
            or public_config.get("key", "")
        )
        publisher_username = os.environ.get("SUPABASE_PUBLISHER_USERNAME", "").strip()
        publisher_password = os.environ.get("SUPABASE_PUBLISHER_PASSWORD", "").strip()
        if interactive and not publisher_username:
            publisher_username = input("Usuario publicador [comercial1]: ").strip() or "comercial1"
        if interactive and not publisher_password:
            publisher_password = getpass.getpass("Contraseña: ")
        if not api_key or not publisher_username or not publisher_password:
            raise PublishError(
                "Faltan las credenciales limitadas de publicación."
            )
        access_token = sign_in(base_url, api_key, publisher_username, publisher_password)
        if jwt_app_purpose(access_token) != "dashboard_publisher":
            raise PublishError(
                "La cuenta ingresada no es el publicador dedicado. Usa el usuario comercial1."
            )
        control_session(base_url, api_key, access_token, "claim")
        publisher_session = True

    required_files, missing = discover_dashboard_files(DATA_DIR)
    if missing:
        raise PublishError(f"Faltan archivos del dashboard: {', '.join(missing)}")

    metadata = parse_metadata()
    snapshot = get_postgrest(
        base_url, api_key, access_token,
        "dashboard_stock_snapshots?select=stock_cutoff,row_count,status"
        f"&stock_cutoff=eq.{urllib.parse.quote(metadata['stockCutoff'])}&status=eq.ready&limit=1",
    ) or []
    if len(snapshot) != 1 or int(snapshot[0].get("row_count") or 0) <= 0:
        raise PublishError("El corte de stock no está validado en la base; no se publica un manifiesto sin su consulta por API.")
    catalog_payload = json.loads((DATA_DIR / "dashboard.json").read_text(encoding="utf-8"))
    scopes = scope_catalog(catalog_payload["stores"])
    checksums = {name: sha256_file(DATA_DIR / name) for name in required_files}
    total_bytes = sum((DATA_DIR / name).stat().st_size for name in required_files)
    combined = hashlib.sha256(
        "".join(f"{name}:{checksums[name]}" for name in required_files).encode("utf-8")
    ).hexdigest()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    version = f"{timestamp}-{combined[:12]}"

    # Reutiliza las partes inmutables de la última versión cuando el checksum
    # coincide. Así una corrección pequeña no vuelve a subir cientos de MB.
    reusable: dict[str, dict[str, Any]] = {}
    reusable_scopes: dict[tuple[str, str, str], dict[str, Any]] = {}
    try:
        previous = get_postgrest(
            base_url, api_key, access_token,
            "dashboard_releases?select=id&status=eq.published&order=published_at.desc&limit=1",
        )
        if previous:
            previous_id = urllib.parse.quote(str(previous[0]["id"]))
            previous_files = get_postgrest(
                base_url, api_key, access_token,
                "dashboard_files?select=logical_name,byte_size,checksum_sha256,content_type,parts"
                f"&release_id=eq.{previous_id}",
            ) or []
            reusable = {str(row["logical_name"]): row for row in previous_files}
            previous_scopes = get_postgrest(
                base_url, api_key, access_token,
                "dashboard_scope_files?select=scope_type,scope_value,logical_name,byte_size,checksum_sha256,content_type,parts"
                f"&release_id=eq.{previous_id}&limit=1000",
            ) or []
            reusable_scopes = {
                (str(row["scope_type"]), str(row["scope_value"]), str(row["logical_name"])): row
                for row in previous_scopes
            }
    except Exception:
        reusable = {}

    try:
        releases_to_keep = max(
            1,
            min(3, int(os.environ.get("DASHBOARD_RELEASES_TO_KEEP", DEFAULT_RELEASES_TO_KEEP))),
        )
    except ValueError:
        releases_to_keep = DEFAULT_RELEASES_TO_KEEP

    release_payload = {
        "version": version,
        "status": "staging",
        "sales_cutoff": metadata["salesCutoff"],
        "stock_cutoff": metadata["stockCutoff"],
        "generated_at": metadata["generatedAt"],
        "total_bytes": total_bytes,
        "checksum_sha256": combined,
        "manifest": {},
    }
    created = postgrest(
        base_url,
        api_key,
        access_token,
        "POST",
        "dashboard_releases",
        release_payload,
        prefer="return=representation",
    )
    if not created or not created[0].get("id"):
        raise PublishError("Supabase no devolvió el identificador de la publicación.")
    release_id = str(created[0]["id"])
    print(f"Publicación temporal creada: {version}")

    try:
        file_rows = []
        scope_rows = []
        manifest: dict[str, Any] = {}
        stored_total_bytes = 0
        for name in required_files:
            path = DATA_DIR / name
            previous = reusable.get(name)
            unchanged = bool(
                previous
                and previous.get("checksum_sha256") == checksums[name]
                and int(previous.get("byte_size") or 0) == path.stat().st_size
                and previous.get("parts")
                and previous.get("content_type") == "application/gzip"
                and all(part.get("encoding") == "gzip" for part in previous["parts"])
            )
            if unchanged:
                parts = previous["parts"]
                print(f"  {name}: sin cambios, partes comprimidas reutilizadas")
            else:
                parts = upload_file_parts(base_url, api_key, access_token, version, path)
            stored_bytes = sum(int(part.get("bytes") or 0) for part in parts)
            stored_total_bytes += stored_bytes
            file_rows.append(
                {
                    "release_id": release_id,
                    "logical_name": name,
                    "byte_size": path.stat().st_size,
                    "checksum_sha256": checksums[name],
                    "content_type": "application/gzip",
                    "parts": parts,
                }
            )
            manifest[name] = {
                "bytes": path.stat().st_size,
                "storedBytes": stored_bytes,
                "encoding": "gzip",
                "parts": len(parts),
                "reused": unchanged,
            }

            # Cada rol restringido recibe un archivo físicamente limitado a
            # su tienda o clúster. Ningún filtro del navegador es una frontera
            # de autorización.
            payload = catalog_payload if name == "dashboard.json" else json.loads(path.read_text(encoding="utf-8"))
            def prepare_scope(item: tuple[tuple[str, str], set[str]]) -> dict[str, Any]:
                (scope_type, scope_value), allowed_ids = item
                scoped = json.dumps(
                    scope_payload(payload, allowed_ids), ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
                checksum = hashlib.sha256(scoped).hexdigest()
                previous_scope = reusable_scopes.get((scope_type, scope_value, name))
                same = bool(
                    previous_scope and previous_scope.get("checksum_sha256") == checksum
                    and int(previous_scope.get("byte_size") or 0) == len(scoped)
                    and previous_scope.get("content_type") == "application/gzip"
                    and previous_scope.get("parts")
                )
                scoped_parts = previous_scope["parts"] if same else upload_file_parts(
                    base_url, api_key, access_token, version, path,
                    object_key=f"scoped/{scope_type}/{scope_value}/{name}",
                    source_bytes=scoped, quiet=True,
                )
                return {
                    "release_id": release_id, "scope_type": scope_type,
                    "scope_value": scope_value, "logical_name": name,
                    "byte_size": len(scoped), "checksum_sha256": checksum,
                    "content_type": "application/gzip", "parts": scoped_parts,
                }

            # Cada objeto de alcance tiene una ruta distinta. Publicarlos en
            # paralelo evita cientos de esperas de red sin alterar el orden del
            # manifiesto ni cruzar datos entre tiendas.
            workers = max(1, min(8, int(os.environ.get("DASHBOARD_UPLOAD_WORKERS", "8"))))
            with ThreadPoolExecutor(max_workers=min(workers, len(scopes))) as executor:
                scope_rows.extend(executor.map(prepare_scope, sorted(scopes.items())))
            print(f"  {name}: {len(scopes)} alcances privados preparados")

        postgrest(base_url, api_key, access_token, "POST", "dashboard_files", file_rows)
        for start in range(0, len(scope_rows), 500):
            postgrest(base_url, api_key, access_token, "POST", "dashboard_scope_files", scope_rows[start:start + 500])
        published_at = datetime.now(timezone.utc).isoformat()
        query = f"dashboard_releases?id=eq.{urllib.parse.quote(release_id)}"
        postgrest(
            base_url,
            api_key,
            access_token,
            "PATCH",
            query,
            {"status": "published", "published_at": published_at, "manifest": manifest},
        )
    except Exception as exc:
        query = f"dashboard_releases?id=eq.{urllib.parse.quote(release_id)}"
        try:
            postgrest(
                base_url,
                api_key,
                access_token,
                "PATCH",
                query,
                {"status": "failed", "error_message": str(exc)[:1_000]},
            )
        except Exception:
            pass
        if publisher_session:
            try:
                control_session(base_url, api_key, access_token, "release")
            except Exception:
                pass
        raise

    cleanup_error: Exception | None = None
    try:
        cleanup = cleanup_release_history(
            base_url,
            api_key,
            access_token,
            keep=releases_to_keep,
        )
        print(
            "Historial optimizado: "
            f"{cleanup['releases_kept']} versiones conservadas, "
            f"{cleanup['releases_removed']} versiones y "
            f"{cleanup['objects_removed']} objetos antiguos eliminados."
        )
    except Exception as exc:
        cleanup_error = exc

    if publisher_session:
        try:
            control_session(base_url, api_key, access_token, "release")
        except Exception:
            pass
    if cleanup_error:
        raise PublishError(
            "La versión se publicó, pero la limpieza automática del historial falló: "
            f"{cleanup_error}"
        ) from cleanup_error
    print(f"Versión publicada correctamente: {version}")
    print(f"Datos lógicos: {total_bytes / 1024 / 1024:.2f} MB")
    print(f"Espacio comprimido de la versión: {stored_total_bytes / 1024 / 1024:.2f} MB")


def main() -> int:
    parser = argparse.ArgumentParser(description="Publica el dashboard privado en Supabase.")
    parser.add_argument(
        "--env",
        type=Path,
        default=ROOT / ".env.supabase.local",
        help="Archivo local que contiene las credenciales de publicación.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Solicita el usuario y la contraseña sin guardarlos en archivos.",
    )
    parser.add_argument(
        "--expected-project-ref",
        help="Verifica el proyecto Supabase antes de publicar.",
    )
    args = parser.parse_args()
    try:
        publish(
            args.env if args.env.is_absolute() else ROOT / args.env,
            interactive=args.interactive,
            expected_project_ref=args.expected_project_ref,
        )
        return 0
    except Exception as exc:
        print(f"ERROR DE PUBLICACIÓN: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
