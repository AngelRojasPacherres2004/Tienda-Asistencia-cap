from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from pathlib import Path

from runtime_config import configurar_duckdb, cerrar_duckdb_seguro, finalizar_proceso
from xlsx_staging import origen_xlsx_csv
from maestros import (
    ANIO_INICIO_MODELO,
    TIENDAS_EQUIVALENCIAS as TIENDAS_EQUIVALENCIAS_MAESTRAS,
    TIENDA_IDS as TIENDA_IDS_MAESTRAS,
    sql_tienda_id as sql_tienda_id_maestro,
)
from typing import Any

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Falta instalar DuckDB. Activa el entorno virtual y ejecuta: "
        "python -m pip install -r requirements.txt"
    ) from exc


from project_paths import PROJECT_ROOT, WORK_TEMP_DIR
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"
CAPA2_DIR = BASE_DIR / "capa2"
CAPA2_FINAL = CAPA2_DIR / "FactPersonalTienda.parquet"
CAPA2_TEMP = WORK_TEMP_DIR / "FactPersonalTienda_temporal.parquet"
HOJA_CAPA1 = "PERSONAL_TIENDAS"

COLUMNAS_RESUMEN_REQUERIDAS = [
    "fecha_inicio_periodo",
    "fecha_corte",
    "tienda",
    "cargo",
    "area_asignada",
    "cantidad_personal",
]

# Desde septiembre de 2026 el archivo puede llegar como padrón individual.
# Se conserva el contrato anterior para no romper periodos ya preparados.
COLUMNAS_PADRON_REQUERIDAS = [
    "nombre_completo", "numero_documento", "tienda", "puesto", "area",
    "fecha_ingreso", "estado_laboral", "fecha_retiro",
]

COLUMNAS_CAPA2 = [
    "fecha_id",
    "periodo_id",
    "fecha_periodo",
    "fecha_inicio_periodo",
    "fecha_corte",
    "anio",
    "mes_numero",
    "mes_nombre",
    "trimestre",
    "semana",
    "dia_semana_numero",
    "dia_semana_nombre",
    "tienda_id",
    "tienda",
    "cargo",
    "area_asignada",
    "tipo_area",
    "cantidad_personal",
]

TOKENS_NULOS = {"", "N/A", "NA", "NULL", "NONE", "-", "--", "#N/A", "(EN BLANCO)"}

TIENDAS_EQUIVALENCIAS = {
    "AGUAS VERDES": "TUMBES",
    "TUMBES": "TUMBES",
    "ALFONSO UGARTE": "ALFONSO UGARTE",
    "ALF UGARTE": "ALFONSO UGARTE",
    "ALIPIO": "ALIPIO",
    "ANGAMOS": "ANGAMOS",
    "ARAMBURU": "ARAMBURU",
    "ARAMBURÚ": "ARAMBURU",
    "ARGENTINA": "ARGENTINA",
    "AYA": "AYACUCHO",
    "AYACUCHO": "AYACUCHO",
    "AYACUCHO 1021 --- CUARTO PISO": "AYACUCHO",
    "CALLAO": "CALLAO",
    "CD": "CD",
    "CHORRILLOS": "CHORRILLOS",
    "EMANCIPACION": "EMANCIPACIÓN",
    "EMANCIPACIÓN": "EMANCIPACIÓN",
    "INDEPENDENCIA": "INDEPENDENCIA",
    "LA MARINA": "MARINA",
    "MARINA": "MARINA",
    "PERSHING": "PERSHING",
    "PP": "PUENTE PIEDRA",
    "PTE PIEDRA": "PUENTE PIEDRA",
    "PUENTE PIEDRA": "PUENTE PIEDRA",
    "PU": "PZA UNIÓN",
    "PZA UNION": "PZA UNIÓN",
    "PZA UNIÓN": "PZA UNIÓN",
    "PLAZA UNION": "PZA UNIÓN",
    "PLAZA UNIÓN": "PZA UNIÓN",
    "PUNO": "PUNO",
    "UNION 797": "JR UNIÓN",
    "UNIÓN 797": "JR UNIÓN",
    "JIRON UNION": "JR UNIÓN",
    "JIRÓN UNIÓN": "JR UNIÓN",
    "JR UNION": "JR UNIÓN",
    "JR UNIÓN": "JR UNIÓN",
    "TRUJILLO": "TRUJILLO",
    "ONLINE": "ONLINE",
    "ALMACEN VIRTUAL": "ONLINE",
    "ALMACÉN VIRTUAL": "ONLINE",
    "ALMACEN VIRUTAL": "ONLINE",
    "ALMACÉN VIRUTAL": "ONLINE",
}

