from __future__ import annotations

"""Transformaciones finales para generar archivos listos para Power BI.

Los parsers RMS originales se conservan como módulos base. Este módulo toma sus
Parquet limpios, aplica una única homologación maestra y publica las claves de
relación comunes: fecha_id, periodo_id, tienda_id, producto_id y jerarquías.
"""

import os
import time
from datetime import date
from pathlib import Path
from typing import Iterable

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta DuckDB. Ejecuta: python -m pip install -r requirements.txt"
    ) from exc

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro

from maestros import (
    ANIO_INICIO_MODELO,
    sql_clasificacion_id,
    sql_codigo,
    sql_fecha_id,
    sql_hash_id,
    sql_linea,
    sql_linea_id,
    sql_limpiar_texto,
    sql_literal,
    sql_marca,
    sql_marca_id,
    sql_periodo_id,
    sql_producto_id,
    sql_proveedor,
    sql_proveedor_id,
    sql_rubro,
    sql_rubro_codigo,
    sql_rubro_desde_departamento,
    sql_rubro_id,
    sql_sublinea,
    sql_sublinea_id,
    sql_tienda,
    sql_tienda_id,
)

from project_paths import PROJECT_ROOT, WORK_INTERMEDIATE_DIR, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"


def sql_estado_stock_tres(expresion: str) -> str:
    """Homologa cualquier ESTADO de stock a BUENO, MERMA o DESMEDRO.

    Regla de negocio 2026-08: MERMA se conserva como pérdida explícita; los
    estados recuperados/reparados/vendibles se consideran BUENO; cualquier
    condición de deterioro, falla, suciedad, incompletitud, servicio técnico,
    remate o estado no reconocible se clasifica conservadoramente como DESMEDRO.
    Vacíos y 0 se tratan como BUENO porque el RMS los usa como ausencia de defecto.
    """
    limpio = sql_limpiar_texto(expresion, "BUENO")
    clave = (
        "trim(regexp_replace("
        f"upper(COALESCE(CAST(({limpio}) AS VARCHAR), 'BUENO')), "
        "'[^A-Z0-9]+', ' ', 'g'))"
    )
    return f"""
    CASE
        WHEN {clave} LIKE '%MERMA%' THEN 'MERMA'
        WHEN {clave} IN (
            'BUENO','OK','NUEVO','VENDIBLE','RECUPERADO','REPARADO',
            'P REPARADA','PANTALLA REPARADA','0'
        ) THEN 'BUENO'
        ELSE 'DESMEDRO'
    END
    """


def preparar() -> None:
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def conectar() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def columnas_parquet(con: duckdb.DuckDBPyConnection, archivo: Path) -> list[str]:
    if not archivo.exists():
        raise FileNotFoundError(f"No existe: {archivo}")
    return [
        fila[0]
        for fila in con.execute(
            f"DESCRIBE SELECT * FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchall()
    ]


def exigir_columnas(
    con: duckdb.DuckDBPyConnection,
    archivo: Path,
    requeridas: Iterable[str],
) -> None:
    columnas = columnas_parquet(con, archivo)
    faltan = [c for c in requeridas if c not in columnas]
    if faltan:
        raise RuntimeError(
            f"{archivo.name} no contiene columnas necesarias: {faltan}. "
            f"Encontradas: {columnas}"
        )


def copiar_atomico(
    con: duckdb.DuckDBPyConnection,
    consulta: str,
    salida: Path,
) -> None:
    preparar()
    temporal = WORK_TEMP_DIR / (salida.stem + "_temporal.parquet")
    temporal.unlink(missing_ok=True)
    con.execute(
        f"""
        COPY ({consulta})
        TO {sql_literal(temporal.as_posix())}
        (FORMAT PARQUET, COMPRESSION {os.getenv("PARQUET_COMPRESSION", "SNAPPY").upper()}, ROW_GROUP_SIZE 122880)
        """
    )
    if not temporal.exists() or temporal.stat().st_size == 0:
        raise RuntimeError(f"No se generó un Parquet válido: {temporal}")
    os.replace(temporal, salida)


def _normalizaciones_producto(
    rubro_expr: str,
    linea_expr: str,
    sublinea_expr: str,
    proveedor_expr: str,
    marca_expr: str,
    departamento_expr: str | None = None,
) -> dict[str, str]:
    rubro_pre = sql_rubro(rubro_expr)
    rubro = (
        sql_rubro_desde_departamento(departamento_expr, rubro_pre)
        if departamento_expr
        else rubro_pre
    )
    linea = sql_linea(linea_expr)
    sublinea = sql_sublinea(sublinea_expr)
    proveedor = sql_proveedor(proveedor_expr)
    marca = sql_marca(marca_expr)
    return {
        "rubro": rubro,
        "linea": linea,
        "sub_linea": sublinea,
        "proveedor": proveedor,
        "marca": marca,
    }


def expresion_linaje(columnas: Iterable[str]) -> str:
    disponibles = set(columnas)
    partes = [
        f"COALESCE(CAST({nombre} AS VARCHAR), '')"
        for nombre in ("archivo_origen", "hoja_origen", "fila_origen")
        if nombre in disponibles
    ]
    return " || '|' || ".join(partes) if partes else "''"



def _id_md5(prefijo: str, expr: str, longitud: int) -> str:
    """ID determinista rápido para valores ya homologados en la Capa 2 base."""
    return (
        f"{sql_literal(prefijo)} || upper(substr(sha256(COALESCE(CAST({expr} AS VARCHAR), '')), "
        f"1, {longitud}))"
    )


def _tienda_id_rapido(expr: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_literal(nombre)} THEN {sql_literal(tienda_id)}"
        for nombre, tienda_id in __import__('maestros').TIENDA_IDS.items()
    )
    clave = f"upper(trim(CAST({expr} AS VARCHAR)))"
    return (
        f"CASE WHEN {expr} IS NULL OR trim(CAST({expr} AS VARCHAR)) = '' THEN NULL "
        f"ELSE CASE {expr}\n{casos}\n"
        f"ELSE 'T_' || upper(substr(sha256({clave}), 1, 12)) END END"
    )


def _producto_id_rapido(expr: str) -> str:
    limpio = f"NULLIF(trim(CAST({expr} AS VARCHAR)), '')"
    return f"CASE WHEN {limpio} IS NULL THEN NULL ELSE {_id_md5('P_', limpio, 16)} END"


def _rubro_id_rapido(expr: str) -> str:
    return sql_rubro_id(expr)


def _linea_id_rapido(rubro: str, linea: str) -> str:
    return _id_md5('L_', f"upper(COALESCE({rubro}, '')) || '|' || upper(COALESCE({linea}, ''))", 12)


def _sublinea_id_rapido(rubro: str, linea: str, sublinea: str) -> str:
    return _id_md5('SL_', f"upper(COALESCE({rubro}, '')) || '|' || upper(COALESCE({linea}, '')) || '|' || upper(COALESCE({sublinea}, ''))", 12)


