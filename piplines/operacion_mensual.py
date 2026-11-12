from __future__ import annotations

"""Genera un lote mensual RMS sin conservar capas históricas locales.

Cada carpeta de ENTRADA/AAAAMM contiene la fotografía acumulada del mes. El
proceso usa un espacio temporal aislado y deja únicamente los Parquet del
período en SALIDA/AAAAMM para su carga manual por Asistente Comercial.
"""

import argparse
import hashlib
import html
import json
import os
import shutil
import subprocess
import sys
from calendar import monthrange
from datetime import date, datetime
from pathlib import Path

from project_paths import PROJECT_ROOT


ENTRADA = Path(os.getenv("DASHBOARD_ENTRADA_ROOT", str(PROJECT_ROOT / "Entrada"))).resolve()
SALIDA = Path(os.getenv("DASHBOARD_SALIDA_ROOT", str(PROJECT_ROOT / "Salida"))).resolve()
TEMPORAL = Path(os.getenv("DASHBOARD_TEMPORAL_ROOT", str(PROJECT_ROOT / ".operacion_temporal"))).resolve()
RESPALDOS = Path(os.getenv("DASHBOARD_RESPALDOS_ROOT", str(PROJECT_ROOT / ".operacion_respaldo"))).resolve()
DIARIOS = {
    "ventas": ("VENTA", "VENTAS.xlsx", "ventas_pipeline.py", "Fact_Ventas.parquet", "Ventas.parquet"),
    "ingresos": ("INGRESO", "INGRESO.xlsx", "ingreso_pipeline.py", "Fact_Ingresos.parquet", "Ingresos.parquet"),
    "transferencias": ("TRANSFERENCIA", "TRANSFERENCIAS.xlsx", "transferencia_pipeline.py", "Fact_Transferencias.parquet", "Transferencias.parquet"),
}
STOCK = ("STOCK", "STOCK.xlsx", "stock_pipeline.py", "Fact_Stock.parquet", "Stock.parquet")
DATE_COLUMNS = {
    "ventas": "FECHA Y HORA VENTA",
    "ingresos": "FECHA INGRESO",
    "transferencias": "FECHA",
}


def _texto_sql(column: str) -> str:
    return f'trim(CAST("{column.replace(chr(34), chr(34) * 2)}" AS VARCHAR))'


def filtro_pies_rms(source: str) -> str:
    """Reconoce solamente los pies conocidos de los tres reportes RMS.

    Los reportes exportados añaden al final una línea de total y otra de página.
    No se descartan fechas o registros desconocidos: esos deben llegar a la
    validación de corte y bloquear el lote para no ocultar un problema real.
    """
    date_text = _texto_sql(DATE_COLUMNS[source])
    footer_rules = [
        f"upper({date_text}) LIKE 'P%GINA%'",
        f"upper({date_text}) LIKE 'TOTAL%'",
    ]
    if source == "ventas":
        footer_rules.append(f"upper({_texto_sql('PROVEEDOR')}) LIKE 'NRO DE VENTA%'")
    elif source == "transferencias":
        footer_rules.append(f"upper({_texto_sql('SERIE Y NRO GUIA')}) LIKE 'TOTAL%'")
    return "NOT (" + " OR ".join(footer_rules) + ")"


def limpiar_pies_rms(raw_path: Path, destination: Path, source: str) -> dict[str, int]:
    """Publica un Parquet sin pies de reporte RMS reconocidos."""
    import duckdb

    source_sql = raw_path.resolve().as_posix().replace("'", "''")
    destination_sql = destination.resolve().as_posix().replace("'", "''")
    connection = duckdb.connect(database=":memory:")
    try:
        source_rows = connection.execute(
            f"SELECT COUNT(*) FROM read_parquet('{source_sql}')"
        ).fetchone()[0]
        connection.execute(
            f"""
            COPY (
              SELECT * FROM read_parquet('{source_sql}')
              WHERE {filtro_pies_rms(source)}
            ) TO '{destination_sql}'
            (FORMAT PARQUET, COMPRESSION SNAPPY)
            """
        )
        published_rows = connection.execute(
            f"SELECT COUNT(*) FROM read_parquet('{destination_sql}')"
        ).fetchone()[0]
    finally:
        connection.close()
    if not published_rows:
        raise ValueError(f"{raw_path.name} no contiene registros RMS luego de quitar los pies de reporte.")
    return {
        "sourceRows": source_rows,
        "publishedRows": published_rows,
        "discardedReportFooters": source_rows - published_rows,
    }


def parse_periodo(value: str) -> tuple[int, int]:
    if len(value) != 6 or not value.isdigit():
        raise ValueError("El período debe usar AAAAMM, por ejemplo 202611.")
    year, month = int(value[:4]), int(value[4:])
    if not 2000 <= year <= 2100 or not 1 <= month <= 12:
        raise ValueError("El período no es válido.")
    return year, month