TIENDA_IDS = {
    "MARINA": "T001",
    "ARAMBURU": "T002",
    "EMANCIPACIÓN": "T003",
    "INDEPENDENCIA": "T004",
    "ALFONSO UGARTE": "T005",
    "ANGAMOS": "T006",
    "PERSHING": "T007",
    "ALIPIO": "T008",
    "CHORRILLOS": "T009",
    "TRUJILLO": "T010",
    "PUENTE PIEDRA": "T011",
    "AYACUCHO": "T012",
    "CALLAO": "T013",
    "TUMBES": "T014",
    "PZA UNIÓN": "T015",
    "JR UNIÓN": "T016",
    "ARGENTINA": "T017",
    "PUNO": "T018",
    "CD": "T019",
    "ONLINE": "T020",
}

CARGOS_EQUIVALENCIAS = {
    "VENDEDOR": "VENDEDOR",
    "VENDEDORES": "VENDEDOR",
    "VENDEDORA": "VENDEDOR",
    "VENDEDOR(A)": "VENDEDOR",
}

AREAS_EQUIVALENCIAS = {
    "CAJA": "CAJA",
    "CAJAS": "CAJA",
    "TEXTIL": "TEXTIL",
    "CALZADO": "CALZADO",
    "TECNOLOGIA": "TECNOLOGÍA",
    "TECNOLOGÍA": "TECNOLOGÍA",
    "SEGURIDAD": "SEGURIDAD",
    "ADMINISTRATIVA": "ADMINISTRATIVA",
    "ADMINISTRATIVO": "ADMINISTRATIVA",
    "ALMACEN": "ALMACÉN",
    "ALMACÉN": "ALMACÉN",
    "ELECTRO MENOR": "ELECTRO MENOR",
    "ELECTROMENOR": "ELECTRO MENOR",
    "ELECTRO MENOR AUDIO Y VIDEO": "ELECTRO MENOR - AUDIO Y VIDEO",
    "ELECTRO MENOR - AUDIO Y VIDEO": "ELECTRO MENOR - AUDIO Y VIDEO",
    "HOGAR ELECTRO": "HOGAR / ELECTRO",
    "HOGAR / ELECTRO": "HOGAR / ELECTRO",
    "HOGAR Y MENAJE": "HOGAR Y MENAJE",
    "HOGAR MENAJE": "HOGAR Y MENAJE",
    "HOGAR Y TECNOLOGIA": "HOGAR Y TECNOLOGÍA",
    "HOGAR Y TECNOLOGÍA": "HOGAR Y TECNOLOGÍA",
}

AREAS_SOPORTE = {"CAJA", "SEGURIDAD", "ADMINISTRATIVA", "ALMACÉN"}


def preparar_carpetas() -> None:
    CAPA1_DIR.mkdir(parents=True, exist_ok=True)
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)


