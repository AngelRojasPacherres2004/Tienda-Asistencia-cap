from __future__ import annotations

"""Auditoría estática y portable del paquete ETL.

No transforma datos. Verifica que el paquete entregado esté completo, compile,
no use rutas locales absolutas, no cierre DuckDB directamente en scripts de
negocio y conserve los contratos principales del modelo.
"""

import compileall
import re
import sys
from pathlib import Path

from project_paths import SCRIPT_DIR
from runtime_config import finalizar_proceso

ARCHIVOS_OBLIGATORIOS = {
    "ejecutar_todo.py",
    "runtime_config.py",
    "project_paths.py",
    "maestros.py",
    "modelo_relacional.py",
    "ventas_pipeline.py",
    "ingreso_pipeline.py",
    "transferencia_pipeline.py",
    "stock_pipeline.py",
    "tiendas_pipeline.py",
    "clasificacion_producto_pipeline.py",
    "guias_transito_pipeline.py",
    "merma_pipeline.py",
    "metas_tiendas_pipeline.py",
    "personal_tiendas_pipeline.py",
    "trafico_clientes_pipeline.py",
    "generar_dimensiones_modelo.py",
    "validar_modelo.py",
    "generar_modelo_powerbi.py",
    "kpis_modelo.py",
    "requirements.txt",
}

