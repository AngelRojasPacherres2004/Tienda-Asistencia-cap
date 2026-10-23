from __future__ import annotations
from runtime_config import finalizar_proceso

import compileall
import sys
import types
from pathlib import Path

from project_paths import CAPA1_DIR, CAPA2_DIR, PROJECT_ROOT, SCRIPT_DIR, WORK_DIR

BASE_DIR = SCRIPT_DIR


def probar_compilacion() -> None:
    assert compileall.compile_dir(BASE_DIR, quiet=1)


def probar_rutas_portables() -> None:
    assert CAPA1_DIR == PROJECT_ROOT / "capa1"
    assert CAPA2_DIR == PROJECT_ROOT / "capa2"
    assert WORK_DIR == PROJECT_ROOT / ".etl_work"
    texto = (BASE_DIR / "project_paths.py").read_text(encoding="utf-8")
    assert "C:\\Users\\joela" not in texto
    assert "DASHBOARD_PROJECT_ROOT" in texto
    assert 'startswith(("piplines", "pipelines"))' in texto


def probar_lectura_manual() -> None:
    from auditar_entradas import EXCEL_MANUALES, auditar_excel

    for nombre, (hoja, requeridas) in EXCEL_MANUALES.items():
        resultado = auditar_excel(nombre, hoja, requeridas)
        assert resultado["estado"] == "OK", resultado
        assert resultado["filas"] > 0, resultado
        assert ".etl_work" in resultado["staging"], resultado


def probar_ids_tienda() -> None:
    from maestros import sql_tienda_id

    expresion = sql_tienda_id("tienda_norm")
    assert "WHEN 'MARINA' THEN 'T001'" in expresion
    assert "substr(sha256" in expresion
    assert ", 1, 12" in expresion
    assert "WHEN tienda_norm IS NULL" in expresion


def probar_fuentes_excel_manual() -> None:
    archivos = [
        "_base_tiendas.py",
        "_base_personal_tiendas.py",
        "_base_trafico_clientes.py",
        "_base_merma.py",
        "_base_guias_transito.py",
        "metas_tiendas_pipeline.py",
        "clasificacion_producto_pipeline.py",
    ]
    for nombre in archivos:
        texto = (BASE_DIR / nombre).read_text(encoding="utf-8")
        assert "read_xlsx(" not in texto, nombre
        assert "INSTALL excel" not in texto, nombre
        assert "LOAD excel" not in texto, nombre
        assert ("origen_xlsx_csv" in texto or "materializar_hoja_csv" in texto), nombre


def probar_nombres_capa2() -> None:
    from nombres_modelo import ARCHIVOS_CAPA2

    esperados = {
        "DimFecha.parquet",
        "DimFechaOrigenStock.parquet",
        "DimTiendas.parquet",
        "DimClasificacionProducto.parquet",
        "DimProducto.parquet",
        "FactVentas.parquet",
        "FactIngresos.parquet",
        "FactTransferencias.parquet",
        "FactGuiasTransito.parquet",
        "FactStock.parquet",
        "FactMerma.parquet",
        "FactMetasTienda.parquet",
        "FactPersonalTienda.parquet",
        "FactTraficoClientes.parquet",
    }
    assert set(ARCHIVOS_CAPA2.values()) == esperados

    modelo = (BASE_DIR / "modelo_relacional.py").read_text(encoding="utf-8")
    assert 'CAPA2_DIR / "FactVentas.parquet"' in modelo
    assert 'WORK_INTERMEDIATE_DIR / "FactVentasLimpio.parquet"' in modelo
    assert 'CAPA2_DIR / "Fact_Ventas_Limpia.parquet"' not in modelo