def _clasificacion_id_rapido(rubro: str, linea: str, sublinea: str) -> str:
    return _id_md5('CP_', f"upper(COALESCE({rubro}, '')) || '|' || upper(COALESCE({linea}, '')) || '|' || upper(COALESCE({sublinea}, ''))", 16)


def _texto_id_rapido(prefijo: str, expr: str, longitud: int = 12) -> str:
    return _id_md5(prefijo, f"upper(trim(COALESCE(CAST({expr} AS VARCHAR), '')))", longitud)


def transformar_ventas() -> Path:
    """Publica FactVentas evitando repetir homologaciones sobre millones de filas.

    La limpieza base ya entrega texto homologado. Las claves que todavía exigen
    reglas maestras se calculan una sola vez por valor o combinación distinta y
    luego se incorporan mediante joins pequeños.
    """
    entrada = WORK_INTERMEDIATE_DIR / "FactVentasLimpio.parquet"
    salida = CAPA2_DIR / "FactVentas.parquet"
    con = conectar()
    inicio = time.perf_counter()
    try:
        exigir_columnas(
            con,
            entrada,
            [
                "fecha_hora_venta", "fecha_venta", "nro_venta", "tienda",
                "codigo_nissei", "proveedor", "rubro", "linea", "sub_linea",
                "marca", "cantidad", "precio_real", "total_venta",
            ],
        )
        ruta = sql_literal(entrada.as_posix())
        venta_id_expr = sql_hash_id(
            "V_",
            "COALESCE(CAST(b.fecha_hora_venta AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.nro_venta AS VARCHAR),'') || '|' || "
             "COALESCE(t.tienda_id,'') || '|' || COALESCE(p.producto_id,'') || '|' || "
             "COALESCE(CAST(b.nro_documento AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.cantidad AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.total_venta AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.lote AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.talla AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.precio_sugerido AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.precio_real AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.tipo_documento AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.estado AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.vendedor_codigo AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.moneda AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.tipo_movimiento AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.cliente AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.temporada AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.vendedor_nombre AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.modelo AS VARCHAR),'') || '|' || "
             "COALESCE(CAST(b.descripcion AS VARCHAR),'')",
            18,
        )
        consulta = f"""
        WITH origen AS MATERIALIZED (
            SELECT * FROM read_parquet({ruta})
            WHERE tienda IS NOT NULL AND codigo_nissei IS NOT NULL
        ), tiendas_distintas AS MATERIALIZED (
            SELECT
                tienda,
                {sql_tienda_id('tienda')} AS tienda_id
            FROM (SELECT DISTINCT tienda FROM origen)
        ), productos_distintos AS MATERIALIZED (
            SELECT
                codigo_nissei, proveedor, rubro, linea, sub_linea, marca,
                {sql_producto_id('codigo_nissei')} AS producto_id,
                {sql_clasificacion_id('rubro', 'linea', 'sub_linea')} AS clasificacion_producto_id,
                {sql_proveedor_id('proveedor')} AS proveedor_id,
                {sql_rubro_id('rubro')} AS rubro_id,
                {sql_rubro_codigo('rubro')} AS rubro_codigo,
                {sql_linea_id('rubro', 'linea')} AS linea_id,
                {sql_sublinea_id('rubro', 'linea', 'sub_linea')} AS sub_linea_id,
                {sql_marca_id('marca')} AS marca_id
            FROM (
                SELECT DISTINCT codigo_nissei, proveedor, rubro, linea, sub_linea, marca
                FROM origen
            )
        )
        SELECT
            {venta_id_expr} AS venta_linea_id,
            {sql_fecha_id('b.fecha_venta')} AS fecha_id,
            {sql_periodo_id('b.fecha_venta')} AS periodo_id,
            t.tienda_id,
            p.producto_id,
            p.clasificacion_producto_id,
            p.proveedor_id,
            p.rubro_id,
            p.rubro_codigo,
            p.linea_id,
            p.sub_linea_id,
            p.marca_id,
            b.fecha_hora_venta, b.fecha_venta, b.hora_venta, b.dia_venta,
            b.mes_numero_venta, b.mes_nombre_venta, b.trimestre_venta, b.anio_venta,
            b.semana_venta, b.dia_semana_numero, b.dia_semana_nombre,
            b.nro_venta, b.tienda, b.codigo_nissei, b.proveedor, b.lote, b.rubro,
            b.linea, b.sub_linea, b.marca, b.modelo, b.descripcion, b.cliente, b.temporada,
            b.cantidad, b.precio_sugerido, b.precio_real, b.total_venta,
            b.tipo_documento, b.estado, b.nro_documento, b.talla,
            b.mes_lote, b.mes_lote_numero, b.anio_lote,
            b.vendedor_codigo, b.moneda, b.vendedor_nombre, b.tipo_movimiento
        FROM origen b
        INNER JOIN tiendas_distintas t ON b.tienda IS NOT DISTINCT FROM t.tienda
        INNER JOIN productos_distintos p
          ON b.codigo_nissei IS NOT DISTINCT FROM p.codigo_nissei
         AND b.proveedor IS NOT DISTINCT FROM p.proveedor
         AND b.rubro IS NOT DISTINCT FROM p.rubro
         AND b.linea IS NOT DISTINCT FROM p.linea
         AND b.sub_linea IS NOT DISTINCT FROM p.sub_linea
         AND b.marca IS NOT DISTINCT FROM p.marca
        """
        print(
            "Agregando claves a FactVentas con diccionarios de valores distintos...",
            flush=True,
        )
        copiar_atomico(con, consulta, salida)
        print(
            f"FactVentas publicada en {(time.perf_counter()-inicio)/60:.2f} minutos. "
            "Ejecutando validación rápida...",
            flush=True,
        )
        validar_claves(
            salida,
            ["venta_linea_id", "fecha_id", "tienda_id", "producto_id"],
            validar_unicidad=False,
            conexion=con,
        )
        return salida
    finally:
        cerrar_duckdb_seguro(con)