def archivo_por_prefijo(folder: Path, prefijo: str) -> Path | None:
    """Devuelve el único Excel cuyo nombre comienza con el prefijo RMS."""
    matches = sorted(
        path for path in folder.iterdir()
        if path.is_file()
        and path.suffix.casefold() == ".xlsx"
        and path.name.casefold().startswith(prefijo.casefold())
    )
    if len(matches) > 1:
        names = ", ".join(path.name for path in matches)
        raise ValueError(f"Hay más de un archivo que inicia con {prefijo}: {names}")
    return matches[0] if matches else None


def descubrir_archivos(folder: Path) -> dict[str, Path]:
    """Valida y descubre los Excel permitidos en una carpeta mensual."""
    found: dict[str, Path] = {}
    missing: list[str] = []
    for key, (prefix, *_rest) in DIARIOS.items():
        source = archivo_por_prefijo(folder, prefix)
        if source is None:
            missing.append(f"{prefix}*.xlsx")
        else:
            found[key] = source
    if missing:
        raise FileNotFoundError("Faltan en ENTRADA: " + ", ".join(missing))
    stock = archivo_por_prefijo(folder, STOCK[0])
    if stock is not None:
        found["stock"] = stock
    return found


def validar_parquet(path: Path) -> dict[str, object]:
    if not path.is_file() or path.stat().st_size < 8:
        raise FileNotFoundError(f"No se generó un Parquet válido: {path.name}")
    with path.open("rb") as stream:
        if stream.read(4) != b"PAR1":
            raise RuntimeError(f"{path.name} no tiene cabecera Parquet.")
        stream.seek(-4, 2)
        if stream.read(4) != b"PAR1":
            raise RuntimeError(f"{path.name} no tiene cierre Parquet.")
    # Los lotes RMS pueden ser grandes: calcular el hash por bloques evita
    # duplicar el Parquet completo en memoria durante la validación.
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
    digest = checksum.hexdigest()
    return {"file": path.name, "bytes": path.stat().st_size, "sha256": digest}


def validar_corte_parquet(path: Path, source: str, cutoff: date) -> dict[str, object]:
    """Impide publicar un acumulado con fechas ajenas al período o posteriores."""
    import duckdb

    column = DATE_COLUMNS[source].replace('"', '""')
    first_day = cutoff.replace(day=1)
    connection = duckdb.connect(database=":memory:")
    try:
        query = f"""
          WITH source_rows AS (
            SELECT trim(CAST(\"{column}\" AS VARCHAR)) AS raw_date
            FROM read_parquet(?)
          ), parsed AS (
            SELECT raw_date,
              COALESCE(
                CASE WHEN try_cast(raw_date AS DOUBLE) BETWEEN 1 AND 100000
                  THEN DATE '1899-12-30' + CAST(floor(try_cast(raw_date AS DOUBLE)) AS INTEGER)
                END,
                CAST(try_strptime(raw_date, '%Y-%m-%d') AS DATE),
                CAST(try_strptime(raw_date, '%d/%m/%Y') AS DATE),
                CAST(try_strptime(raw_date, '%Y-%m-%d %H:%M:%S') AS DATE),
                CAST(try_strptime(raw_date, '%d/%m/%Y %H:%M:%S') AS DATE)
              ) AS row_date
            FROM source_rows
          )
          SELECT count(*) AS rows_total,
                 count(row_date) AS rows_with_date,
                 min(row_date) AS min_date,
                 max(row_date) AS max_date,
                 count(*) FILTER (WHERE row_date < ?) AS dates_before_period,
                 count(*) FILTER (WHERE row_date > ?) AS dates_after_cutoff,
                 count(*) FILTER (
                   WHERE row_date IS NULL AND raw_date <> ''
                     AND upper(raw_date) NOT LIKE 'P%GINA%'
                     AND upper(raw_date) NOT LIKE 'TOTAL%'
                     AND upper(raw_date) <> 'VARIOS'
                 ) AS invalid_dates
          FROM parsed
        """
        total, valid, minimum, maximum, before_period, after_cutoff, invalid = connection.execute(
            query, [str(path), first_day, cutoff]
        ).fetchone()
    finally:
        connection.close()
    if not valid:
        raise ValueError(f"{path.name} no contiene fechas válidas en {DATE_COLUMNS[source]}.")
    if invalid:
        raise ValueError(f"{path.name} contiene {invalid} fecha(s) no reconocida(s); corrige el Excel RMS.")
    if before_period or after_cutoff:
        details: list[str] = []
        if before_period:
            details.append(f"{before_period} antes del {first_day.isoformat()}")
        if after_cutoff:
            details.append(f"{after_cutoff} después del {cutoff.isoformat()}")
        raise ValueError(
            f"{path.name} no coincide con el corte {cutoff.isoformat()}: contiene {', '.join(details)} "
            f"(rango detectado {minimum} a {maximum}). Exporta RMS solo desde {first_day.isoformat()} "
            f"hasta {cutoff.isoformat()} y vuelve a procesar."
        )
    return {"rows": total, "validDates": valid, "minDate": minimum.isoformat(), "maxDate": maximum.isoformat()}