def probar_orquestador_completo() -> None:
    ejecutor = (BASE_DIR / "ejecutar_todo.py").read_text(encoding="utf-8")
    assert "FASE 1 - INPUT RMS -> CAPA 1" in ejecutor
    assert "FASE 2 - CAPA 1 -> CAPA 2 MODELO" in ejecutor
    assert '"--solo-capa1"' in ejecutor
    assert '"--solo-capa2"' in ejecutor
    assert "limpiar_capa2_generada()" in ejecutor
    assert "validar_contenido_capa2()" in ejecutor
    assert "conservar_salida_parcial" in ejecutor
    assert "restaurar_salida()" not in ejecutor
    assert "fecha_corte_automatica" in ejecutor
    assert '"aplicar_corte_modelo.py"' in ejecutor
    assert "último lunes" in ejecutor


def probar_reglas_corte_y_panel() -> None:
    from datetime import date
    from reglas_corte import ultimo_lunes, validar_fecha_corte

    assert ultimo_lunes(date(2026, 8, 14)) == date(2026, 8, 10)
    assert ultimo_lunes(date(2026, 8, 10)) == date(2026, 8, 10)
    assert validar_fecha_corte(date(2026, 8, 12))
    corte = (BASE_DIR / "aplicar_corte_modelo.py").read_text(encoding="utf-8")
    generador = (BASE_DIR / "generar_datos_web.py").read_text(encoding="utf-8")
    panel = (BASE_DIR / "panel_control.py").read_text(encoding="utf-8")
    assert "Reporte_Cobertura.json" in corte
    assert "rowsExcludedAfterCutoff" in corte
    assert "dataWarnings" in generador
    assert "generate_series" in generador
    assert "2_ACTUALIZAR_DATOS.bat" in panel
    assert "6_ACTUALIZAR_DASHBOARD_WEB.bat" in panel


def probar_tmdl_sin_comentarios() -> None:
    if "duckdb" not in sys.modules:
        sys.modules["duckdb"] = types.SimpleNamespace(DuckDBPyConnection=object)
    from generar_modelo_powerbi import limpiar_tmdl

    limpio = limpiar_tmdl(
        "createOrReplace\n// comentario\n# comentario\n-- comentario\n"
        "relationship R1\n/* bloque */\n\tfromColumn: A.a\n"
    )
    assert "comentario" not in limpio
    assert "/*" not in limpio
    assert "relationship R1" in limpio


def probar_tmdl_unico_en_capa2() -> None:
    generador = (BASE_DIR / "generar_modelo_powerbi.py").read_text(encoding="utf-8")
    nombres = (BASE_DIR / "nombres_modelo.py").read_text(encoding="utf-8")
    assert 'SALIDA_DIR = CAPA2_DIR' in generador
    assert 'TMDL_COMPLETO = CAPA2_DIR / "Modelo_Dashboard.tmdl"' in generador
    assert 'CAPA2_DIR.resolve().as_posix()' in generador
    assert 'TMDL_RELACIONES' not in generador
    assert 'TMDL_ENLACES' not in generador
    assert 'generar_manifiesto' not in generador
    assert 'generar_instrucciones' not in generador
    assert '"modelo": "Modelo_Dashboard.tmdl"' in nombres


def probar_escalabilidad() -> None:
    textos = "\n".join(
        (BASE_DIR / nombre).read_text(encoding="utf-8")
        for nombre in (
            "modelo_relacional.py",
            "validar_modelo.py",
            "generar_dimensiones_modelo.py",
        )
    )
    assert "debe contener exactamente las 20" not in textos
    assert "IDs históricos" in textos



def probar_correccion_transferencias() -> None:
    texto = (BASE_DIR / "modelo_relacional.py").read_text(encoding="utf-8")
    assert "COALESCE(ot.tienda_id,'')" in texto
    assert "COALESCE(dt.tienda_id,'')" in texto
    assert "ot.tienda_origen_id" not in texto
    assert "dt.tienda_destino_id" not in texto