def transformar_ingresos() -> Path:
    """Publica FactIngresos sin volver a homologar cada fila.

    FactIngresosLimpio ya contiene los textos limpios y homologados. Las claves
    de tienda y producto se calculan una sola vez por valor/combinación distinta
    y se incorporan mediante joins pequeños. Se conservan exactamente las mismas
    reglas de limpieza de la pipeline base.
    """
    entrada = WORK_INTERMEDIATE_DIR / "FactIngresosLimpio.parquet"
    salida = CAPA2_DIR / "FactIngresos.parquet"
    con = conectar()
    inicio = time.perf_counter()
    try:
        exigir_columnas(
            con,
            entrada,
            [
                "fecha_hora_ingreso", "fecha_ingreso", "tienda", "codigo_nissei",
                "proveedor", "departamento_codigo", "rubro", "linea", "sub_linea",
                "marca", "cantidad_recibida", "total_ingreso",
            ],
        )
        ruta = sql_literal(entrada.as_posix())
        ingreso_id_expr = sql_hash_id(
            "I_",
            "COALESCE(CAST(b.fecha_hora_ingreso AS VARCHAR),'') || '|' || "
            "COALESCE(t.tienda_id,'') || '|' || COALESCE(p.producto_id,'') || '|' || "
            "COALESCE(CAST(b.lote AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.modelo_codigo AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.cantidad_recibida AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.total_ingreso AS VARCHAR),'')",
            18,
        )
        consulta = f"""
        WITH origen AS MATERIALIZED (
            SELECT *
            FROM read_parquet({ruta})
            WHERE tienda IS NOT NULL AND codigo_nissei IS NOT NULL
        ), tiendas_distintas AS MATERIALIZED (
            SELECT tienda, {sql_tienda_id('tienda')} AS tienda_id
            FROM (SELECT DISTINCT tienda FROM origen)
        ), productos_distintos AS MATERIALIZED (
            SELECT
                codigo_nissei, proveedor, rubro, linea, sub_linea, marca,
                {sql_producto_id('codigo_nissei')} AS producto_id,
                {sql_clasificacion_id('rubro', 'linea', 'sub_linea')} AS clasificacion_producto_id,
                {sql_proveedor_id('proveedor')} AS proveedor_id,
                {sql_rubro_id('rubro')} AS rubro_id,
                {sql_rubro_codigo('rubro')} AS rubro_codigo,
                {sql_linea_id('rubro', 'linea')} AS linea_id,
                {sql_sublinea_id('rubro', 'linea', 'sub_linea')} AS sub_linea_id,
                {sql_marca_id('marca')} AS marca_id
            FROM (
                SELECT DISTINCT codigo_nissei, proveedor, rubro, linea, sub_linea, marca
                FROM origen
            )
        )
        SELECT
            {ingreso_id_expr} AS ingreso_linea_id,
            {sql_fecha_id('b.fecha_ingreso')} AS fecha_id,
            {sql_periodo_id('b.fecha_ingreso')} AS periodo_id,
            t.tienda_id,
            p.producto_id,
            p.clasificacion_producto_id,
            p.proveedor_id,
            p.rubro_id,
            p.rubro_codigo,
            p.linea_id,
            p.sub_linea_id,
            p.marca_id,
            b.fecha_hora_ingreso, b.fecha_ingreso, b.hora_ingreso, b.dia_ingreso,
            b.mes_numero_ingreso, b.mes_nombre_ingreso, b.trimestre_ingreso,
            b.anio_ingreso, b.semana_ingreso, b.dia_semana_numero, b.dia_semana_nombre,
            b.tienda, b.codigo_nissei, b.proveedor, b.lote, b.departamento_codigo,
            b.rubro, b.linea, b.sub_linea, b.marca, b.modelo, b.descripcion,
            b.modelo_codigo, b.cantidad_recibida, b.precio_sugerido, b.total_ingreso,
            b.estado_producto, b.mes_lote, b.mes_lote_numero, b.anio_lote,
            b.personal, b.tipo_movimiento_ingreso
        FROM origen b
        INNER JOIN tiendas_distintas t
          ON b.tienda IS NOT DISTINCT FROM t.tienda
        INNER JOIN productos_distintos p
          ON b.codigo_nissei IS NOT DISTINCT FROM p.codigo_nissei
         AND b.proveedor IS NOT DISTINCT FROM p.proveedor
         AND b.rubro IS NOT DISTINCT FROM p.rubro
         AND b.linea IS NOT DISTINCT FROM p.linea
         AND b.sub_linea IS NOT DISTINCT FROM p.sub_linea
         AND b.marca IS NOT DISTINCT FROM p.marca
        """
        print("Agregando claves a FactIngresos con diccionarios distintos...", flush=True)
        copiar_atomico(con, consulta, salida)
        print(
            f"FactIngresos publicada en {(time.perf_counter()-inicio)/60:.2f} minutos. "
            "Ejecutando validación rápida...",
            flush=True,
        )
        validar_claves(
            salida,
            ["ingreso_linea_id", "fecha_id", "tienda_id", "producto_id"],
            validar_unicidad=False,
            conexion=con,
        )
        return salida
    finally:
        cerrar_duckdb_seguro(con)


