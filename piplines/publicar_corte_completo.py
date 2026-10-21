from __future__ import annotations

"""Publica el modelo validado y los reportes del mismo corte en bd-app."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

from corte_comercial_automatico import COBERTURA, DATOS_WEB, validar
from project_paths import PROJECT_ROOT


EXPECTED_URL = "https://xtnihjzqnxozbotymoma.supabase.co"
MODEL_FACTS = (
    "FactVentas.parquet", "FactIngresos.parquet", "FactTransferencias.parquet",
    "FactTraficoClientes.parquet", "FactStock.parquet",
)


def app_environment(app_root: Path) -> dict[str, str]:
    env_path = app_root / ".env"
    if not env_path.is_file():
        raise RuntimeError(f"Falta la conexión privada de Asiste: {env_path}")
    values = {}
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SUPABASE_URL", "").rstrip("/") != EXPECTED_URL:
        raise RuntimeError("La conexión apunta a otro proyecto; se detiene la publicación.")
    if not values.get("SUPABASE_SECRET_KEY"):
        raise RuntimeError("Falta SUPABASE_SECRET_KEY en la configuración privada de Asiste.")
    return values


def rest_json(url: str, key: str) -> object:
    request = urllib.request.Request(url, headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def published_release(key: str) -> dict:
    query = urllib.parse.urlencode({
        "select": "id,version,status,sales_cutoff,stock_cutoff,generated_at",
        "status": "eq.published", "order": "published_at.desc", "limit": "1",
    })
    releases = rest_json(f"{EXPECTED_URL}/rest/v1/dashboard_releases?{query}", key)
    return releases[0] if releases else {}


def run(command: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    print("Ejecutando:", Path(command[0]).name, Path(command[1]).name, flush=True)
    result = subprocess.run(command, cwd=cwd, env=env, check=False)
    if result.returncode:
        raise RuntimeError(f"Falló {Path(command[1]).name} (código {result.returncode}).")


def manifest_fresh(path: Path, cutoff: str, stock: str, *, monthly: bool = False) -> bool:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        expected = {"ventas": cutoff, "ingresos": cutoff,
                    "transferencias": cutoff, "trafico": cutoff, "stock": stock}
        newest_source = max((PROJECT_ROOT / "capa2" / name).stat().st_mtime for name in MODEL_FACTS)
        return (manifest.get("cutoffs") == expected
                and (not monthly or manifest.get("schemaVersion") == 3)
                and (monthly or all(
                    {"codigo_nissei", "lote"}.issubset(manifest.get("detailColumns", {}).get(kind, []))
                    for kind in ("ventas", "stock", "ingresos", "transferencias")))
                and path.stat().st_mtime >= newest_source)
    except (OSError, ValueError, KeyError):
        return False


def same_instant(first: str | None, second: str | None) -> bool:
    if not first or not second:
        return False
    try:
        return (datetime.fromisoformat(first.replace("Z", "+00:00")).astimezone(timezone.utc)
                == datetime.fromisoformat(second.replace("Z", "+00:00")).astimezone(timezone.utc))
    except ValueError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-root", type=Path, default=PROJECT_ROOT / "Tienda-Asistencia-cap")
    args = parser.parse_args()
    app_root = args.app_root.resolve()
    values = app_environment(app_root)
    if not COBERTURA.is_file():
        raise RuntimeError("Falta Capa 2; ejecuta primero 2_ACTUALIZAR_DATOS.bat.")
    newest_model = max((PROJECT_ROOT / "capa2" / name).stat().st_mtime for name in MODEL_FACTS)
    if not DATOS_WEB.is_file() or DATOS_WEB.stat().st_mtime < max(newest_model, COBERTURA.stat().st_mtime):
        run([sys.executable, str(PROJECT_ROOT / "piplines" / "generar_datos_web.py")],
            cwd=PROJECT_ROOT)
    cutoff = json.loads(COBERTURA.read_text(encoding="utf-8"))["selectedCutoff"]
    validar(date.fromisoformat(cutoff))
    metadata = json.loads(DATOS_WEB.read_text(encoding="utf-8"))["metadata"]
    stock = metadata["stockCutoff"]

    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js no está instalado; hace falta para los reportes privados.")
    if not (app_root / "node_modules" / "@supabase" / "supabase-js").exists():
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            raise RuntimeError("Falta npm para preparar los reportes de Asiste.")
        run([npm, "ci"], cwd=app_root)

    environment = os.environ.copy()
    environment.update({
        "SUPABASE_URL": values["SUPABASE_URL"],
        "SUPABASE_SERVICE_ROLE_KEY": values["SUPABASE_SECRET_KEY"],
        "SUPABASE_SECRET_KEY": values["SUPABASE_SECRET_KEY"],
        "DASHBOARD_RELEASES_TO_KEEP": "2",
        "PYTHONUNBUFFERED": "1",
    })
    previous = published_release(values["SUPABASE_SECRET_KEY"])
    if (same_instant(previous.get("generated_at"), metadata["generatedAt"])
        and previous.get("sales_cutoff") == cutoff
        and previous.get("stock_cutoff") == stock):
        print(f"Dashboard ya publicado: {previous['version']}")
    else:
        run([sys.executable, str(PROJECT_ROOT / "piplines" / "publicar_supabase.py"),
             "--env", str(PROJECT_ROOT / ".etl_work" / "no-env-file")],
            cwd=PROJECT_ROOT, env=environment)
    release = published_release(values["SUPABASE_SECRET_KEY"])
    if release.get("sales_cutoff") != cutoff or release.get("stock_cutoff") != stock:
        raise RuntimeError("La publicación no quedó con los cortes esperados.")
    print(f"Dashboard activo: {release['version']}")

    annual = PROJECT_ROOT / ".etl_work" / f"annual-reports-{cutoff}-v3"
    monthly = PROJECT_ROOT / ".etl_work" / f"annual-reports-monthly-{cutoff}-v3"
    years = ",".join(str(year) for year in range(2024, date.fromisoformat(cutoff).year + 1))
    if not manifest_fresh(annual / "manifest.json", cutoff, stock):
        run([sys.executable, str(app_root / "scripts" / "generate-annual-reports.py"),
             "--source-root", str(PROJECT_ROOT), "--output", str(annual),
             "--years", years, "--sales-cutoff", cutoff, "--stock-cutoff", stock],
            cwd=app_root, env=environment)
    if not manifest_fresh(monthly / "manifest.json", cutoff, stock, monthly=True):
        run([sys.executable, str(app_root / "scripts" / "partition-annual-reports.py"),
             "--source", str(annual), "--output", str(monthly), "--schema-version", "3"],
            cwd=app_root, env=environment)
    run([node, str(app_root / "scripts" / "publish-annual-reports.mjs"),
         f"--directory={monthly}", "--apply"], cwd=app_root, env=environment)
    print(f"Corte {cutoff} y reportes {years} publicados en bd-app.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR DE PUBLICACIÓN: {exc}", file=sys.stderr)
        raise SystemExit(1)