def probar_inspeccion_xlsx_rapida() -> None:
    for nombre in ("_base_ventas.py", "_base_ingresos.py", "_base_transferencias.py"):
        texto = (BASE_DIR / nombre).read_text(encoding="utf-8")
        assert "from xlsx_fast import leer_filas_xlsx" in texto, nombre
        assert "from capa1_cache import" in texto, nombre
        assert "AS src({alias_columnas})" in texto, nombre
    ventas = (BASE_DIR / "_base_ventas.py").read_text(encoding="utf-8")
    assert "leer_filas_xlsx(archivo, hoja, max_filas=1" in ventas


def probar_paralelismo_controlado() -> None:
    texto = (BASE_DIR / "ejecutar_todo.py").read_text(encoding="utf-8")
    assert "ThreadPoolExecutor" in texto
    assert '"--paralelismo"' in texto
    assert "ETL_DUCKDB_THREADS" in texto
    runtime = (BASE_DIR / "runtime_config.py").read_text(encoding="utf-8")
    assert 'f"pid_{os.getpid()}"' in runtime


def probar_cache_incremental_capa1() -> None:
    texto = (BASE_DIR / "capa1_cache.py").read_text(encoding="utf-8")
    assert "st_mtime_ns" in texto and "st_size" in texto
    rutas = (BASE_DIR / "project_paths.py").read_text(encoding="utf-8")
    assert "WORK_C1_CACHE_DIR" in rutas



def probar_correcciones_v26() -> None:
    metas = (BASE_DIR / "metas_tiendas_pipeline.py").read_text(encoding="utf-8")
    merma = (BASE_DIR / "_base_merma.py").read_text(encoding="utf-8")
    modelo = (BASE_DIR / "modelo_relacional.py").read_text(encoding="utf-8")
    tmdl = (BASE_DIR / "generar_modelo_powerbi.py").read_text(encoding="utf-8")
    dimensiones = (BASE_DIR / "generar_dimensiones_modelo.py").read_text(encoding="utf-8")
    orquestador = (BASE_DIR / "ejecutar_todo.py").read_text(encoding="utf-8")
    runtime = (BASE_DIR / "runtime_config.py").read_text(encoding="utf-8")

    # Reglas funcionales y escalabilidad heredadas de v2.5.
    assert "BETWEEN 2024 AND 2026" not in metas
    assert "ANIO_MAXIMO = 2026" not in merma
    maestros = (BASE_DIR / "maestros.py").read_text(encoding="utf-8")
    dim_fecha = (BASE_DIR / "dim_fecha_pipeline.py").read_text(encoding="utf-8")
    dimensiones = (BASE_DIR / "generar_dimensiones_modelo.py").read_text(encoding="utf-8")
    guias = (BASE_DIR / "_base_guias_transito.py").read_text(encoding="utf-8")
    stock = (BASE_DIR / "modelo_relacional.py").read_text(encoding="utf-8")
    assert "ANIO_INICIO_MODELO = 2024" in maestros
    assert "ANIO_FIN_MODELO = 2026" in maestros
    assert "1 month - 1 day" not in dim_fecha
    assert "INTERVAL '1 month' - INTERVAL '1 day'" in dim_fecha
    assert "anio_inicio_efectivo = args.anio_inicio" in dimensiones
    assert "CAST(fecha_hora_transferencia AS DATE) >= make_date({ANIO_INICIO_MODELO}, 1, 1)" in guias
    assert "anio_origen_raw BETWEEN 1900" in stock
    assert 'con.execute(\n            f"""\n            CREATE OR REPLACE TEMP TABLE st_stock_fechas' in stock
    assert 'tabla.startswith("Fact")' in tmdl
    assert 'tabla.startswith("Fact_")' not in tmdl
    assert "detectar_rango_real_fechas" in dimensiones
    assert "fecha_transferencia_id" in dimensiones
    assert "DimFechaOrigenStock.parquet" in dimensiones
    assert "--permitir-anterior-modelo" in dimensiones
    bloque_personal = modelo[
        modelo.index("def transformar_personal("):
        modelo.index("def transformar_trafico(")
    ]
    assert "fecha_inicio_periodo" in bloque_personal
    guia_prefijo = modelo.split("AS guia_transito_id")[0][-2500:]
    for campo in ("fecha_hora_transferencia", "modelo_codigo", "cantidad", "precio_sugerido"):
        assert campo in guia_prefijo

    # Stock v2.6: etapas materializadas, validación antes de publicar y sin
    # conexiones anidadas.
    stock = modelo[modelo.index("def transformar_stock("):modelo.index("def validar_claves(")]
    for etapa in (
        "st_stock_origen", "st_stock_tiendas", "st_stock_productos",
        "st_stock_base", "st_stock_fechas", "st_stock_enriquecido",
    ):
        assert etapa in stock
    assert "FactStock_temporal.parquet" in stock
    assert "COUNT(DISTINCT stock_id)" in stock
    assert "os.replace(temporal, salida)" in stock
    assert "conexion=con" in modelo

    # Protección frente al fallo nativo Windows/Python 3.14.
    assert "_CONEXIONES_RETENIDAS" in runtime
    assert "os._exit" in runtime
    assert "entorno_duckdb_problematico" in runtime
    for archivo in BASE_DIR.glob("*.py"):
        if archivo.name in {"runtime_config.py", "pruebas_regresion.py", "auditar_codigo.py"}:
            continue
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        assert ".close()" not in texto, archivo.name

    # Orquestación recuperable: Stock aislado, backup y conservación de parciales.
    assert 'ejecutar_opcional(\n        "stock_pipeline.py"' in orquestador
    assert "crear_backup_salida()" in orquestador
    assert "conservar_salida_parcial(exc)" in orquestador
    assert "confirmar_salida()" in orquestador
    assert "restaurar_salida()" not in orquestador
    assert 'ejecutar("auditar_excel_comerciales.py")' in orquestador