def generar_vista_previa(destination: Path, manifest: dict[str, object]) -> None:
    """Escribe una vista local sin sesión para revisar el lote antes de subirlo."""
    rows = []
    checks = manifest.get("validacionCorte", {})
    for source, file_info in manifest["archivos"].items():
        check = checks.get(source, {})
        row_count = check.get("rows")
        row_text = f"{row_count:,}" if isinstance(row_count, int) else "—"
        rows.append(
            "<tr>"
            f"<td>{html.escape(source.title())}</td><td>{html.escape(str(file_info['file']))}</td>"
            f"<td>{row_text}</td><td>{html.escape(str(check.get('minDate', '—')))}</td>"
            f"<td>{html.escape(str(check.get('maxDate', '—')))}</td>"
            "</tr>"
        )
    stock_text = "Cierre mensual · Stock incluido" if manifest["stockIncluido"] else "Actualización diaria · Sin Stock"
    page = f"""<!doctype html><html lang=es><meta charset=utf-8><title>Validación local {manifest['periodo']}</title>
    <style>body{{margin:0;background:#eef3fa;font-family:Segoe UI,Arial;color:#13233f}}header{{background:#0f377e;color:white;padding:28px max(5vw,28px)}}main{{max-width:980px;margin:30px auto;padding:0 22px}}.card{{background:white;border:1px solid #cbd8ee;border-radius:12px;padding:22px;margin-bottom:18px}}.kpis{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}}.k{{background:#f6f9ff;border-radius:9px;padding:15px}}small{{color:#64748b;font-weight:700}}strong{{font-size:22px;display:block;margin-top:5px}}table{{border-collapse:collapse;width:100%}}th,td{{text-align:left;padding:12px;border-bottom:1px solid #dbe5f3}}th{{font-size:12px;color:#42526b;text-transform:uppercase}}@media(max-width:650px){{.kpis{{grid-template-columns:1fr}}table{{font-size:12px}}}}</style>
    <header><small>Dashboard General · Validación local</small><h1 style='margin:6px 0'>Período {html.escape(manifest['periodo'])}</h1></header>
    <main><section class=card><div class=kpis><div class=k><small>FECHA DE CORTE</small><strong>{html.escape(manifest['fechaCorte'])}</strong></div><div class=k><small>ESTADO</small><strong>{html.escape(manifest['estado'])}</strong></div><div class=k><small>TIPO DE LOTE</small><strong style='font-size:16px'>{stock_text}</strong></div></div></section>
    <section class=card><h2>Fuentes validadas</h2><table><thead><tr><th>Fuente</th><th>Archivo</th><th>Filas</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section></main></html>"""
    (destination / "Vista_Previa.html").write_text(page, encoding="utf-8")


def crear_periodos(cantidad: int = 18, inicio: date | None = None) -> list[str]:
    referencia = inicio or date.today()
    year, month = referencia.year, referencia.month
    creados: list[str] = []
    for _ in range(cantidad):
        period = f"{year}{month:02d}"
        folder = ENTRADA / period
        folder.mkdir(parents=True, exist_ok=True)
        guide = folder / "LEEME.txt"
        if not guide.exists() or "VENTA*.xlsx" not in guide.read_text(encoding="utf-8", errors="replace"):
            guide.write_text(
                "Coloca aquí la fotografía acumulada del mes. Los Excel deben iniciar con:\n"
                "VENTA*.xlsx\nINGRESO*.xlsx\nTRANSFERENCIA*.xlsx\n"
                "STOCK*.xlsx solo al cierre mensual.\n",
                encoding="utf-8",
            )
        creados.append(period)
        month += 1
        if month == 13:
            year, month = year + 1, 1
    SALIDA.mkdir(parents=True, exist_ok=True)
    return creados


def ejecutar(script: str, workspace: Path, source: Path, cutoff: date, periodo: str) -> None:
    env = os.environ.copy()
    env.update({
        "DASHBOARD_DATA_ROOT": str(workspace),
        "DASHBOARD_INPUT_DIR": str(source),
        "DASHBOARD_FIXED_INPUT": "1",
        "DASHBOARD_STOCK_CUTOFF": cutoff.isoformat(),
        "DASHBOARD_INPUT_PERIOD": periodo,
    })
    command = [sys.executable, str(PROJECT_ROOT / "piplines" / script), "--solo-capa1"]
    if script == "stock_pipeline.py":
        command.extend(["--fecha-corte", cutoff.isoformat()])
    print("[PROCESAR]", script, flush=True)
    subprocess.run(command, cwd=PROJECT_ROOT, env=env, check=True)


