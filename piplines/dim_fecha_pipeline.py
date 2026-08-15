from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso

try:
    import duckdb
except ImportError as exc:
    raise SystemExit("Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt") from exc

from maestros import (
    ANIO_FIN_MODELO,
    ANIO_INICIO_MODELO,
    FECHA_INICIO_MODELO,
    sql_literal,
)

from project_paths import PROJECT_ROOT, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA2_DIR = BASE_DIR / "capa2"
SALIDA = CAPA2_DIR / "DimFecha.parquet"
TEMP = WORK_TEMP_DIR / "DimFecha_temporal.parquet"


def consulta(anio_inicio: int, anio_fin: int) -> str:
    inicio = date(anio_inicio, 1, 1).isoformat()
    fin = date(anio_fin, 12, 31).isoformat()
    return f"""
    WITH fechas AS (
        SELECT CAST(valor AS DATE) AS fecha
        FROM generate_series(DATE {sql_literal(inicio)}, DATE {sql_literal(fin)}, INTERVAL '1 day') t(valor)
    )
    SELECT
        CAST(strftime(fecha, '%Y%m%d') AS INTEGER) AS fecha_id,
        CAST(strftime(fecha, '%Y%m') AS INTEGER) AS periodo_id,
        fecha,
        EXTRACT(YEAR FROM fecha)::INTEGER AS anio,
        EXTRACT(MONTH FROM fecha)::INTEGER AS mes_numero,
        CASE EXTRACT(MONTH FROM fecha)::INTEGER
            WHEN 1 THEN 'ENERO' WHEN 2 THEN 'FEBRERO' WHEN 3 THEN 'MARZO'
            WHEN 4 THEN 'ABRIL' WHEN 5 THEN 'MAYO' WHEN 6 THEN 'JUNIO'
            WHEN 7 THEN 'JULIO' WHEN 8 THEN 'AGOSTO' WHEN 9 THEN 'SEPTIEMBRE'
            WHEN 10 THEN 'OCTUBRE' WHEN 11 THEN 'NOVIEMBRE' WHEN 12 THEN 'DICIEMBRE'
        END AS mes_nombre,
        EXTRACT(QUARTER FROM fecha)::INTEGER AS trimestre,
        'T' || EXTRACT(QUARTER FROM fecha)::INTEGER AS trimestre_nombre,
        EXTRACT(WEEK FROM fecha)::INTEGER AS semana,
        EXTRACT(ISODOW FROM fecha)::INTEGER AS dia_semana_numero,
        CASE EXTRACT(ISODOW FROM fecha)::INTEGER
            WHEN 1 THEN 'LUNES' WHEN 2 THEN 'MARTES' WHEN 3 THEN 'MIÉRCOLES'
            WHEN 4 THEN 'JUEVES' WHEN 5 THEN 'VIERNES' WHEN 6 THEN 'SÁBADO'
            WHEN 7 THEN 'DOMINGO'
        END AS dia_semana_nombre,
        EXTRACT(DAY FROM fecha)::INTEGER AS dia_mes,
        EXTRACT(DOY FROM fecha)::INTEGER AS dia_anio,
        (EXTRACT(ISODOW FROM fecha)::INTEGER IN (6,7)) AS es_fin_semana,
        date_trunc('month', fecha)::DATE AS fecha_inicio_mes,
        (date_trunc('month', fecha) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS fecha_fin_mes,
        strftime(fecha, '%Y-%m') AS anio_mes,
        EXTRACT(YEAR FROM fecha)::INTEGER * 100 + EXTRACT(MONTH FROM fecha)::INTEGER AS orden_anio_mes
    FROM fechas
    ORDER BY fecha
    """


def _verificar_archivo(
    archivo: Path,
    anio_inicio: int | None = None,
    anio_fin: int | None = None,
    permitir_anterior_modelo: bool = False,
) -> dict[str, object]:
    if not archivo.exists() or archivo.stat().st_size == 0:
        raise FileNotFoundError(f"No existe un Parquet válido en {archivo}")
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    try:
        filas, ids, inicio, fin, anteriores = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT fecha_id), MIN(fecha), MAX(fecha), "
            f"COUNT(*) FILTER (WHERE fecha < DATE {sql_literal(FECHA_INICIO_MODELO)}) "
            f"FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchone()
        if not filas or filas != ids:
            raise RuntimeError("DimFecha tiene claves duplicadas o está vacía.")
        if anteriores and not permitir_anterior_modelo:
            raise RuntimeError(
                f"DimFecha contiene {int(anteriores):,} fechas anteriores a {FECHA_INICIO_MODELO}."
            )
        if anio_inicio is not None and inicio != date(anio_inicio, 1, 1):
            raise RuntimeError(
                f"DimFecha inicia en {inicio}; se esperaba {date(anio_inicio, 1, 1)}."
            )
        if anio_fin is not None and fin != date(anio_fin, 12, 31):
            raise RuntimeError(
                f"DimFecha termina en {fin}; se esperaba {date(anio_fin, 12, 31)}."
            )
        if anio_inicio is not None and anio_fin is not None:
            esperadas = (date(anio_fin, 12, 31) - date(anio_inicio, 1, 1)).days + 1
            if int(filas) != esperadas:
                raise RuntimeError(
                    f"DimFecha tiene {int(filas):,} filas; se esperaban {esperadas:,}."
                )
        return {"filas": int(filas), "inicio": inicio, "fin": fin}
    finally:
        cerrar_duckdb_seguro(con)