def transformar_transferencias() -> Path:
    """Publica FactTransferencias usando diccionarios de valores distintos."""
    entrada = WORK_INTERMEDIATE_DIR / "FactTransferenciasLimpio.parquet"
    salida = CAPA2_DIR / "FactTransferencias.parquet"
    con = conectar()
    inicio = time.perf_counter()
    try:
        exigir_columnas(
            con,
            entrada,
            [
                "fecha_hora_transferencia", "fecha_transferencia", "nro_guia",
                "tienda_origen", "tienda_destino", "codigo_nissei", "proveedor",
                "departamento_codigo", "rubro", "linea", "sub_linea", "marca",
                "cantidad", "total_transferencia",
            ],
        )
        ruta = sql_literal(entrada.as_posix())
        transferencia_id_expr = sql_hash_id(
            "TR_",
            "COALESCE(CAST(b.fecha_hora_transferencia AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.nro_guia AS VARCHAR),'') || '|' || "
            "COALESCE(ot.tienda_id,'') || '|' || "
            "COALESCE(dt.tienda_id,'') || '|' || "
            "COALESCE(p.producto_id,'') || '|' || "
            "COALESCE(CAST(b.lote AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.cantidad AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(b.fecha_hora_creacion AS VARCHAR),'')",
            18,
        )
        consulta = f"""
        WITH origen AS MATERIALIZED (
            SELECT *
            FROM read_parquet({ruta})
            WHERE tienda_origen IS NOT NULL
              AND tienda_destino IS NOT NULL
              AND codigo_nissei IS NOT NULL
        ), tiendas_distintas AS MATERIALIZED (
            SELECT tienda, {sql_tienda_id('tienda')} AS tienda_id
            FROM (
                SELECT DISTINCT tienda_origen AS tienda FROM origen
                UNION
                SELECT DISTINCT tienda_destino AS tienda FROM origen
            )
        ), productos_distintos AS MATERIALIZED (
            SELECT
                codigo_nissei, proveedor, rubro, linea, sub_linea, marca,
                {sql_producto_id('codigo_nissei')} AS producto_id,
                {sql_clasificacion_id('rubro', 'linea', 'sub_linea')} AS clasificacion_producto_id,
                {sql_proveedor_id('proveedor')} AS proveedor_id,
                {sql_rubro_id('rubro')} AS rubro_id,
                {sql_rubro_codigo('rubro')} AS rubro_codigo,
                {sql_linea_id('rubro', 'linea')} AS linea_id,
                {sql_sublinea_id('rubro', 'linea', 'sub_linea')} AS sub_linea_id,
                {sql_marca_id('marca')} AS marca_id
            FROM (
                SELECT DISTINCT codigo_nissei, proveedor, rubro, linea, sub_linea, marca
                FROM origen
            )
        )
        SELECT
            {transferencia_id_expr} AS transferencia_linea_id,
            {sql_fecha_id('b.fecha_transferencia')} AS fecha_id,
            {sql_periodo_id('b.fecha_transferencia')} AS periodo_id,
            ot.tienda_id AS tienda_origen_id,
            dt.tienda_id AS tienda_destino_id,
            p.producto_id,
            p.clasificacion_producto_id,
            p.proveedor_id,
            p.rubro_id,
            p.rubro_codigo,
            p.linea_id,
            p.sub_linea_id,
            p.marca_id,
            b.fecha_hora_transferencia, b.fecha_transferencia, b.hora_transferencia,
            b.dia_transferencia, b.mes_numero_transferencia, b.mes_nombre_transferencia,
            b.trimestre_transferencia, b.anio_transferencia, b.semana_transferencia,
            b.dia_semana_numero, b.dia_semana_nombre, b.estado_transferencia, b.nro_guia,
            b.tienda_origen, b.tienda_destino, b.codigo_nissei, b.proveedor, b.lote,
            b.departamento_codigo, b.rubro, b.linea, b.sub_linea, b.marca, b.modelo,
            b.descripcion, b.modelo_codigo, b.cantidad, b.precio_sugerido,
            b.total_transferencia, b.fecha_hora_creacion, b.fecha_creacion
        FROM origen b
        INNER JOIN tiendas_distintas ot
          ON b.tienda_origen IS NOT DISTINCT FROM ot.tienda
        INNER JOIN tiendas_distintas dt
          ON b.tienda_destino IS NOT DISTINCT FROM dt.tienda
        INNER JOIN productos_distintos p
          ON b.codigo_nissei IS NOT DISTINCT FROM p.codigo_nissei
         AND b.proveedor IS NOT DISTINCT FROM p.proveedor
         AND b.rubro IS NOT DISTINCT FROM p.rubro
         AND b.linea IS NOT DISTINCT FROM p.linea
         AND b.sub_linea IS NOT DISTINCT FROM p.sub_linea
         AND b.marca IS NOT DISTINCT FROM p.marca
        """
        print("Agregando claves a FactTransferencias con diccionarios distintos...", flush=True)
        copiar_atomico(con, consulta, salida)
        print(
            f"FactTransferencias publicada en {(time.perf_counter()-inicio)/60:.2f} minutos. "
            "Ejecutando validación rápida...",
            flush=True,
        )
        validar_claves(
            salida,
            [
                "transferencia_linea_id", "fecha_id", "tienda_origen_id",
                "tienda_destino_id", "producto_id",
            ],
            validar_unicidad=False,
            conexion=con,
        )
        return salida
    finally:
        cerrar_duckdb_seguro(con)


def transformar_guias(fecha_corte: date) -> Path:
    entrada = WORK_INTERMEDIATE_DIR / "FactGuiasTransitoLimpio.parquet"
    salida = CAPA2_DIR / "FactGuiasTransito.parquet"
    con = conectar()
    try:
        exigir_columnas(
            con,
            entrada,
            [
                "fecha_transferencia", "nro_guia", "tienda_origen", "tienda_destino",
                "codigo_nissei", "proveedor", "departamento_codigo", "rubro",
                "linea", "sub_linea", "marca", "cantidad", "estado_transferencia",
            ],
        )
        ruta = sql_literal(entrada.as_posix())
        n = _normalizaciones_producto(
            "rubro", "linea", "sub_linea", "proveedor", "marca", "departamento_codigo"
        )
        tienda_o = sql_tienda("tienda_origen")
        tienda_d = sql_tienda("tienda_destino")
        codigo = sql_codigo("codigo_nissei")
        fecha_sql = f"DATE {sql_literal(fecha_corte.isoformat())}"
        consulta = f"""
        WITH base AS (
            SELECT *,
                {fecha_sql} AS fecha_corte,
                {tienda_o} AS tienda_origen_norm,
                {tienda_d} AS tienda_destino_norm,
                {codigo} AS codigo_norm,
                {n['proveedor']} AS proveedor_norm,
                {n['rubro']} AS rubro_norm,
                {n['linea']} AS linea_norm,
                {n['sub_linea']} AS sub_linea_norm,
                {n['marca']} AS marca_norm
            FROM read_parquet({ruta})
            WHERE fecha_transferencia >= make_date({ANIO_INICIO_MODELO}, 1, 1)
        ), claves AS (
            SELECT *,
                {sql_tienda_id('tienda_origen_norm')} AS tienda_origen_id_calc,
                {sql_tienda_id('tienda_destino_norm')} AS tienda_destino_id_calc,
                {sql_producto_id('codigo_norm')} AS producto_id_calc,
                {sql_clasificacion_id('rubro_norm', 'linea_norm', 'sub_linea_norm')}
                    AS clasificacion_id_calc
            FROM base
        )
        SELECT
            {sql_hash_id('GT_', "strftime(fecha_corte, '%Y%m%d') || '|' || COALESCE(CAST(fecha_hora_transferencia AS VARCHAR),'') || '|' || COALESCE(nro_guia,'') || '|' || COALESCE(tienda_origen_id_calc,'') || '|' || COALESCE(tienda_destino_id_calc,'') || '|' || COALESCE(producto_id_calc,'') || '|' || COALESCE(lote,'') || '|' || COALESCE(modelo_codigo,'') || '|' || COALESCE(CAST(cantidad AS VARCHAR),'') || '|' || COALESCE(CAST(precio_sugerido AS VARCHAR),'')", 18)}
                AS guia_transito_id,
            {sql_fecha_id('fecha_corte')} AS fecha_corte_id,
            {sql_periodo_id('fecha_corte')} AS periodo_corte_id,
            fecha_corte,
            {sql_fecha_id('fecha_transferencia')} AS fecha_transferencia_id,
            {sql_periodo_id('fecha_transferencia')} AS periodo_transferencia_id,
            tienda_origen_id_calc AS tienda_origen_id,
            tienda_destino_id_calc AS tienda_destino_id,
            producto_id_calc AS producto_id,
            clasificacion_id_calc AS clasificacion_producto_id,
            {sql_proveedor_id('proveedor_norm')} AS proveedor_id,
            {sql_rubro_id('rubro_norm')} AS rubro_id,
            {sql_rubro_codigo('rubro_norm')} AS rubro_codigo,
            {sql_linea_id('rubro_norm', 'linea_norm')} AS linea_id,
            {sql_sublinea_id('rubro_norm', 'linea_norm', 'sub_linea_norm')} AS sub_linea_id,
            {sql_marca_id('marca_norm')} AS marca_id,
            fecha_hora_transferencia, fecha_transferencia,
            date_diff('day', fecha_transferencia, fecha_corte) AS dias_en_transito,
            estado_transferencia, nro_guia,
            tienda_origen_norm AS tienda_origen,
            tienda_destino_norm AS tienda_destino,
            codigo_norm AS codigo_nissei, proveedor_norm AS proveedor, lote,
            departamento_codigo, rubro_norm AS rubro, linea_norm AS linea,
            sub_linea_norm AS sub_linea, marca_norm AS marca, modelo,
            descripcion, modelo_codigo, cantidad AS cantidad_pendiente,
            precio_sugerido, total_transferencia,
            fecha_hora_creacion, fecha_creacion
        FROM claves
        WHERE tienda_origen_id_calc IS NOT NULL
          AND tienda_destino_id_calc IS NOT NULL
        """
        copiar_atomico(con, consulta, salida)
        validar_claves(
            salida,
            [
                "guia_transito_id", "fecha_corte_id", "tienda_origen_id",
                "tienda_destino_id", "producto_id",
            ],
            permitir_nulos={"producto_id"},
            conexion=con,
        )
        return salida
    finally:
        cerrar_duckdb_seguro(con)


