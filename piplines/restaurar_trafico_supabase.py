from __future__ import annotations

"""Restaura totales diarios de tráfico histórico en Supabase de forma segura.

La fuente conserva un conteo diario por tienda. ``trafico_tienda`` requiere
franjas horarias, por lo que estas se distribuyen de forma determinística y
quedan explícitamente marcadas como restauración histórica. Nunca reemplaza
un día existente, para no sobrescribir registros manuales.
"""

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import duckdb

from project_paths import PROJECT_ROOT


DEFAULT_SOURCE = PROJECT_ROOT / ".etl_work" / "salida_anterior" / "capa2" / "FactTraficoClientes.parquet"
HOURS = tuple(range(9, 23))
WEIGHTS = (.45, .55, .76, .95, 1.07, .94, .88, 1.03, 1.27, 1.78, 2.12, 2.35, 1.86, .36)
MARKER = "[Restauración histórica tráfico]"


def read_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise RuntimeError(f"Falta la configuración privada: {path}")
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if not values.get("SUPABASE_URL") or not values.get("SUPABASE_SECRET_KEY"):
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.")
    return values


def rest(url: str, key: str, path: str, *, method: str = "GET", payload: object | None = None,
         headers: dict[str, str] | None = None) -> object:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/{path}", data=body, method=method,
        headers={
            "apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json",
            **({"Content-Type": "application/json"} if body is not None else {}),
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase rechazó {method} {path}: {error.code} {detail}") from error


def allocate(total: int, store_id: int, day: str) -> list[int]:
    if total < 0:
        raise ValueError("El tráfico diario no puede ser negativo.")
    weighted = [base * (1 + (((store_id * 13 + int(day[-2:]) * 7 + index * 11) % 9) - 4) / 100)
                for index, base in enumerate(WEIGHTS)]
    divisor = sum(weighted)
    exact = [total * value / divisor for value in weighted]
    values = [int(value) for value in exact]
    pending = total - sum(values)
    # Igual que la asignación usada por el dashboard: ante la misma fracción,
    # prioriza la primera franja horaria para que sea reproducible.
    order = sorted(range(len(exact)), key=lambda index: (-(exact[index] - values[index]), index))
    for index in order[:pending]:
        values[index] += 1
    return values


def source_days(source: Path, start: str, end: str) -> list[dict[str, object]]:
    if not source.is_file():
        raise FileNotFoundError(f"No existe la fuente histórica: {source}")
    connection = duckdb.connect(database=":memory:")
    try:
        path_sql = source.resolve().as_posix().replace("'", "''")
        rows = connection.execute(
            f"""
            SELECT CAST(fecha AS VARCHAR) AS fecha, tienda_id, SUM(CAST(cantidad_personas AS BIGINT)) AS total
            FROM read_parquet('{path_sql}')
            WHERE fecha BETWEEN ? AND ?
              AND COALESCE(es_dato_valido, FALSE)
              AND cantidad_personas IS NOT NULL
            GROUP BY fecha, tienda_id
            ORDER BY fecha, tienda_id
            """, [start, end]
        ).fetchall()
    finally:
        connection.close()
    if not rows:
        raise RuntimeError("La fuente no contiene tráfico válido para el intervalo solicitado.")
    return [{"date": str(day), "dashboardStoreId": str(store), "total": int(total)}
            for day, store, total in rows]


def existing_days(url: str, key: str, start: str, end: str) -> dict[tuple[int, str], list[dict[str, object]]]:
    query = urllib.parse.urlencode({
        "select": "tienda_id,fecha,cantidad,observaciones",
        "and": f"(fecha.gte.{start},fecha.lte.{end})",
    })
    path = f"trafico_tienda?{query}"
    # PostgREST limita las respuestas. Paginar hace que una segunda ejecución
    # vea todas las franjas restauradas y no pueda duplicarlas.
    rows: list[dict[str, object]] = []
    offset = 0
    while True:
        page = rest(url, key, f"{path}&limit=1000&offset={offset}") or []
        rows.extend(page)
        if len(page) < 1000:
            break
        offset += len(page)
    grouped: dict[tuple[int, str], list[dict[str, object]]] = {}
    for row in rows:
        grouped.setdefault((int(row["tienda_id"]), str(row["fecha"])), []).append(row)
    return grouped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--from", dest="start", default="2026-01-01")
    parser.add_argument("--to", dest="end", default="2026-02-28")
    parser.add_argument("--apply", action="store_true", help="Escribe filas nuevas después de validar todo.")
    args = parser.parse_args()
    try:
        start, end = date.fromisoformat(args.start).isoformat(), date.fromisoformat(args.end).isoformat()
    except ValueError as error:
        raise SystemExit(f"ERROR: fechas inválidas: {error}")
    if start > end:
        raise SystemExit("ERROR: --from no puede ser posterior a --to.")

    env = read_env(PROJECT_ROOT / ".env")
    rows = source_days(args.source, start, end)
    maps = rest(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"],
                "commercial_store_map?select=dashboard_store_id,tienda_id") or []
    physical_store = {str(row["dashboard_store_id"]): int(row["tienda_id"])
                      for row in maps if row.get("tienda_id") is not None}
    missing = sorted({row["dashboardStoreId"] for row in rows if row["dashboardStoreId"] not in physical_store})
    if missing:
        raise SystemExit("ERROR: faltan mapeos de tiendas para: " + ", ".join(missing))
    users = rest(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"],
                 "usuarios?select=id&rol=eq.sistemas&estado=eq.activo&order=id.asc&limit=1") or []
    if not users:
        raise SystemExit("ERROR: no existe un usuario activo del rol Sistemas para auditar la restauración.")
    imported_by = int(users[0]["id"])
    existing = existing_days(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"], start, end)

    missing_days: list[dict[str, object]] = []
    protected: list[str] = []
    unchanged = 0
    for row in rows:
        store_id = physical_store[row["dashboardStoreId"]]
        key = (store_id, row["date"])
        previous = existing.get(key, [])
        if not previous:
            missing_days.append({**row, "storeId": store_id})
            continue
        if all(str(item.get("observaciones") or "").startswith(MARKER) for item in previous):
            actual = sum(int(item["cantidad"]) for item in previous)
            if actual == row["total"]:
                unchanged += 1
                continue
        protected.append(f"{row['dashboardStoreId']} {row['date']}")
    if protected:
        raise SystemExit("ERROR: se encontraron días existentes que no son la misma restauración: "
                         + ", ".join(protected[:12]) + ("..." if len(protected) > 12 else ""))

    payload: list[dict[str, object]] = []
    for row in missing_days:
        values = allocate(int(row["total"]), int(row["storeId"]), str(row["date"]))
        if sum(values) != row["total"]:
            raise RuntimeError(f"La distribución no cuadra para {row['dashboardStoreId']} {row['date']}.")
        payload.extend({
            "tienda_id": row["storeId"], "fecha": row["date"], "hora": f"{hour:02d}:00:00",
            "rango_hora": f"{hour:02d}:00-{hour + 1:02d}:00", "cantidad": quantity,
            "observaciones": f"{MARKER} total diario {row['total']}; distribución horaria estimada desde FactTraficoClientes.",
            "registrado_por": imported_by,
        } for hour, quantity in zip(HOURS, values))
    summary = {
        "mode": "apply" if args.apply else "dry-run", "source": str(args.source), "from": start, "to": end,
        "sourceDays": len(rows), "sourceVisits": sum(int(row["total"]) for row in rows),
        "missingDays": len(missing_days), "alreadyRestoredDays": unchanged,
        "hourlyRowsToInsert": len(payload), "protectedDays": len(protected),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.apply or not payload:
        return 0
    for offset in range(0, len(payload), 300):
        rest(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"],
             "trafico_tienda?on_conflict=tienda_id,fecha,rango_hora", method="POST",
             payload=payload[offset:offset + 300],
             headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    print(json.dumps({"insertedHourlyRows": len(payload), "restoredDailyRows": len(missing_days)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
