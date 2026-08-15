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


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def call(method: str, url: str, key: str, payload: Any) -> Any:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
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
    load_env_file(ENV_FILE)
    base_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base_url or not service_key:
        print("ERROR: configura primero .env.supabase.local", file=sys.stderr)
        return 1

    email = input("Correo del usuario administrador: ").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        print("ERROR: correo inválido.", file=sys.stderr)
        return 1
    password = getpass.getpass("Contraseña nueva (mínimo 12 caracteres): ")
    confirmation = getpass.getpass("Repite la contraseña: ")
    if len(password) < 12 or password != confirmation:
        print("ERROR: las contraseñas no coinciden o tienen menos de 12 caracteres.", file=sys.stderr)
        return 1
    usuario = input(f"Usuario [{email.split('@', 1)[0]}]: ").strip() or email.split("@", 1)[0]
    cargo = input("Cargo [GENERAL]: ").strip() or "GENERAL"
    dispositivo = input("Dispositivo [xxxxxxx]: ").strip() or "xxxxxxx"

    user = call(
        "POST",
        f"{base_url}/auth/v1/admin/users",
        service_key,
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"display_name": usuario},
        },
    )
    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        print("ERROR: Supabase no devolvió el identificador del usuario.", file=sys.stderr)
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
            "role": "admin",
            "is_active": True,
        },
    )
    print(f"Usuario administrador creado y habilitado: {email}")
    print("La contraseña no fue guardada en archivos ni mostrada en consola.")
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