def transformar_merma() -> Path:
    archivo = CAPA2_DIR / "FactMerma.parquet"
    con = conectar()
    try:
        exigir_columnas(con, archivo, ["merma_id", "fecha_id", "tienda_id", "tienda", "codigo_nissei"])
        ruta = sql_literal(archivo.as_posix())
        tienda = sql_tienda("tienda")
        codigo = sql_codigo("codigo_nissei")
        consulta = f"""
        WITH b AS (
            SELECT *, {tienda} AS tienda_norm, {codigo} AS codigo_norm
            FROM read_parquet({ruta})
        )
        SELECT
            merma_id, fecha_id, periodo_id,
            {sql_tienda_id('tienda_norm')} AS tienda_id,
            {sql_producto_id('codigo_norm')} AS producto_id,
            fecha_analisis, fecha_periodo, fecha_ocurrencia, es_fecha_exacta,
            anio, mes_numero, mes_nombre, trimestre, semana,
            dia_semana_numero, dia_semana_nombre,
            tienda_norm AS tienda, area, tipo_merma, detalle_ocurrencia,
            codigo_norm AS codigo_nissei, descripcion, cantidad,
            precio_unitario, total_merma, moneda, es_valorizada
        FROM b
        WHERE {sql_tienda_id('tienda_norm')} IS NOT NULL
        """
        copiar_atomico(con, consulta, archivo)
        validar_claves(
            archivo, ["merma_id", "fecha_id", "tienda_id"],
            permitir_nulos={"producto_id"}, conexion=con
        )
        return archivo
    finally:
        cerrar_duckdb_seguro(con)


def transformar_personal() -> Path:
    archivo = CAPA2_DIR / "FactPersonalTienda.parquet"
    con = conectar()
    try:
        exigir_columnas(
            con,
            archivo,
            ["fecha_id", "periodo_id", "fecha_periodo", "fecha_corte", "tienda", "cargo", "area_asignada"],
        )
        ruta = sql_literal(archivo.as_posix())
        tienda = sql_tienda("tienda")
        consulta = f"""
        WITH b AS (
            SELECT *, {tienda} AS tienda_norm
            FROM read_parquet({ruta})
        )
        SELECT
            {sql_hash_id('PT_', "COALESCE(CAST(periodo_id AS VARCHAR),'') || '|' || COALESCE(" + sql_tienda_id('tienda_norm') + ",'') || '|' || COALESCE(cargo,'') || '|' || COALESCE(area_asignada,'')", 18)}
                AS personal_tienda_id,
            fecha_id, periodo_id, fecha_periodo, fecha_inicio_periodo, fecha_corte,
            anio, mes_numero, mes_nombre, trimestre, semana,
            dia_semana_numero, dia_semana_nombre,
            {sql_tienda_id('tienda_norm')} AS tienda_id,
            tienda_norm AS tienda, cargo, area_asignada, tipo_area,
            cantidad_personal
        FROM b
        WHERE {sql_tienda_id('tienda_norm')} IS NOT NULL
        """
        copiar_atomico(con, consulta, archivo)
        validar_claves(
            archivo, ["personal_tienda_id", "fecha_id", "tienda_id"], conexion=con
        )
        return archivo
    finally:
        cerrar_duckdb_seguro(con)


def transformar_trafico() -> Path:
    archivo = CAPA2_DIR / "FactTraficoClientes.parquet"
    con = conectar()
    try:
        exigir_columnas(con, archivo, ["fecha_id", "fecha", "tienda", "cantidad_personas"])
        ruta = sql_literal(archivo.as_posix())
        tienda = sql_tienda("tienda")
        consulta = f"""
        WITH b AS (
            SELECT *, {tienda} AS tienda_norm
            FROM read_parquet({ruta})
        )
        SELECT
            CAST(strftime(fecha, '%Y%m%d') || '_' || {sql_tienda_id('tienda_norm')} AS VARCHAR)
                AS trafico_id,
            fecha_id, periodo_id, fecha, anio, mes_numero, mes_nombre,
            trimestre, semana, dia_semana_numero, dia_semana_nombre,
            {sql_tienda_id('tienda_norm')} AS tienda_id,
            tienda_norm AS tienda, cantidad_personas, estado_registro,
            es_dato_valido, tipo_conteo, fuente_conteo, unidad_medida
        FROM b
        WHERE {sql_tienda_id('tienda_norm')} IS NOT NULL
        """
        copiar_atomico(con, consulta, archivo)
        validar_claves(
            archivo, ["trafico_id", "fecha_id", "tienda_id"], conexion=con
        )
        return archivo
    finally:
        cerrar_duckdb_seguro(con)


def transformar_tiendas() -> Path:
    """Homologa la dimensión y conserva tiendas históricas y futuras."""
    archivo = CAPA2_DIR / "DimTiendas.parquet"
    con = conectar()
    try:
        exigir_columnas(con, archivo, ["tienda_id", "tienda", "estado_operativo"])
        ruta = sql_literal(archivo.as_posix())
        consulta = f"""
        WITH fuente AS (
            SELECT
                {sql_tienda_id(sql_tienda('tienda'))} AS tienda_id,
                {sql_tienda('tienda')} AS tienda,
                tipo_ubicacion, formato_tienda, cluster, es_tienda,
                metraje_m2, departamento, provincia, distrito, direccion,
                fecha_apertura, fecha_cierre, estado_operativo, es_vigente
            FROM read_parquet({ruta})
        ), deduplicado AS (
            SELECT *, ROW_NUMBER() OVER (
                PARTITION BY tienda_id ORDER BY tienda
            ) AS rn
            FROM fuente
            WHERE tienda_id IS NOT NULL
        )
        SELECT * EXCLUDE (rn)
        FROM deduplicado
        WHERE rn = 1
        ORDER BY tienda_id
        """
        copiar_atomico(con, consulta, archivo)
        validar_dimension(archivo, "tienda_id", conexion=con)
        return archivo
    finally:
        cerrar_duckdb_seguro(con)