def crear(
    anio_inicio: int,
    anio_fin: int,
    salida: Path = SALIDA,
    permitir_anterior_modelo: bool = False,
) -> None:
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)
    if anio_inicio < ANIO_INICIO_MODELO and not permitir_anterior_modelo:
        raise ValueError(
            f"anio_inicio no puede ser menor que {ANIO_INICIO_MODELO}; recibido: {anio_inicio}"
        )
    if anio_inicio > anio_fin:
        raise ValueError("anio_inicio no puede ser mayor que anio_fin")

    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    temporal = WORK_TEMP_DIR / f"{salida.stem}_temporal.parquet"
    temporal.unlink(missing_ok=True)
    try:
        con.execute(
            f"COPY ({consulta(anio_inicio, anio_fin)}) TO {sql_literal(temporal.as_posix())} "
            "(FORMAT PARQUET, COMPRESSION SNAPPY)"
        )
        filas, ids, inicio, fin, anteriores = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT fecha_id), MIN(fecha), MAX(fecha), "
            f"COUNT(*) FILTER (WHERE fecha < DATE {sql_literal(FECHA_INICIO_MODELO)}) "
            f"FROM read_parquet({sql_literal(temporal.as_posix())})"
        ).fetchone()
        esperadas = (date(anio_fin, 12, 31) - date(anio_inicio, 1, 1)).days + 1
        anteriores_invalidos = bool(anteriores) and not permitir_anterior_modelo
        if not filas or filas != ids or int(filas) != esperadas or anteriores_invalidos:
            raise RuntimeError(
                "DimFecha temporal no pasó la validación: "
                f"filas={filas}, ids={ids}, esperadas={esperadas}, "
                f"anteriores={anteriores}, permitir_anterior_modelo={permitir_anterior_modelo}."
            )
        if inicio != date(anio_inicio, 1, 1) or fin != date(anio_fin, 12, 31):
            raise RuntimeError(
                f"Rango temporal incorrecto: {inicio} a {fin}; "
                f"esperado {date(anio_inicio, 1, 1)} a {date(anio_fin, 12, 31)}."
            )
    except Exception:
        temporal.unlink(missing_ok=True)
        raise
    finally:
        cerrar_duckdb_seguro(con)

    os.replace(temporal, salida)
    print("\nDIM_FECHA VERIFICADA")
    print(f"Filas   : {esperadas:,}")
    print(f"Rango   : {date(anio_inicio, 1, 1)} a {date(anio_fin, 12, 31)}")
    print(f"Archivo : {salida}")


def verificar(
    archivo: Path = SALIDA,
    permitir_anterior_modelo: bool = False,
) -> None:
    resumen = _verificar_archivo(
        archivo,
        permitir_anterior_modelo=permitir_anterior_modelo,
    )
    print("\nDIM_FECHA VERIFICADA")
    print(f"Filas   : {resumen['filas']:,}")
    print(f"Rango   : {resumen['inicio']} a {resumen['fin']}")
    print(f"Archivo : {archivo}")

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--anio-inicio", type=int, default=ANIO_INICIO_MODELO)
    parser.add_argument("--anio-fin", type=int, default=ANIO_FIN_MODELO)
    parser.add_argument("--verificar-capa2", action="store_true")
    parser.add_argument(
        "--salida",
        default=SALIDA.name,
        help="Nombre del parquet de salida dentro de capa2.",
    )
    parser.add_argument(
        "--permitir-anterior-modelo",
        action="store_true",
        help="Permite iniciar antes de 2024 para dimensiones de rol históricas.",
    )
    args = parser.parse_args()
    try:
        salida = CAPA2_DIR / Path(args.salida).name
        if args.verificar_capa2:
            verificar(
                salida,
                permitir_anterior_modelo=args.permitir_anterior_modelo,
            )
        else:
            crear(
                args.anio_inicio,
                args.anio_fin,
                salida=salida,
                permitir_anterior_modelo=args.permitir_anterior_modelo,
            )
        return 0
    except Exception as exc:
        print("\nERROR EN DIM_FECHA", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