ARTEFACTOS_CAPA2 = {
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


def registrar(errores: list[str], condicion: bool, mensaje: str) -> None:
    if condicion:
        print(f"[OK] {mensaje}")
    else:
        print(f"[ERROR] {mensaje}")
        errores.append(mensaje)


def main() -> int:
    errores: list[str] = []
    print("=" * 80)
    print("AUDITORÍA ESTÁTICA DE PIPELINES")
    print("=" * 80)

    existentes = {p.name for p in SCRIPT_DIR.iterdir() if p.is_file()}
    faltantes = sorted(ARCHIVOS_OBLIGATORIOS - existentes)
    registrar(errores, not faltantes, f"paquete completo; faltantes={faltantes}")

    compilacion = compileall.compile_dir(SCRIPT_DIR, quiet=1)
    registrar(errores, compilacion, "todos los módulos Python compilan")

    rutas_locales: list[str] = []
    cierres_directos: list[str] = []
    finalizadores_faltantes: list[str] = []
    patron_windows = re.compile(r"[A-Za-z]:[\\/](?:Users|Usuarios)[\\/]", re.I)

    for archivo in sorted(SCRIPT_DIR.glob("*.py")):
        texto = archivo.read_text(encoding="utf-8", errors="ignore")
        if patron_windows.search(texto):
            rutas_locales.append(archivo.name)
        if archivo.name not in {"runtime_config.py", "auditar_codigo.py", "pruebas_regresion.py"}:
            if ".close()" in texto:
                cierres_directos.append(archivo.name)
        if '__name__ == "__main__"' in texto and archivo.name != "parquet_metadata.py":
            if "finalizar_proceso" not in texto:
                finalizadores_faltantes.append(archivo.name)

    registrar(errores, not rutas_locales, f"sin rutas locales absolutas; archivos={rutas_locales}")
    registrar(
        errores,
        not cierres_directos,
        f"sin cierres directos de DuckDB; archivos={cierres_directos}",
    )
    registrar(
        errores,
        not finalizadores_faltantes,
        f"scripts ejecutables con finalización segura; archivos={finalizadores_faltantes}",
    )

    try:
        from nombres_modelo import ARCHIVOS_CAPA2

        encontrados = set(ARCHIVOS_CAPA2.values())
        registrar(
            errores,
            encontrados == ARTEFACTOS_CAPA2,
            "contrato de nombres de Capa 2",
        )
    except Exception as exc:
        errores.append(f"No se pudo leer nombres_modelo.py: {exc}")
        print(f"[ERROR] {errores[-1]}")

    modelo = (SCRIPT_DIR / "modelo_relacional.py").read_text(encoding="utf-8")
    stock = modelo[
        modelo.index("def transformar_stock(") : modelo.index("def validar_claves(")
    ]
    etapas = (
        "st_stock_origen",
        "st_stock_tiendas",
        "st_stock_productos",
        "st_stock_base",
        "st_stock_fechas",
        "st_stock_enriquecido",
    )
    registrar(
        errores,
        all(etapa in stock for etapa in etapas),
        "Stock usa etapas materializadas y no una consulta monolítica",
    )
    registrar(
        errores,
        "COUNT(DISTINCT stock_id)" in stock
        and "os.replace(temporal, salida)" in stock,
        "Stock valida antes de publicar",
    )

    ejecutor = (SCRIPT_DIR / "ejecutar_todo.py").read_text(encoding="utf-8")
    registrar(
        errores,
        all(x in ejecutor for x in (
            "crear_backup_salida", "conservar_salida_parcial",
            "confirmar_salida", "estado_ultima_ejecucion.json"
        )) and "restaurar_salida()" not in ejecutor,
        "orquestador con backup y conservación no destructiva de parciales",
    )

    dim_producto = (SCRIPT_DIR / "dim_producto_pipeline.py").read_text(encoding="utf-8")
    registrar(
        errores,
        all(x in dim_producto for x in (
            "PARTITION BY clasificacion_producto_id",
            "prioridad_origen ASC",
            "WHERE rn = 1",
            "verificar_dim_clasificacion()",
        )),
        "DimClasificacionProducto se consolida a una fila única por ID",
    )

    metas = (SCRIPT_DIR / "metas_tiendas_pipeline.py").read_text(encoding="utf-8")
    registrar(
        errores,
        all(x in metas for x in ("normalizar_fila", "validar_filas", "materializar_hoja_csv"))
        and "WITH raw AS" not in metas,
        "Metas usa transformación Python estable y escritura Parquet plana",
    )

    tiendas = (SCRIPT_DIR / "tiendas_pipeline.py").read_text(encoding="utf-8")
    registrar(
        errores,
        "transformar_tiendas" not in tiendas,
        "DimTiendas no se reprocesa innecesariamente después de publicarse",
    )

    maestros = (SCRIPT_DIR / "maestros.py").read_text(encoding="utf-8")
    dim_fecha = (SCRIPT_DIR / "dim_fecha_pipeline.py").read_text(encoding="utf-8")
    dimensiones = (SCRIPT_DIR / "generar_dimensiones_modelo.py").read_text(encoding="utf-8")
    guias = (SCRIPT_DIR / "_base_guias_transito.py").read_text(encoding="utf-8")
    registrar(
        errores,
        all(
            condicion
            for condicion in (
                "ANIO_INICIO_MODELO = 2024" in maestros,
                "ANIO_FIN_MODELO = 2026" in maestros,
                "INTERVAL '1 month' - INTERVAL '1 day'" in dim_fecha,
                "1 month - 1 day" not in dim_fecha,
                "anio_inicio_efectivo = args.anio_inicio" in dimensiones,
                "CAST(fecha_hora_transferencia AS DATE) >= make_date({ANIO_INICIO_MODELO}, 1, 1)" in guias,
            )
        ),
        "política temporal 2024-2026 actual y expansión automática futura",
    )

    generador_tmdl = (SCRIPT_DIR / "generar_modelo_powerbi.py").read_text(encoding="utf-8")
    nombres = (SCRIPT_DIR / "nombres_modelo.py").read_text(encoding="utf-8")
    registrar(
        errores,
        all(x in generador_tmdl for x in (
            'SALIDA_DIR = CAPA2_DIR',
            'TMDL_COMPLETO = CAPA2_DIR / "Modelo_Dashboard.tmdl"',
            'CAPA2_DIR.resolve().as_posix()',
            'bloque_vinculo(vinculo)',
        ))
        and 'generar_manifiesto' not in generador_tmdl
        and 'generar_instrucciones' not in generador_tmdl
        and 'TMDL_RELACIONES' not in generador_tmdl
        and 'TMDL_ENLACES' not in generador_tmdl
        and '"modelo": "Modelo_Dashboard.tmdl"' in nombres,
        "un solo TMDL completo en Capa 2 y ruta regenerada por equipo",
    )

    kpis = (SCRIPT_DIR / "kpis_modelo.py").read_text(encoding="utf-8")
    registrar(
        errores,
        all(x in generador_tmdl for x in (
            "bloque_tabla_medidas", "validar_columnas_kpi",
            "partition Medidas_Interna = m", "Medidas  :"
        ))
        and "Score Integral Tienda" in kpis
        and "Venta Neta" in kpis
        and "Cumplimiento de Meta %" in kpis
        and "Rotación de Inventario S/ por S/" in kpis
        and "Mercadería No Recepcionada Aprox S/" in kpis
        and "COLUMNAS_REQUERIDAS_KPI" in kpis,
        "TMDL incluye tabla Medidas con KPI, carpetas y validación de esquema",
    )

    requirements = (SCRIPT_DIR / "requirements.txt").read_text(encoding="utf-8")
    registrar(
        errores,
        "duckdb==1.5.5" in requirements and "thrift" in requirements,
        "dependencias DuckDB y Thrift declaradas",
    )

    print("=" * 80)
    if errores:
        print(f"AUDITORÍA FALLIDA: {len(errores)} error(es)")
        for error in errores:
            print(f"- {error}")
        return 1
    print("AUDITORÍA CORRECTA")
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