def _mes_numero_sql(expr: str) -> str:
    from maestros import MESES_EQUIVALENCIAS, clave_texto
    casos = "\n".join(
        f"WHEN {sql_literal(clave_texto(nombre))} THEN {numero}"
        for nombre, (numero, _) in MESES_EQUIVALENCIAS.items()
    )
    from maestros import sql_clave
    return f"CASE {sql_clave(expr)}\n{casos}\nELSE NULL\nEND"


def _mes_nombre_sql(numero_expr: str) -> str:
    return f"""CASE {numero_expr}
        WHEN 1 THEN 'ENERO' WHEN 2 THEN 'FEBRERO' WHEN 3 THEN 'MARZO'
        WHEN 4 THEN 'ABRIL' WHEN 5 THEN 'MAYO' WHEN 6 THEN 'JUNIO'
        WHEN 7 THEN 'JULIO' WHEN 8 THEN 'AGOSTO' WHEN 9 THEN 'SEPTIEMBRE'
        WHEN 10 THEN 'OCTUBRE' WHEN 11 THEN 'NOVIEMBRE' WHEN 12 THEN 'DICIEMBRE'
        ELSE NULL END"""


def transformar_stock(fecha_corte: date) -> Path:
    """Publica FactStock mediante etapas materializadas y validación atómica.

    Las reglas de homologación son las mismas que en el resto del modelo, pero
    se calculan sobre valores distintos y se materializan en tablas temporales.
    Esto evita que DuckDB construya un único árbol SQL muy profundo, causa del
    ``STATUS_STACK_OVERFLOW`` observado en Windows/Python 3.14.
    """

    entrada = CAPA1_DIR / "Fact_Stock.parquet"
    salida = CAPA2_DIR / "FactStock.parquet"
    temporal = WORK_TEMP_DIR / "FactStock_temporal.parquet"
    dim_tiendas = CAPA2_DIR / "DimTiendas.parquet"
    dim_clasificacion = CAPA2_DIR / "DimClasificacionProducto.parquet"
    con = conectar()
    inicio = time.perf_counter()
    temporal.unlink(missing_ok=True)

    try:
        exigir_columnas(
            con,
            entrada,
            [
                "tienda", "codigo_nissei", "proveedor", "lote", "rubro",
                "linea", "sub_linea", "marca", "modelo", "descripcion",
                "serie", "cantidad", "precio_sugerido", "total_fuente",
                "estado", "mes", "anio", "fecha_corte",
                "es_fecha_corte_inferida", "archivo_origen",
            ],
        )
        ruta = sql_literal(entrada.as_posix())
        fecha_sql = f"DATE {sql_literal(fecha_corte.isoformat())}"

        # 1. Fuente materializada. Solo se excluyen filas sin las dos claves
        # comerciales mínimas; la validación de Capa 1 ya impide esos casos.
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_origen AS
            SELECT *
            FROM read_parquet({ruta})
            WHERE tienda IS NOT NULL
              AND trim(CAST(tienda AS VARCHAR)) <> ''
              AND codigo_nissei IS NOT NULL
              AND trim(CAST(codigo_nissei AS VARCHAR)) <> ''
            """
        )

        filas_origen = int(
            con.execute("SELECT COUNT(*) FROM st_stock_origen").fetchone()[0]
        )
        if filas_origen <= 0:
            raise RuntimeError("Fact_Stock.parquet no contiene filas utilizables.")

        # 2. Tiendas: homologación e ID calculados una sola vez por valor.
        tienda_norm = sql_tienda("tienda")
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_tiendas_norm AS
            SELECT tienda, {tienda_norm} AS tienda_norm
            FROM (SELECT DISTINCT tienda FROM st_stock_origen)
            """
        )
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_tiendas AS
            SELECT tienda, tienda_norm,
                   {sql_tienda_id('tienda_norm')} AS tienda_id
            FROM st_stock_tiendas_norm
            """
        )

        # 3. Producto: primero normaliza textos y después calcula IDs. Separar
        # ambas operaciones evita expansión recursiva de CASE/regexp en DuckDB.
        n = _normalizaciones_producto(
            "rubro", "linea", "sub_linea", "proveedor", "marca"
        )
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_productos_norm AS
            SELECT
                codigo_nissei, proveedor, rubro, linea, sub_linea, marca,
                {sql_codigo('codigo_nissei')} AS codigo_norm,
                {n['proveedor']} AS proveedor_norm,
                {n['rubro']} AS rubro_norm,
                {n['linea']} AS linea_norm,
                {n['sub_linea']} AS sub_linea_norm,
                {n['marca']} AS marca_norm
            FROM (
                SELECT DISTINCT codigo_nissei, proveedor, rubro, linea,
                                sub_linea, marca
                FROM st_stock_origen
            )
            """
        )
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_productos AS
            SELECT *,
                {sql_producto_id('codigo_norm')} AS producto_id,
                {sql_clasificacion_id('rubro_norm', 'linea_norm', 'sub_linea_norm')}
                    AS clasificacion_producto_id,
                {sql_proveedor_id('proveedor_norm')} AS proveedor_id,
                {sql_rubro_id('rubro_norm')} AS rubro_id,
                {sql_rubro_codigo('rubro_norm')} AS rubro_codigo,
                {sql_linea_id('rubro_norm', 'linea_norm')} AS linea_id,
                {sql_sublinea_id('rubro_norm', 'linea_norm', 'sub_linea_norm')}
                    AS sub_linea_id,
                {sql_marca_id('marca_norm')} AS marca_id
            FROM st_stock_productos_norm
            """
        )

        # 4. Meses y estados se homologan sobre sus dominios pequeños.
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_meses AS
            SELECT mes, {_mes_numero_sql('mes')} AS mes_origen_numero
            FROM (SELECT DISTINCT mes FROM st_stock_origen)
            """
        )
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_estados AS
            SELECT estado,
                   {sql_estado_stock_tres('estado')} AS estado_stock
            FROM (SELECT DISTINCT estado FROM st_stock_origen)
            """
        )

        # 5. Join de diccionarios. Se conserva cada fila de la fotografía.
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_base AS
            SELECT
                o.* EXCLUDE (fecha_corte, es_fecha_corte_inferida),
                CASE
                    WHEN EXTRACT(YEAR FROM o.fecha_corte) = {fecha_corte.year}
                     AND EXTRACT(MONTH FROM o.fecha_corte) = {fecha_corte.month}
                    THEN {fecha_sql}
                    ELSE o.fecha_corte
                END AS fecha_corte,
                CASE
                    WHEN EXTRACT(YEAR FROM o.fecha_corte) = {fecha_corte.year}
                     AND EXTRACT(MONTH FROM o.fecha_corte) = {fecha_corte.month}
                    THEN FALSE
                    ELSE o.es_fecha_corte_inferida
                END AS es_fecha_corte_inferida,
                t.tienda_norm, t.tienda_id,
                p.codigo_norm, p.producto_id, p.clasificacion_producto_id,
                p.proveedor_id, p.proveedor_norm,
                p.rubro_id, p.rubro_codigo, p.rubro_norm,
                p.linea_id, p.linea_norm,
                p.sub_linea_id, p.sub_linea_norm,
                p.marca_id, p.marca_norm,
                m.mes_origen_numero,
                e.estado_stock,
                TRY_CAST(o.anio AS INTEGER) AS anio_origen_raw
            FROM st_stock_origen o
            LEFT JOIN st_stock_tiendas t
              ON o.tienda IS NOT DISTINCT FROM t.tienda
            LEFT JOIN st_stock_productos p
              ON o.codigo_nissei IS NOT DISTINCT FROM p.codigo_nissei
             AND o.proveedor IS NOT DISTINCT FROM p.proveedor
             AND o.rubro IS NOT DISTINCT FROM p.rubro
             AND o.linea IS NOT DISTINCT FROM p.linea
             AND o.sub_linea IS NOT DISTINCT FROM p.sub_linea
             AND o.marca IS NOT DISTINCT FROM p.marca
            LEFT JOIN st_stock_meses m
              ON o.mes IS NOT DISTINCT FROM m.mes
            LEFT JOIN st_stock_estados e
              ON o.estado IS NOT DISTINCT FROM e.estado
            """
        )

        # Ninguna fila debe perder sus claves después de los diccionarios.
        sin_claves = con.execute(
            """
            SELECT COUNT(*)
            FROM st_stock_base
            WHERE tienda_id IS NULL OR producto_id IS NULL
            """
        ).fetchone()[0]
        if sin_claves:
            raise RuntimeError(
                f"Stock contiene {int(sin_claves):,} filas sin tienda_id o producto_id. "
                "Revisa TIENDAS.xlsx y la columna CODIGO NISSEI."
            )

        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE st_stock_fechas AS
            SELECT *,
                CASE
                    WHEN anio_origen_raw BETWEEN 2000
                         AND EXTRACT(YEAR FROM fecha_corte)::INTEGER
                     AND mes_origen_numero BETWEEN 1 AND 12
                    THEN anio_origen_raw
                END AS anio_origen,
                CASE
                    -- Stock puede conservar antigüedad previa al inicio comercial 2024.
                    -- NO usar ANIO_INICIO_MODELO aquí: esa regla pertenece a ventas/modelo.
                    WHEN anio_origen_raw BETWEEN 1900
                         AND EXTRACT(YEAR FROM fecha_corte)::INTEGER
                     AND mes_origen_numero BETWEEN 1 AND 12
                    THEN make_date(anio_origen_raw, mes_origen_numero, 1)
                END AS fecha_origen
            FROM st_stock_base
            """
        )

        # 6. Clasificación catalogada. La ausencia del catálogo no elimina datos.
        if dim_clasificacion.exists():
            con.execute(
                f"""
                CREATE OR REPLACE TEMP TABLE st_stock_enriquecido AS
                SELECT s.*, (d.clasificacion_producto_id IS NOT NULL)
                                  AS es_clasificacion_catalogada
                FROM st_stock_fechas s
                LEFT JOIN read_parquet({sql_literal(dim_clasificacion.as_posix())}) d
                  ON s.clasificacion_producto_id = d.clasificacion_producto_id
                """
            )
        else:
            con.execute(
                """
                CREATE OR REPLACE TEMP TABLE st_stock_enriquecido AS
                SELECT *, FALSE AS es_clasificacion_catalogada
                FROM st_stock_fechas
                """
            )

        # 7. Clave natural + ocurrencia. Así el ID sigue siendo único aun si el
        # Excel contiene dos líneas completamente idénticas, sin eliminar datos.
        clave_natural = (
            "strftime(fecha_corte, '%Y%m%d') || '|' || COALESCE(tienda_id,'') || '|' || "
            "COALESCE(producto_id,'') || '|' || COALESCE(lote,'') || '|' || "
            "COALESCE(serie,'') || '|' || COALESCE(estado_stock,'') || '|' || "
            "COALESCE(CAST(fecha_origen AS VARCHAR),'') || '|' || COALESCE(modelo,'') || '|' || "
            "COALESCE(descripcion,'') || '|' || COALESCE(CAST(cantidad AS VARCHAR),'') || '|' || "
            "COALESCE(CAST(precio_sugerido AS VARCHAR),'')"
        )
        stock_id = sql_hash_id(
            "STK_", "clave_stock_natural || '|' || CAST(ocurrencia_stock AS VARCHAR)", 18
        )

        consulta = f"""
        WITH claves_naturales AS (
            SELECT *, {clave_natural} AS clave_stock_natural
            FROM st_stock_enriquecido
        ), enumerado AS (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY clave_stock_natural
                    ORDER BY codigo_norm, tienda_norm, COALESCE(lote, ''),
                             COALESCE(serie, ''), COALESCE(modelo, ''),
                             COALESCE(descripcion, '')
                ) AS ocurrencia_stock
            FROM claves_naturales
        )
        SELECT
            {stock_id} AS stock_id,
            {sql_fecha_id('fecha_corte')} AS fecha_corte_id,
            {sql_periodo_id('fecha_corte')} AS periodo_corte_id,
            fecha_corte,
            EXTRACT(YEAR FROM fecha_corte)::INTEGER AS anio_corte,
            EXTRACT(MONTH FROM fecha_corte)::INTEGER AS mes_corte_numero,
            {_mes_nombre_sql("EXTRACT(MONTH FROM fecha_corte)::INTEGER")}
                AS mes_corte_nombre,
            EXTRACT(QUARTER FROM fecha_corte)::INTEGER AS trimestre_corte,
            es_fecha_corte_inferida,
            {sql_fecha_id('fecha_origen')} AS fecha_origen_id,
            {sql_periodo_id('fecha_origen')} AS periodo_origen_id,
            fecha_origen, anio_origen, mes_origen_numero,
            {_mes_nombre_sql('mes_origen_numero')} AS mes_origen_nombre,
            (fecha_origen IS NOT NULL AND fecha_origen <= fecha_corte)
                AS es_periodo_origen_valido,
            CASE
                WHEN fecha_origen IS NULL OR fecha_origen > fecha_corte THEN NULL
                ELSE date_diff(
                    'month', fecha_origen,
                    date_trunc('month', fecha_corte)::DATE
                )
            END AS edad_stock_meses,
            tienda_id, tienda_norm AS tienda,
            producto_id, codigo_norm AS codigo_nissei,
            clasificacion_producto_id,
            proveedor_id, proveedor_norm AS proveedor,
            rubro_id, rubro_codigo, rubro_norm AS rubro,
            linea_id, linea_norm AS linea,
            sub_linea_id, sub_linea_norm AS sub_linea,
            marca_id, marca_norm AS marca,
            modelo, descripcion, lote, serie, estado_stock,
            estado_stock AS estado_grupo,
            cantidad,
            COALESCE(precio_sugerido, 0)::DECIMAL(20,4) AS precio_sugerido,
            CAST(cantidad * COALESCE(precio_sugerido, 0) AS DECIMAL(20,4))
                AS valor_stock,
            total_fuente,
            CAST(
                COALESCE(total_fuente, cantidad * COALESCE(precio_sugerido, 0))
                - cantidad * COALESCE(precio_sugerido, 0)
                AS DECIMAL(20,4)
            ) AS diferencia_total,
            (
                total_fuente IS NULL
                OR abs(total_fuente - cantidad * COALESCE(precio_sugerido, 0)) <= 0.05
            ) AS es_total_consistente,
            (COALESCE(precio_sugerido, 0) = 0) AS es_precio_cero,
            es_clasificacion_catalogada,
            'UNIDADES' AS unidad_medida,
            'PEN' AS moneda
        FROM enumerado
        """

        print(
            "Agregando claves a FactStock por etapas materializadas...",
            flush=True,
        )
        con.execute(
            f"COPY ({consulta}) TO {sql_literal(temporal.as_posix())} "
            "(FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 122880)"
        )
        if not temporal.exists() or temporal.stat().st_size == 0:
            raise RuntimeError("No se generó FactStock temporal.")

        # Validación completa en la misma conexión; evita abrir otra instancia
        # nativa antes de publicar el archivo.
        ptemp = sql_literal(temporal.as_posix())
        filas, ids, nulos, invalidos, estados_invalidos = con.execute(
            f"""
            SELECT
                COUNT(*),
                COUNT(DISTINCT stock_id),
                COUNT(*) FILTER (
                    WHERE stock_id IS NULL OR fecha_corte_id IS NULL
                       OR tienda_id IS NULL OR producto_id IS NULL
                ),
                COUNT(*) FILTER (
                    WHERE cantidad IS NULL OR cantidad < 0
                       OR precio_sugerido < 0 OR valor_stock < 0
                ),
                COUNT(*) FILTER (
                    WHERE estado_grupo NOT IN ('BUENO', 'MERMA', 'DESMEDRO')
                )
            FROM read_parquet({ptemp})
            """
        ).fetchone()
        if int(filas) != filas_origen:
            raise RuntimeError(
                f"FactStock perdió filas: origen={filas_origen:,}, salida={int(filas):,}."
            )
        if (
            not filas
            or int(ids) != int(filas)
            or int(nulos)
            or int(invalidos)
            or int(estados_invalidos)
        ):
            raise RuntimeError(
                "FactStock no pasó validación: "
                f"filas={filas}, ids={ids}, nulos={nulos}, "
                f"inválidos={invalidos}, estados={estados_invalidos}."
            )

        if dim_tiendas.exists():
            huerfanas = con.execute(
                f"""
                SELECT COUNT(*)
                FROM (
                    SELECT DISTINCT f.tienda_id
                    FROM read_parquet({ptemp}) f
                    LEFT JOIN read_parquet({sql_literal(dim_tiendas.as_posix())}) d
                      USING (tienda_id)
                    WHERE d.tienda_id IS NULL
                )
                """
            ).fetchone()[0]
            if huerfanas:
                raise RuntimeError(
                    f"FactStock tiene {int(huerfanas):,} tiendas sin DimTiendas."
                )

        os.replace(temporal, salida)
        print(
            f"FactStock publicada en {(time.perf_counter() - inicio) / 60:.2f} minutos."
        )
        print(f"Resultado modelo: {salida}")
        return salida
    except Exception:
        temporal.unlink(missing_ok=True)
        raise
    finally:
        cerrar_duckdb_seguro(con)


def validar_claves(
    archivo: Path,
    claves: Iterable[str],
    permitir_nulos: set[str] | None = None,
    validar_unicidad: bool | None = None,
    conexion=None,
) -> dict[str, int]:
    """Valida claves reutilizando la conexión activa cuando se proporciona.

    Evita abrir conexiones anidadas en Windows/Python 3.14, escenario que
    provocaba finalizaciones nativas con STATUS_STACK_OVERFLOW.
    """
    claves = list(claves)
    permitir_nulos = permitir_nulos or set()
    propia = conexion is None
    con = conexion if conexion is not None else conectar()
    try:
        columnas = columnas_parquet(con, archivo)
        faltan = [c for c in claves if c not in columnas]
        if faltan:
            raise RuntimeError(f"Faltan claves en {archivo.name}: {faltan}")
        obligatorias = [c for c in claves if c not in permitir_nulos]
        condiciones = " OR ".join(f'"{c}" IS NULL' for c in obligatorias) or "FALSE"
        clave_fila = list(claves)[0]
        if validar_unicidad is None:
            validar_unicidad = os.getenv("ETL_VALIDACION_ESTRICTA", "0") == "1"
        if validar_unicidad:
            filas, distintas, nulos = con.execute(
                f'SELECT COUNT(*), COUNT(DISTINCT "{clave_fila}"), '
                f"COUNT(*) FILTER (WHERE {condiciones}) "
                f"FROM read_parquet({sql_literal(archivo.as_posix())})"
            ).fetchone()
        else:
            filas, nulos = con.execute(
                f'SELECT COUNT(*), COUNT(*) FILTER (WHERE {condiciones}) '
                f"FROM read_parquet({sql_literal(archivo.as_posix())})"
            ).fetchone()
            distintas = filas
        if not filas:
            raise RuntimeError(f"{archivo.name} está vacío.")
        if nulos:
            raise RuntimeError(
                f"{archivo.name} tiene {nulos:,} filas con claves obligatorias NULL: {obligatorias}"
            )
        if filas != distintas:
            raise RuntimeError(
                f"{archivo.name}.{clave_fila} no es única: "
                f"filas={filas:,}, distintas={distintas:,}"
            )
        return {
            "filas": int(filas), "nulos": int(nulos),
            "distintas": int(distintas), "columnas": len(columnas)
        }
    finally:
        if propia:
            cerrar_duckdb_seguro(con)


def validar_dimension(archivo: Path, clave: str, conexion=None) -> dict[str, int]:
    """Valida una dimensión sin crear conexiones DuckDB anidadas."""
    propia = conexion is None
    con = conexion if conexion is not None else conectar()
    try:
        exigir_columnas(con, archivo, [clave])
        filas, distintos, nulos = con.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT \"{clave}\"), "
            f"COUNT(*) FILTER (WHERE \"{clave}\" IS NULL) "
            f"FROM read_parquet({sql_literal(archivo.as_posix())})"
        ).fetchone()
        if not filas or filas != distintos or nulos:
            raise RuntimeError(
                f"La dimensión {archivo.name} no tiene clave única {clave}: "
                f"filas={filas}, distintos={distintos}, nulos={nulos}"
            )
        return {"filas": int(filas), "columnas": len(columnas_parquet(con, archivo))}
    finally:
        if propia:
            cerrar_duckdb_seguro(con)
