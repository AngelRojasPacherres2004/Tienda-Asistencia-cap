from __future__ import annotations

"""Nombres únicos de los artefactos finales del modelo."""

from pathlib import Path

from project_paths import CAPA2_DIR, POWERBI_DIR, preparar_directorios

ARCHIVOS_CAPA2 = {
    "DimFecha": "DimFecha.parquet",
    "DimFechaOrigenStock": "DimFechaOrigenStock.parquet",
    "DimTiendas": "DimTiendas.parquet",
    "DimClasificacionProducto": "DimClasificacionProducto.parquet",
    "DimProducto": "DimProducto.parquet",
    "FactVentas": "FactVentas.parquet",
    "FactIngresos": "FactIngresos.parquet",
    "FactTransferencias": "FactTransferencias.parquet",
    "FactGuiasTransito": "FactGuiasTransito.parquet",
    "FactStock": "FactStock.parquet",
    "FactMerma": "FactMerma.parquet",
    "FactMetasTienda": "FactMetasTienda.parquet",
    "FactPersonalTienda": "FactPersonalTienda.parquet",
    "FactTraficoClientes": "FactTraficoClientes.parquet",
}

ARCHIVOS_TMDL = {
    "modelo": "Modelo_Dashboard.tmdl",
}

ARCHIVOS_TMDL_LEGACY = {
    "Enlaces_Dashboard.tmdl",
    "Relaciones_Dashboard.tmdl",
    "modelo_manifest.json",
    "ABRIR_EN_POWER_BI.txt",
}

# Archivos creados por versiones anteriores. Se eliminan al iniciar Capa 2 para
# que esa carpeta contenga únicamente los Parquet finales vigentes.
LEGACY_CAPA2 = {
    "Dim_Fecha.parquet",
    "Dim_Tiendas.parquet",
    "Dim_Clasificacion_Producto.parquet",
    "Dim_Producto.parquet",
    "Fact_Ventas.parquet",
    "Fact_Ingresos.parquet",
    "Fact_Transferencias.parquet",
    "Fact_Guias_Transito.parquet",
    "Fact_Stock.parquet",
    "Fact_Merma.parquet",
    "Fact_Metas_Tienda.parquet",
    "Fact_Personal_Tienda.parquet",
    "Fact_Trafico_Clientes.parquet",
    "Fact_Ventas_Limpia.parquet",
    "Fact_Ingresos_Limpia.parquet",
    "Fact_Transferencias_Limpia.parquet",
    "Fact_Guias_Transito_Limpia.parquet",
    "Fact_Stock_Limpia.parquet",
}


def archivo_capa2(tabla: str) -> Path:
    return CAPA2_DIR / ARCHIVOS_CAPA2[tabla]


def limpiar_capa2_generada() -> None:
    """Vacía solamente los artefactos generados de Capa 2."""
    preparar_directorios()
    # Capa 2 es una zona completamente regenerable. Se eliminan todos los
    # Parquet anteriores para impedir que convivan versiones antiguas, archivos
    # con sufijo _Limpia o modelos de ejecuciones incompletas.
    for archivo in CAPA2_DIR.glob("*.parquet"):
        archivo.unlink(missing_ok=True)
    for archivo in CAPA2_DIR.glob("*.parquet.tmp"):
        archivo.unlink(missing_ok=True)
    (CAPA2_DIR / "Reporte_Cobertura.json").unlink(missing_ok=True)


def limpiar_modelo_powerbi() -> None:
    preparar_directorios()
    nombres = set(ARCHIVOS_TMDL.values()) | ARCHIVOS_TMDL_LEGACY
    for nombre in nombres:
        (CAPA2_DIR / nombre).unlink(missing_ok=True)
        (POWERBI_DIR / nombre).unlink(missing_ok=True)
    if POWERBI_DIR.exists():
        try:
            POWERBI_DIR.rmdir()
        except OSError:
            pass


def validar_contenido_capa2() -> tuple[list[str], list[str]]:
    preparar_directorios()
    encontrados = sorted(p.name for p in CAPA2_DIR.glob("*.parquet"))
    permitidos = set(ARCHIVOS_CAPA2.values())
    extras = sorted(set(encontrados) - permitidos)
    return encontrados, extras