def sql_texto(valor: Any) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def normalizar_clave_python(valor: Any) -> str:
    texto = "" if valor is None else str(valor)
    texto = unicodedata.normalize("NFKD", texto.upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_diccionario(diccionario: dict[str, str]) -> dict[str, str]:
    return {normalizar_clave_python(k): v for k, v in diccionario.items()}


def sql_limpiar_texto(expresion: str) -> str:
    texto = f"CAST({expresion} AS VARCHAR)"
    texto = f"replace({texto}, {sql_texto(chr(160))}, ' ')"
    texto = f"replace({texto}, {sql_texto(chr(8203))}, '')"
    texto = f"replace(replace({texto}, chr(13), ' '), chr(10), ' ')"
    texto = f"NULLIF(regexp_replace(trim({texto}), '\\s+', ' ', 'g'), '')"
    lista = ", ".join(sql_texto(x) for x in sorted(TOKENS_NULOS))
    return f"CASE WHEN upper(COALESCE({texto}, '')) IN ({lista}) THEN NULL ELSE upper({texto}) END"


def sql_clave(expresion: str) -> str:
    texto = f"upper(COALESCE(CAST({expresion} AS VARCHAR), ''))"
    for origen, destino in [
        ("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"),
        ("Ú", "U"), ("Ü", "U"), ("Ñ", "N"),
    ]:
        texto = f"replace({texto}, {sql_texto(origen)}, {sql_texto(destino)})"
    texto = f"regexp_replace({texto}, '[^A-Z0-9]+', ' ', 'g')"
    return f"trim(regexp_replace({texto}, '\\s+', ' ', 'g'))"


def sql_mapear(expresion: str, diccionario: dict[str, str], fallback: str) -> str:
    casos = "\n".join(
        f"WHEN {sql_texto(k)} THEN {sql_texto(v)}"
        for k, v in sorted(normalizar_diccionario(diccionario).items())
    )
    return f"CASE {sql_clave(expresion)}\n{casos}\nELSE {fallback}\nEND"


def sql_numero(expresion: str) -> str:
    raw = f"trim(CAST({expresion} AS VARCHAR))"
    limpio = f"regexp_replace({raw}, '[^0-9,\\.\\-]', '', 'g')"
    return f"""
    CASE
        WHEN {raw} IS NULL OR upper({raw}) IN ('', 'N/A', 'NA', 'NULL', 'NONE', '-', '--', '#N/A') THEN NULL
        WHEN regexp_full_match({limpio}, '^-?[0-9]{{1,3}}(\\.[0-9]{{3}})+,[0-9]+$')
            THEN TRY_CAST(replace(replace({limpio}, '.', ''), ',', '.') AS DOUBLE)
        WHEN regexp_full_match({limpio}, '^-?[0-9]{{1,3}}(,[0-9]{{3}})+\\.[0-9]+$')
            THEN TRY_CAST(replace({limpio}, ',', '') AS DOUBLE)
        WHEN regexp_full_match({limpio}, '^-?[0-9]+,[0-9]+$')
            THEN TRY_CAST(replace({limpio}, ',', '.') AS DOUBLE)
        ELSE TRY_CAST(replace({limpio}, ',', '') AS DOUBLE)
    END
    """


def sql_fecha_excel(expresion: str) -> str:
    raw = f"NULLIF(trim(CAST({expresion} AS VARCHAR)), '')"
    numero = f"TRY_CAST(replace({raw}, ',', '.') AS DOUBLE)"
    return f"""
    CASE
        WHEN {raw} IS NULL OR upper({raw}) IN ('N/A','NA','NULL','NONE','-','--','#N/A') THEN NULL
        WHEN regexp_full_match({raw}, '^[0-9]+([.,][0-9]+)?$') AND {numero} BETWEEN 1 AND 100000
            THEN CAST(TIMESTAMP '1899-12-30' + ({numero} * INTERVAL '1 day') AS DATE)
        ELSE COALESCE(
            TRY_CAST({raw} AS DATE),
            CAST(try_strptime({raw}, '%d/%m/%Y') AS DATE),
            CAST(try_strptime({raw}, '%Y-%m-%d') AS DATE),
            CAST(try_strptime({raw}, '%d-%m-%Y') AS DATE)
        )
    END
    """


def sql_nombre_mes(expr: str) -> str:
    return f"""CASE {expr}
        WHEN 1 THEN 'ENERO' WHEN 2 THEN 'FEBRERO' WHEN 3 THEN 'MARZO'
        WHEN 4 THEN 'ABRIL' WHEN 5 THEN 'MAYO' WHEN 6 THEN 'JUNIO'
        WHEN 7 THEN 'JULIO' WHEN 8 THEN 'AGOSTO' WHEN 9 THEN 'SEPTIEMBRE'
        WHEN 10 THEN 'OCTUBRE' WHEN 11 THEN 'NOVIEMBRE' WHEN 12 THEN 'DICIEMBRE'
        ELSE NULL END"""


def sql_nombre_dia(expr: str) -> str:
    return f"""CASE {expr}
        WHEN 1 THEN 'LUNES' WHEN 2 THEN 'MARTES' WHEN 3 THEN 'MIÉRCOLES'
        WHEN 4 THEN 'JUEVES' WHEN 5 THEN 'VIERNES' WHEN 6 THEN 'SÁBADO'
        WHEN 7 THEN 'DOMINGO' ELSE NULL END"""


def id_sql(tienda_expr: str) -> str:
    return sql_tienda_id_maestro(tienda_expr)


def buscar_archivo_capa1() -> Path:
    preparar_carpetas()
    esperado = CAPA1_DIR / "PERSONAL_TIENDAS.xlsx"
    if esperado.exists():
        return esperado
    candidatos = sorted(
        p for p in CAPA1_DIR.glob("*.xlsx")
        if not p.name.startswith("~$")
        and "PERSONAL" in normalizar_clave_python(p.stem)
        and "TIENDA" in normalizar_clave_python(p.stem)
    )
    if len(candidatos) == 1:
        return candidatos[0]
    if not candidatos:
        raise FileNotFoundError(f"No se encontró PERSONAL_TIENDAS.xlsx dentro de {CAPA1_DIR}.")
    raise RuntimeError("Hay varios Excel de personal en capa1. Conserva solamente el vigente.")


def crear_conexion(cargar_excel: bool) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(database=":memory:")
    configurar_duckdb(con, BASE_DIR, preserve_insertion_order=False)
    return con


def consulta_excel(archivo: Path) -> str:
    return origen_xlsx_csv(archivo, HOJA_CAPA1)


def obtener_columnas(con: duckdb.DuckDBPyConnection, archivo: Path) -> list[str]:
    return [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {consulta_excel(archivo)}").fetchall()]


def construir_sql_resumen(archivo: Path) -> str:
    """Construye la dotación mensual vigente entre inicio y corte.

    El Excel registra intervalos (por ejemplo 01/01/2026 a 21/07/2026).
    Para que los filtros mensuales de Power BI funcionen, cada intervalo se
    expande a una fila por mes, conservando las fechas originales como
    trazabilidad. El grano final es mes + tienda + cargo + área.
    """
    origen = consulta_excel(archivo)
    tienda_mapeada = sql_mapear("tienda_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen")
    cargo_mapeado = sql_mapear("cargo_origen", CARGOS_EQUIVALENCIAS, "cargo_origen")
    area_mapeada = sql_mapear("area_origen", AREAS_EQUIVALENCIAS, "area_origen")
    areas_soporte = ", ".join(sql_texto(x) for x in sorted(AREAS_SOPORTE))

    return f"""
    WITH raw AS (
        SELECT
            row_number() OVER () AS fila_origen,
            {sql_fecha_excel('"fecha_inicio_periodo"')} AS fecha_inicio_periodo,
            {sql_fecha_excel('"fecha_corte"')} AS fecha_corte,
            {sql_limpiar_texto('"tienda"')} AS tienda_origen,
            {sql_limpiar_texto('"cargo"')} AS cargo_origen,
            {sql_limpiar_texto('"area_asignada"')} AS area_origen,
            TRY_CAST(({sql_numero('"cantidad_personal"')}) AS INTEGER) AS cantidad_personal
        FROM {origen}
        WHERE NOT (
            "fecha_inicio_periodo" IS NULL
            AND "fecha_corte" IS NULL
            AND "tienda" IS NULL
            AND "cargo" IS NULL
            AND "area_asignada" IS NULL
            AND "cantidad_personal" IS NULL
        )
    ), normalizado AS (
        SELECT
            fila_origen,
            fecha_inicio_periodo,
            fecha_corte,
            {tienda_mapeada} AS tienda,
            COALESCE({cargo_mapeado}, 'VENDEDOR') AS cargo,
            {area_mapeada} AS area_asignada,
            cantidad_personal
        FROM raw
    ), validado AS (
        SELECT *
        FROM normalizado
        WHERE fecha_inicio_periodo >= make_date({ANIO_INICIO_MODELO}, 1, 1)
          AND fecha_corte >= make_date({ANIO_INICIO_MODELO}, 1, 1)
          AND fecha_inicio_periodo <= fecha_corte
          AND tienda IS NOT NULL
          AND area_asignada IS NOT NULL
          AND cantidad_personal IS NOT NULL
          AND cantidad_personal >= 0
    ), expandido AS (
        SELECT
            v.*,
            CAST(mes.fecha_periodo AS DATE) AS fecha_periodo
        FROM validado v
        CROSS JOIN LATERAL generate_series(
            CAST(date_trunc('month', v.fecha_inicio_periodo) AS DATE),
            CAST(date_trunc('month', v.fecha_corte) AS DATE),
            INTERVAL '1 month'
        ) AS mes(fecha_periodo)
    ), enriquecido AS (
        SELECT
            CAST(strftime(fecha_periodo, '%Y%m%d') AS INTEGER) AS fecha_id,
            CAST(strftime(fecha_periodo, '%Y%m') AS INTEGER) AS periodo_id,
            fecha_periodo,
            fecha_inicio_periodo,
            fecha_corte,
            date_part('year', fecha_periodo)::INTEGER AS anio,
            date_part('month', fecha_periodo)::INTEGER AS mes_numero,
            {sql_nombre_mes("date_part('month', fecha_periodo)::INTEGER")} AS mes_nombre,
            date_part('quarter', fecha_periodo)::INTEGER AS trimestre,
            date_part('week', fecha_periodo)::INTEGER AS semana,
            date_part('isodow', fecha_periodo)::INTEGER AS dia_semana_numero,
            {sql_nombre_dia("date_part('isodow', fecha_periodo)::INTEGER")} AS dia_semana_nombre,
            {id_sql('tienda')} AS tienda_id,
            tienda,
            cargo,
            area_asignada,
            CASE
                WHEN area_asignada IN ({areas_soporte}) THEN 'SOPORTE'
                ELSE 'COMERCIAL'
            END AS tipo_area,
            cantidad_personal,
            fila_origen
        FROM expandido
    ), deduplicado AS (
        SELECT * EXCLUDE (fila_origen, orden_vigencia)
        FROM (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY fecha_periodo, tienda, cargo, area_asignada
                    ORDER BY fecha_corte DESC, fecha_inicio_periodo DESC, fila_origen DESC
                ) AS orden_vigencia
            FROM enriquecido
        )
        WHERE orden_vigencia = 1
    )
    SELECT
        fecha_id,
        periodo_id,
        fecha_periodo,
        fecha_inicio_periodo,
        fecha_corte,
        anio,
        mes_numero,
        mes_nombre,
        trimestre,
        semana,
        dia_semana_numero,
        dia_semana_nombre,
        tienda_id,
        tienda,
        cargo,
        area_asignada,
        tipo_area,
        cantidad_personal
    FROM deduplicado
    """


def es_formato_padron(columnas: list[str]) -> bool:
    disponibles = {normalizar_clave_python(columna) for columna in columnas}
    return all(normalizar_clave_python(columna) in disponibles for columna in COLUMNAS_PADRON_REQUERIDAS)


def construir_sql_padron(archivo: Path, columnas: list[str]) -> str:
    """Convierte el padrón individual en una dotación mensual agregada.

    La Capa 2 no conserva nombres, DNI ni datos sensibles. Solo usa una clave
    interna para evitar duplicados dentro de cada mes y publica conteos por
    tienda, puesto y área, que es el grano que consumen el dashboard y Power BI.
    """
    origen = consulta_excel(archivo)
    mapa = {normalizar_clave_python(columna): columna for columna in columnas}

    def columna(*candidatos: str) -> str:
        for candidato in candidatos:
            encontrada = mapa.get(normalizar_clave_python(candidato))
            if encontrada:
                return '"' + encontrada.replace('"', '""') + '"'
        return "NULL"

    nombre = columna("nombre_completo", "nombre")
    documento = columna("numero_documento", "documento", "dni")
    tienda_raw = columna("tienda")
    puesto = columna("puesto", "cargo")
    area = columna("area", "area_asignada")
    fecha_ingreso = columna("fecha_ingreso")
    fecha_retiro = columna("fecha_retiro")
    estado = columna("estado_laboral", "estado")
    tienda_mapeada = sql_mapear("tienda_origen", TIENDAS_EQUIVALENCIAS, "tienda_origen")
    cargo_mapeado = sql_mapear("cargo_origen", CARGOS_EQUIVALENCIAS, "cargo_origen")
    area_mapeada = sql_mapear("area_origen", AREAS_EQUIVALENCIAS, "area_origen")
    areas_soporte = ", ".join(sql_texto(x) for x in sorted(AREAS_SOPORTE))

    return f"""
    WITH raw AS (
        SELECT
            row_number() OVER () AS fila_origen,
            NULLIF(trim(CAST({documento} AS VARCHAR)), '') AS documento_origen,
            {sql_limpiar_texto(nombre)} AS nombre_origen,
            {sql_fecha_excel(fecha_ingreso)} AS fecha_ingreso,
            {sql_fecha_excel(fecha_retiro)} AS fecha_retiro,
            {sql_limpiar_texto(tienda_raw)} AS tienda_origen,
            {sql_limpiar_texto(puesto)} AS cargo_origen,
            {sql_limpiar_texto(area)} AS area_origen,
            {sql_limpiar_texto(estado)} AS estado_laboral
        FROM {origen}
    ), normalizado AS (
        SELECT
            fila_origen,
            COALESCE(documento_origen, sha256(COALESCE(nombre_origen, '') || '|' || COALESCE(CAST(fecha_ingreso AS VARCHAR), '') || '|' || COALESCE(tienda_origen, ''))) AS colaborador_clave,
            fecha_ingreso,
            CASE
                WHEN estado_laboral IN ('POR INGRESAR', 'NO INGRESO', 'ANULADO') THEN NULL
                ELSE COALESCE(fecha_retiro, CURRENT_DATE)
            END AS fecha_fin,
            {tienda_mapeada} AS tienda,
            COALESCE({cargo_mapeado}, 'SIN PUESTO') AS cargo,
            COALESCE({area_mapeada}, 'SIN ÁREA') AS area_asignada
        FROM raw
    ), vigencias AS (
        SELECT *
        FROM normalizado
        WHERE fecha_ingreso IS NOT NULL
          AND fecha_ingreso <= fecha_fin
          AND fecha_fin >= make_date(2023, 1, 1)
          AND tienda IS NOT NULL
    ), expandido AS (
        SELECT
            colaborador_clave, tienda, cargo, area_asignada,
            CAST(mes.fecha_periodo AS DATE) AS fecha_periodo
        FROM vigencias
        CROSS JOIN LATERAL generate_series(
            GREATEST(CAST(date_trunc('month', fecha_ingreso) AS DATE), make_date(2023, 1, 1)),
            CAST(date_trunc('month', fecha_fin) AS DATE),
            INTERVAL '1 month'
        ) AS mes(fecha_periodo)
    ), mensual AS (
        SELECT
            fecha_periodo, tienda, cargo, area_asignada,
            COUNT(DISTINCT colaborador_clave)::INTEGER AS cantidad_personal
        FROM expandido
        GROUP BY 1, 2, 3, 4
    )
    SELECT
        CAST(strftime(fecha_periodo, '%Y%m%d') AS INTEGER) AS fecha_id,
        CAST(strftime(fecha_periodo, '%Y%m') AS INTEGER) AS periodo_id,
        fecha_periodo,
        fecha_periodo AS fecha_inicio_periodo,
        last_day(fecha_periodo) AS fecha_corte,
        date_part('year', fecha_periodo)::INTEGER AS anio,
        date_part('month', fecha_periodo)::INTEGER AS mes_numero,
        {sql_nombre_mes("date_part('month', fecha_periodo)::INTEGER")} AS mes_nombre,
        date_part('quarter', fecha_periodo)::INTEGER AS trimestre,
        date_part('week', fecha_periodo)::INTEGER AS semana,
        date_part('isodow', fecha_periodo)::INTEGER AS dia_semana_numero,
        {sql_nombre_dia("date_part('isodow', fecha_periodo)::INTEGER")} AS dia_semana_nombre,
        {id_sql('tienda')} AS tienda_id,
        tienda,
        cargo,
        area_asignada,
        CASE WHEN area_asignada IN ({areas_soporte}) THEN 'SOPORTE' ELSE 'COMERCIAL' END AS tipo_area,
        cantidad_personal
    FROM mensual
    """


def construir_sql_capa2(archivo: Path, columnas: list[str]) -> str:
    return construir_sql_padron(archivo, columnas) if es_formato_padron(columnas) else construir_sql_resumen(archivo)


def verificar_capa1(con: duckdb.DuckDBPyConnection, archivo: Path) -> dict[str, int]:
    columnas = obtener_columnas(con, archivo)
    formato_padron = es_formato_padron(columnas)
    requeridas = COLUMNAS_PADRON_REQUERIDAS if formato_padron else COLUMNAS_RESUMEN_REQUERIDAS
    faltan = [c for c in requeridas if c not in columnas]
    if faltan:
        raise RuntimeError(
            "El Excel de personal no coincide con el formato de resumen ni con el padrón individual. "
            f"Faltan: {faltan}; encontradas={columnas}"
        )

    sql = construir_sql_capa2(archivo, columnas)
    resumen = con.execute(
        f"""
        SELECT
            COUNT(*),
            COUNT(DISTINCT periodo_id),
            MIN(fecha_periodo),
            MAX(fecha_periodo),
            COUNT(*) FILTER (WHERE tienda_id IS NULL),
            COUNT(*) FILTER (WHERE cantidad_personal IS NULL),
            COUNT(*) FILTER (WHERE cantidad_personal < 0),
            COUNT(DISTINCT tienda),
            COALESCE(SUM(cantidad_personal), 0)
        FROM ({sql})
        """
    ).fetchone()
    if resumen[0] == 0:
        raise RuntimeError("El Excel de personal no contiene registros utilizables.")

    print("\nCAPA 1 DE PERSONAL VERIFICADA")
    print(f"Archivo                    : {archivo}")
    print(f"Formato                    : {'padrón individual agregado' if formato_padron else 'resumen por vigencia'}")
    print(f"Registros mensuales        : {resumen[0]}")
    print(f"Periodos mensuales         : {resumen[1]}")
    print(f"Rango mensual              : {resumen[2]} a {resumen[3]}")
    print(f"Tiendas sin homologar      : {resumen[4]}")
    print(f"Cantidad vacía             : {resumen[5]}")
    print(f"Cantidad negativa          : {resumen[6]}")
    print(f"Tiendas                    : {resumen[7]}")
    print(f"Suma de dotación mensual   : {resumen[8]}")
    print("La salida conserva solo conteos mensuales; no publica datos personales identificables.")
    print("La homologación de tienda, puesto y área usa el maestro central.")
    return {"filas": int(resumen[0]), "columnas": len(columnas)}


def crear_capa2(con: duckdb.DuckDBPyConnection, archivo: Path) -> None:
    columnas = obtener_columnas(con, archivo)
    verificar_capa1(con, archivo)
    CAPA2_TEMP.unlink(missing_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT * FROM ({construir_sql_capa2(archivo, columnas)})
            ORDER BY fecha_periodo, tienda_id, area_asignada
        ) TO {sql_texto(CAPA2_TEMP.as_posix())}
        (FORMAT PARQUET, COMPRESSION SNAPPY)
        """
    )


def validar_y_publicar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_TEMP.exists():
        raise RuntimeError("No se generó el Parquet temporal.")
    origen = f"read_parquet({sql_texto(CAPA2_TEMP.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError(f"Esquema inesperado. Esperado: {COLUMNAS_CAPA2}; obtenido: {columnas}")
    filas = con.execute(f"SELECT COUNT(*) FROM {origen}").fetchone()[0]
    if filas == 0:
        raise RuntimeError("El Parquet de personal quedó vacío.")
    os.replace(CAPA2_TEMP, CAPA2_FINAL)
    return {"filas": int(filas), "columnas": len(columnas)}


def verificar_capa2(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    if not CAPA2_FINAL.exists():
        raise FileNotFoundError(f"No existe {CAPA2_FINAL}")
    origen = f"read_parquet({sql_texto(CAPA2_FINAL.as_posix())})"
    columnas = [f[0] for f in con.execute(f"DESCRIBE SELECT * FROM {origen}").fetchall()]
    if columnas != COLUMNAS_CAPA2:
        raise RuntimeError("FactPersonalTienda.parquet tiene un esquema inesperado.")
    resumen = con.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT tienda_id), COUNT(DISTINCT periodo_id), MIN(fecha_periodo), MAX(fecha_periodo), COALESCE(SUM(cantidad_personal),0) FROM {origen}"
    ).fetchone()
    print("\nFACT_PERSONAL_TIENDA VERIFICADA")
    print(f"Registros mensuales : {resumen[0]}")
    print(f"Tiendas             : {resumen[1]}")
    print(f"Periodos            : {resumen[2]}")
    print(f"Rango               : {resumen[3]} a {resumen[4]}")
    print(f"Suma dotación       : {resumen[5]}")
    return {"filas": int(resumen[0]), "columnas": len(columnas)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Excel manual de personal -> capa2/FactPersonalTienda.parquet"
    )
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--verificar-capa1", action="store_true")
    grupo.add_argument("--solo-capa2", action="store_true")
    grupo.add_argument("--verificar-capa2", action="store_true")
    args = parser.parse_args()

    preparar_carpetas()
    con = None
    try:
        if args.verificar_capa2:
            con = crear_conexion(False)
            verificar_capa2(con)
            return 0

        archivo = buscar_archivo_capa1()
        con = crear_conexion(True)
        if args.verificar_capa1:
            verificar_capa1(con, archivo)
            return 0

        crear_capa2(con, archivo)
        resumen = validar_y_publicar_capa2(con)
        print("\nFACT_PERSONAL_TIENDA GENERADA CORRECTAMENTE")
        print(f"Registros : {resumen['filas']}")
        print(f"Resultado : {CAPA2_FINAL}")
        return 0
    except Exception as exc:
        print("\nERROR EN LA PIPELINE DE PERSONAL DE TIENDAS", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        CAPA2_TEMP.unlink(missing_ok=True)
        return 1
    finally:
        if con is not None:
            cerrar_duckdb_seguro(con)


# La homologación final usa el maestro único del proyecto. Se conservan
# equivalencias locales antiguas, pero nunca se pierden alias nuevos del maestro.
TIENDAS_EQUIVALENCIAS = {**TIENDAS_EQUIVALENCIAS_MAESTRAS, **TIENDAS_EQUIVALENCIAS}
TIENDA_IDS = dict(TIENDA_IDS_MAESTRAS)

if __name__ == "__main__":
    finalizar_proceso(main())
