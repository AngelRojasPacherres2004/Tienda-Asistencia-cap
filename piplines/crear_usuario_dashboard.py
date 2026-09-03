"""Crea un usuario confirmado de Supabase Auth y lo habilita en dashboard_users."""

from __future__ import annotations

import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from runtime_config import finalizar_proceso


ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.supabase.local"
RUNTIME_CONFIG = ROOT / "dashboard-web" / "public" / "runtime-config.js"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def runtime_supabase_url() -> str:
    """Lee la URL pública esperada sin acceder a ninguna credencial."""

    if not RUNTIME_CONFIG.is_file():
        return ""
    match = re.search(r"=\s*({.*})\s*;?\s*$", RUNTIME_CONFIG.read_text(encoding="utf-8"), re.DOTALL)
    if not match:
        return ""
    try:
        return str(json.loads(match.group(1)).get("supabaseUrl", "")).strip().rstrip("/")
    except json.JSONDecodeError:
        return ""


def call(method: str, url: str, key: str, payload: Any | None = None) -> Any:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read(2_000).decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase respondió HTTP {exc.code}: {detail}") from exc


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Crea un acceso privado para el dashboard.")
    parser.add_argument(
        "--check-config",
        action="store_true",
        help="Valida la configuración local sin crear un usuario.",
    )
    args = parser.parse_args()

    load_env_file(ENV_FILE)
    base_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    missing = [
        name
        for name, value in {
            "SUPABASE_URL": base_url,
            "SUPABASE_SERVICE_ROLE_KEY": service_key,
        }.items()
        if not value or "REEMPLAZAR" in value or "TU_PROJECT_REF" in value
    ]
    if missing:
        print(
            "ERROR: faltan estas variables en .env.supabase.local: " + ", ".join(missing),
            file=sys.stderr,
        )
        print("Consulta CONFIGURAR_CREDENCIALES_SUPABASE.txt.", file=sys.stderr)
        return 1
    expected_url = runtime_supabase_url()
    if expected_url and base_url != expected_url:
        print(
            "ERROR: SUPABASE_URL no coincide con el proyecto configurado en la web publicada.",
            file=sys.stderr,
        )
        print("Actualiza .env.supabase.local con la URL del mismo proyecto antes de crear accesos.", file=sys.stderr)
        return 1
    if args.check_config:
        print("Configuración local de creación de usuarios: correcta.")
        return 0

    usuario = input("Usuario (sin correo): ").strip()
    username_key = usuario.casefold()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,48}", username_key):
        print("ERROR: el usuario debe tener entre 3 y 49 caracteres: letras, números, punto, guion o guion bajo.", file=sys.stderr)
        return 1
    password = getpass.getpass("Contraseña nueva (mínimo 12 caracteres): ")
    confirmation = getpass.getpass("Repite la contraseña: ")
    if len(password) < 12 or password != confirmation:
        print("ERROR: las contraseñas no coinciden o tienen menos de 12 caracteres.", file=sys.stderr)
        return 1
    cargo = input("Cargo [GENERAL]: ").strip() or "GENERAL"
    dispositivo = input("Dispositivo [xxxxxxx]: ").strip() or "xxxxxxx"
    role = (input("Rol [viewer]: ").strip().lower() or "viewer")
    if role not in {"viewer", "manager", "admin"}:
        print("ERROR: el rol debe ser viewer, manager o admin.", file=sys.stderr)
        return 1
    publisher_username = os.environ.get("SUPABASE_PUBLISHER_USERNAME", "Sistemas").strip().casefold()
    is_publisher = input("¿Es la cuenta publicadora del dashboard? [N]: ").strip().lower() in {"s", "si", "sí", "y", "yes"}
    if is_publisher:
        if username_key != publisher_username:
            print(f"ERROR: el publicador debe usar el usuario {publisher_username}.", file=sys.stderr)
            return 1
        role = "admin"

    # Supabase Auth requiere una identidad interna; no es un correo de la
    # persona ni se muestra en la UI. El inicio de sesión siempre usa usuario.
    email = f"{username_key}@users.dashboard.local"

    user = call(
        "POST",
        f"{base_url}/auth/v1/admin/users",
        service_key,
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"display_name": usuario},
            # Solo el administrador local puede establecer app_metadata.
            # El publicador se reconoce por esta marca firmada en su JWT.
            "app_metadata": {"purpose": "dashboard_publisher"} if is_publisher else {},
        },
    )
    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        print("ERROR: Supabase no devolvió el identificador del usuario.", file=sys.stderr)
        return 1

    role_rows = call(
        "GET",
        f"{base_url}/rest/v1/dashboard_roles?select=id&code=eq.{role}&limit=1",
        service_key,
    )
    role_id = role_rows[0].get("id") if isinstance(role_rows, list) and role_rows else None
    if not role_id:
        print("ERROR: el catálogo de roles aún no está aplicado en Supabase.", file=sys.stderr)
        return 1

    call(
        "POST",
        f"{base_url}/rest/v1/dashboard_users?on_conflict=user_id",
        service_key,
        {
            "user_id": user_id,
            "display_name": usuario,
            "usuario": usuario,
            "cargo": cargo,
            "dispositivo": dispositivo,
            # Compatibilidad con el esquema anterior, mientras role_id es la fuente de verdad.
            "role": "admin" if role == "admin" else "viewer",
            "role_id": role_id,
            "is_active": True,
        },
    )
    print(f"Usuario creado y habilitado en dashboard_users: {usuario} ({role})")
    if is_publisher:
        print("Cuenta publicadora configurada para 6_ACTUALIZAR_DASHBOARD_WEB.bat.")
    print("La contraseña no fue guardada en archivos ni mostrada en consola.")
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