def probar_metas_python_estable() -> None:
    texto = (BASE_DIR / "metas_tiendas_pipeline.py").read_text(encoding="utf-8")
    assert "normalizar_fila" in texto
    assert "validar_filas" in texto
    assert "materializar_hoja_csv" in texto
    assert "SQL anidado" in texto
    assert "WITH raw AS" not in texto
    assert 'ejecutar(\n        "metas_tiendas_pipeline.py"' in (BASE_DIR / "ejecutar_todo.py").read_text(encoding="utf-8")


def probar_finalizadores_seguros() -> None:
    for archivo in BASE_DIR.glob("*.py"):
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        if '__name__ == "__main__"' not in texto:
            continue
        if archivo.name in {"parquet_metadata.py", "panel_control.py"}:
            continue
        assert "finalizar_proceso" in texto, archivo.name


def probar_stock_sin_arbol_sql_monolitico() -> None:
    modelo = (BASE_DIR / "modelo_relacional.py").read_text(encoding="utf-8")
    stock = modelo[modelo.index("def transformar_stock("):modelo.index("def validar_claves(")]
    assert stock.count("CREATE OR REPLACE TEMP TABLE") >= 8
    assert "ROW_NUMBER() OVER" in stock
    assert "clave_stock_natural" in stock
    assert "WHERE tienda_id IS NULL OR producto_id IS NULL" in stock



def probar_clasificacion_unica_y_salida_parcial() -> None:
    dim_producto = (BASE_DIR / "dim_producto_pipeline.py").read_text(encoding="utf-8")
    orquestador = (BASE_DIR / "ejecutar_todo.py").read_text(encoding="utf-8")
    assert "PARTITION BY clasificacion_producto_id" in dim_producto
    assert "prioridad_origen ASC" in dim_producto
    assert "WHERE rn = 1" in dim_producto
    assert "verificar_dim_clasificacion()" in dim_producto
    dimensiones = (BASE_DIR / "generar_dimensiones_modelo.py").read_text(encoding="utf-8")
    assert 'CAPA2_DIR / "DimClasificacionProducto.parquet"' in dimensiones
    assert '"clasificacion_producto_id"' in dimensiones
    assert '"INCOMPLETA"' in orquestador
    assert "No se ejecutó rollback destructivo" in orquestador
    assert "estado_ultima_ejecucion.json" in orquestador



