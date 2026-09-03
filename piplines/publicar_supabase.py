"""Publica los JSON del dashboard como una versión atómica en Supabase.

Las credenciales limitadas de publicación se leen únicamente desde variables
de entorno o desde ``.env.supabase.local``. Nunca se copian al frontend ni se
imprimen en consola.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from runtime_config import finalizar_proceso


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dashboard-web" / "public" / "assets" / "data"
REQUIRED_FILES = (
    "dashboard.json",
    "dashboard-daily.json",
    "dashboard-sellers.json",
    "dashboard-brand.json",
    "dashboard-predictive.json",
    "dashboard-price-range.json",
    "dashboard-stock-origin.json",
    "dashboard-stock-products.json",
    "dashboard-subline.json",
)
# La carga estándar de Storage es más estable por debajo de 6 MB.
CHUNK_BYTES = 5 * 1024 * 1024
RUNTIME_CONFIG = ROOT / "dashboard-web" / "public" / "runtime-config.js"
class PublishError(RuntimeError):
    pass


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
) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    with source_path.open("rb") as source:
        part_number = 0
        while chunk := source.read(CHUNK_BYTES):
            part_number += 1
            object_path = f"{version}/{source_path.name}/part-{part_number:04d}"
            encoded_path = urllib.parse.quote(object_path, safe="/")
            headers = api_headers(api_key, access_token, content_type="application/octet-stream")
            headers["x-upsert"] = "true"
            headers["cache-control"] = "31536000"
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
                }
            )
            print(f"  {source_path.name}: parte {part_number} publicada")
    return parts


def publish(env_path: Path, *, interactive: bool = False) -> None:
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
            publisher_username = input("Usuario publicador [Sistemas]: ").strip() or "Sistemas"
        if interactive and not publisher_password:
            publisher_password = getpass.getpass("Contraseña: ")
        if not api_key or not publisher_username or not publisher_password:
            raise PublishError(
                "Faltan las credenciales limitadas de publicación."
            )
        access_token = sign_in(base_url, api_key, publisher_username, publisher_password)
        if jwt_app_purpose(access_token) != "dashboard_publisher":
            raise PublishError(
                "La cuenta ingresada no es el publicador dedicado. Usa el usuario Sistemas."
            )
        control_session(base_url, api_key, access_token, "claim")
        publisher_session = True

    missing = [name for name in REQUIRED_FILES if not (DATA_DIR / name).is_file()]
    if missing:
        raise PublishError(f"Faltan archivos del dashboard: {', '.join(missing)}")

    metadata = parse_metadata()
    checksums = {name: sha256_file(DATA_DIR / name) for name in REQUIRED_FILES}
    total_bytes = sum((DATA_DIR / name).stat().st_size for name in REQUIRED_FILES)
    combined = hashlib.sha256(
        "".join(f"{name}:{checksums[name]}" for name in REQUIRED_FILES).encode("utf-8")
    ).hexdigest()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    version = f"{timestamp}-{combined[:12]}"

    # Reutiliza las partes inmutables de la última versión cuando el checksum
    # coincide. Así una corrección pequeña no vuelve a subir cientos de MB.
    reusable: dict[str, dict[str, Any]] = {}
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
    except Exception:
        reusable = {}

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
        manifest: dict[str, Any] = {}
        for name in REQUIRED_FILES:
            path = DATA_DIR / name
            previous = reusable.get(name)
            unchanged = bool(
                previous
                and previous.get("checksum_sha256") == checksums[name]
                and int(previous.get("byte_size") or 0) == path.stat().st_size
                and previous.get("parts")
            )
            if unchanged:
                parts = previous["parts"]
                print(f"  {name}: sin cambios, partes reutilizadas")
            else:
                parts = upload_file_parts(base_url, api_key, access_token, version, path)
            file_rows.append(
                {
                    "release_id": release_id,
                    "logical_name": name,
                    "byte_size": path.stat().st_size,
                    "checksum_sha256": checksums[name],
                    "content_type": "application/json",
                    "parts": parts,
                }
            )
            manifest[name] = {"bytes": path.stat().st_size, "parts": len(parts), "reused": unchanged}

        postgrest(base_url, api_key, access_token, "POST", "dashboard_files", file_rows)
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

    if publisher_session:
        try:
            control_session(base_url, api_key, access_token, "release")
        except Exception:
            pass
    print(f"Versión publicada correctamente: {version}")
    print(f"Datos enviados: {total_bytes / 1024 / 1024:.2f} MB")


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
    args = parser.parse_args()
    try:
        publish(
            args.env if args.env.is_absolute() else ROOT / args.env,
            interactive=args.interactive,
        )
        return 0
    except Exception as exc:
        print(f"ERROR DE PUBLICACIÓN: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