def procesar(periodo: str, fecha_corte: str) -> Path:
    year, month = parse_periodo(periodo)
    cutoff = date.fromisoformat(fecha_corte)
    if (cutoff.year, cutoff.month) != (year, month):
        raise ValueError("La fecha de corte debe pertenecer al período seleccionado.")
    if cutoff > date.today():
        raise ValueError("La fecha de corte no puede estar en el futuro.")

    source = ENTRADA / periodo
    if not source.is_dir():
        raise FileNotFoundError(f"No existe la carpeta de entrada: {source}")
    sources = descubrir_archivos(source)
    stock = sources.get("stock")
    final_day = monthrange(year, month)[1]
    if stock is not None and cutoff.day != final_day:
        raise ValueError(f"STOCK.xlsx solo se admite el {year}-{month:02d}-{final_day:02d}.")
    if cutoff.day == final_day and stock is None:
        raise FileNotFoundError(
            f"Para cerrar {periodo} debes colocar STOCK.xlsx en ENTRADA\\{periodo}."
        )

    workspace = TEMPORAL / periodo
    stage = SALIDA / f".{periodo}.en_proceso"
    destination = SALIDA / periodo
    shutil.rmtree(workspace, ignore_errors=True)
    shutil.rmtree(stage, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)
    stage.mkdir(parents=True, exist_ok=True)

    try:
        runtime_input = workspace / "entrada"
        runtime_input.mkdir(parents=True, exist_ok=True)
        # El parser RMS mantiene nombres canónicos internamente, pero el
        # usuario puede conservar el sufijo original de su entrega.
        for key, (_prefix, fixed_name, _script, _raw, _output) in DIARIOS.items():
            shutil.copy2(sources[key], runtime_input / fixed_name)
        if stock is not None:
            shutil.copy2(stock, runtime_input / STOCK[1])

        for _, (_prefix, _fixed, script, _raw, _output) in DIARIOS.items():
            ejecutar(script, workspace, runtime_input, cutoff, periodo)
        if stock is not None:
            ejecutar(STOCK[2], workspace, runtime_input, cutoff, periodo)

        published: dict[str, dict[str, object]] = {}
        cutoff_checks: dict[str, dict[str, object]] = {}
        for source_name, (_, _, _, raw_name, output_name) in DIARIOS.items():
            raw = workspace / "capa1" / raw_name
            output = stage / output_name
            cleanup = limpiar_pies_rms(raw, output, source_name)
            published[source_name] = validar_parquet(output)
            cutoff_checks[source_name] = validar_corte_parquet(output, source_name, cutoff)
            cutoff_checks[source_name].update(cleanup)
        if stock is not None:
            raw = workspace / "capa1" / STOCK[3]
            output = stage / STOCK[4]
            shutil.copy2(raw, output)
            published["stock"] = validar_parquet(output)

        manifest = {
            "schema": "operacion-mensual-v1",
            "periodo": periodo,
            "fechaCorte": cutoff.isoformat(),
            "estado": "CERRADO" if stock is not None else "ABIERTO",
            "stockIncluido": stock is not None,
            "origen": {key: source.name for key, source in sources.items()},
            "procesadoEn": datetime.now().astimezone().isoformat(timespec="seconds"),
            "archivos": published,
            "validacionCorte": cutoff_checks,
        }
        (stage / "manifiesto.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        generar_vista_previa(stage, manifest)

        if destination.exists():
            backup = RESPALDOS / f"{periodo}_{datetime.now():%Y%m%d_%H%M%S}"
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(destination), str(backup))
        shutil.move(str(stage), str(destination))
        print(f"[LISTO] Salida preparada: {destination}")
        print(f"[ESTADO] {manifest['estado']} · corte {cutoff.isoformat()} · {len(published)} Parquet")
        return destination
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
        shutil.rmtree(stage, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inicializar", action="store_true")
    parser.add_argument("--periodo", help="AAAAMM")
    parser.add_argument("--fecha-corte", help="AAAA-MM-DD")
    parser.add_argument("--meses", type=int, default=18)
    args = parser.parse_args()
    try:
        if args.inicializar:
            if args.meses < 1 or args.meses > 60:
                raise ValueError("--meses debe estar entre 1 y 60.")
            created = crear_periodos(args.meses)
            print("[LISTO] Períodos de entrada: " + ", ".join(created))
            return 0
        if not args.periodo or not args.fecha_corte:
            raise ValueError("Usa --periodo AAAAMM y --fecha-corte AAAA-MM-DD.")
        procesar(args.periodo, args.fecha_corte)
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