def probar_tabla_medidas_tmdl() -> None:
    if "duckdb" not in sys.modules:
        sys.modules["duckdb"] = types.SimpleNamespace(DuckDBPyConnection=object)
    from generar_modelo_powerbi import bloque_tabla_medidas
    from kpis_modelo import MEDIDAS, cantidad_medidas

    bloque = bloque_tabla_medidas("")
    assert "table Medidas" in bloque
    assert "partition Medidas_Interna = m" in bloque
    assert "#table(type table [Control = Int64.Type], {{1}})" in bloque
    assert "measure 'VENTA NETA'" in bloque
    assert "measure 'CUMPLIMIENTO DE META %'" in bloque
    assert "measure 'ROTACIÓN DE INVENTARIO S/ POR S/'" in bloque
    assert "measure 'SCORE INTEGRAL TIENDA'" in bloque
    assert "measure 'DETALLE RANKING TIENDA'" in bloque
    assert "measure 'TEXTO EOQ AJUSTADO'" in bloque
    assert 'FORMAT ( [Meta Anual S/], "S/ ' not in bloque
    assert 'FORMAT ( _valor, "S/ ' not in bloque
    assert 'FactMetasTienda[anio] = _anio' in bloque
    assert 'VAR _fechaBase = [Fecha Stock Actual]' in bloque
    assert '_finStock - 29, _finStock' in bloque
    assert 'DimTiendas[fecha_cierre]' in bloque
    assert 'DimTiendas[fecha_apertura]' in bloque
    assert "displayFolder:" in bloque
    assert bloque.count("\n\tmeasure ") == cantidad_medidas() == len(MEDIDAS)
    nombres = [m.nombre for m in MEDIDAS]
    assert len(nombres) == len(set(nombres))
    assert cantidad_medidas() >= 90


def probar_contrato_columnas_kpi() -> None:
    from kpis_modelo import COLUMNAS_REQUERIDAS_KPI
    for tabla in (
        "DimFecha", "DimTiendas", "DimProducto", "FactVentas",
        "FactIngresos", "FactTransferencias", "FactGuiasTransito",
        "FactStock", "FactMerma", "FactMetasTienda",
        "FactPersonalTienda", "FactTraficoClientes",
    ):
        assert tabla in COLUMNAS_REQUERIDAS_KPI
        assert COLUMNAS_REQUERIDAS_KPI[tabla]

def main() -> int:
    pruebas = [
        probar_compilacion,
        probar_rutas_portables,
        probar_lectura_manual,
        probar_ids_tienda,
        probar_fuentes_excel_manual,
        probar_nombres_capa2,
        probar_orquestador_completo,
        probar_reglas_corte_y_panel,
        probar_tmdl_sin_comentarios,
        probar_tmdl_unico_en_capa2,
        probar_escalabilidad,
        probar_correccion_transferencias,
        probar_inspeccion_xlsx_rapida,
        probar_paralelismo_controlado,
        probar_cache_incremental_capa1,
        probar_correcciones_v26,
        probar_metas_python_estable,
        probar_finalizadores_seguros,
        probar_stock_sin_arbol_sql_monolitico,
        probar_clasificacion_unica_y_salida_parcial,
        probar_tabla_medidas_tmdl,
        probar_contrato_columnas_kpi,
    ]
    for prueba in pruebas:
        prueba()
        print(f"[OK] {prueba.__name__}")
    print("TODAS LAS PRUEBAS DE REGRESIÓN PASARON")
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
