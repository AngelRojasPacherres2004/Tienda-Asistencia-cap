from __future__ import annotations
from runtime_config import finalizar_proceso

import argparse
import csv
import json
import sys
from pathlib import Path

from parquet_metadata import metadata
from xlsx_staging import materializar_hoja_csv, nombres_hojas

from project_paths import PROJECT_ROOT
BASE_DIR = PROJECT_ROOT
CAPA1_DIR = BASE_DIR / "capa1"

PARQUET_REQUERIDOS = {
    "Fact_Ventas.parquet": {
        "FECHA Y HORA VENTA", "NRO VTA", "TIENDA", "CODIGO NISSEI",
        "PROVEEDOR", "RUBRO", "LINEA", "SUB LINEA", "MARCA", "CANT",
        "TOTAL VENTA", "archivo_origen", "hoja_origen", "fila_origen",
    },
    "Fact_Ingresos.parquet": {
        "FECHA INGRESO", "TIENDA", "CODIGO NISSEI", "PROVEEDOR", "DEP",
        "LINEA", "SUB LINEA", "MARCA", "CANTIDAD RECIBIDA", "TOTAL",
        "archivo_origen", "hoja_origen", "fila_origen",
    },
    "Fact_Transferencias.parquet": {
        "FECHA", "SERIE Y NRO GUIA", "TDA ORIGEN", "TDA DESTINO",
        "CODIGO NISSEI", "PROVEEDOR", "DEP", "LINEA", "SUB LINEA",
        "MARCA", "CANT", "TOTAL", "archivo_origen", "hoja_origen",
        "fila_origen",
    },
}

PARQUET_OPCIONALES = {
    "Fact_Stock.parquet": set(),
}

EXCEL_MANUALES = {
    "TIENDAS.xlsx": ("TIENDAS", {
        "tienda", "tipo_ubicacion", "formato_tienda", "cluster",
        "metraje_m2", "departamento", "provincia", "distrito", "direccion",
        "fecha_apertura", "estado_operativo", "fecha_cierre",
    }),
    "CATALOGO_TIENDAS.xlsx": ("CATALOGO", {
        "rls_codigo", "rubro_codigo", "rubro", "linea", "sub_linea",
        "jerarquia_original",
    }),
    "GUIAS_EN_TRANSITO.xlsx": ("GUIAS_EN_TRANSITO_C1", {
        "fecha_hora_transferencia", "estado_transferencia", "nro_guia",
        "tienda_origen", "tienda_destino", "codigo_nissei", "proveedor",
        "lote", "departamento_codigo", "rubro", "linea", "sub_linea",
        "marca", "modelo", "descripcion", "modelo_codigo", "cantidad",
        "precio_sugerido", "total_transferencia", "fecha_hora_creacion",
    }),
    "MERMA.xlsx": ("MERMA", {
        "fecha_periodo", "fecha_ocurrencia", "anio", "mes_numero",
        "mes_nombre", "tienda", "area", "tipo_merma", "detalle_ocurrencia",
        "codigo_nissei", "descripcion", "cantidad", "precio_unitario",
        "total_merma",
    }),
    "METAS_TIENDAS.xlsx": ("METAS_TIENDAS", {
        "fecha_periodo", "anio", "mes_numero", "mes_nombre",
        "nivel_periodo", "tienda", "meta_ventas",
    }),
    "PERSONAL_TIENDAS.xlsx": ("PERSONAL_TIENDAS", {
        "fecha_inicio_periodo", "fecha_corte", "tienda", "cargo",
        "area_asignada", "cantidad_personal",
    }),
    "TRAFICO_CLIENTES.xlsx": ("TRAFICO_CLIENTE", {
        "fecha", "tienda", "cantidad_personas", "estado_registro",
    }),
}


def auditar_parquet(nombre: str, requeridas: set[str], obligatorio: bool) -> dict:
    ruta = CAPA1_DIR / nombre
    if not ruta.exists():
        return {
            "archivo": nombre,
            "tipo": "parquet",
            "estado": "ERROR" if obligatorio else "ADVERTENCIA",
            "detalle": "archivo no encontrado",
        }
    try:
        meta = metadata(ruta)
        columnas = [e.get("name") for e in meta["schema"][1:]]
        faltantes = sorted(requeridas - set(columnas))
        return {
            "archivo": nombre,
            "tipo": "parquet",
            "estado": "ERROR" if faltantes else "OK",
            "filas": int(meta.get("num_rows", 0)),
            "columnas": len(columnas),
            "faltantes": faltantes,
            "creado_por": meta.get("created_by"),
        }
    except Exception as exc:
        return {
            "archivo": nombre,
            "tipo": "parquet",
            "estado": "ERROR",
            "detalle": str(exc),
        }


def auditar_excel(nombre: str, hoja: str, requeridas: set[str]) -> dict:
    ruta = CAPA1_DIR / nombre
    if not ruta.exists():
        return {
            "archivo": nombre,
            "tipo": "excel",
            "estado": "ERROR",
            "detalle": "archivo no encontrado",
        }
    try:
        disponibles = nombres_hojas(ruta)
        if hoja not in disponibles:
            return {
                "archivo": nombre,
                "tipo": "excel",
                "estado": "ERROR",
                "detalle": f"falta hoja {hoja}; disponibles={disponibles}",
            }
        csv_path = materializar_hoja_csv(ruta, hoja)
        with csv_path.open(encoding="utf-8", newline="") as archivo:
            lector = csv.reader(archivo)
            encabezado = next(lector, [])
            filas = sum(1 for _ in lector)
        faltantes = sorted(requeridas - set(encabezado))
        return {
            "archivo": nombre,
            "tipo": "excel",
            "hoja": hoja,
            "estado": "ERROR" if faltantes else "OK",
            "filas": filas,
            "columnas": len(encabezado),
            "faltantes": faltantes,
            "staging": str(csv_path.relative_to(BASE_DIR)),
        }
    except Exception as exc:
        return {
            "archivo": nombre,
            "tipo": "excel",
            "estado": "ERROR",
            "detalle": str(exc),
        }


def ejecutar_auditoria() -> list[dict]:
    resultados = [
        auditar_parquet(nombre, requeridas, True)
        for nombre, requeridas in PARQUET_REQUERIDOS.items()
    ]
    resultados.extend(
        auditar_parquet(nombre, requeridas, False)
        for nombre, requeridas in PARQUET_OPCIONALES.items()
    )
    resultados.extend(
        auditar_excel(nombre, hoja, requeridas)
        for nombre, (hoja, requeridas) in EXCEL_MANUALES.items()
    )
    return resultados


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audita Capa 1 sin modificar los archivos de origen."
    )
    parser.add_argument(
        "--json",
        type=Path,
        default=BASE_DIR / "auditoria_entradas.json",
        help="Ruta del informe JSON.",
    )
    args = parser.parse_args()

    resultados = ejecutar_auditoria()
    args.json.write_text(
        json.dumps(resultados, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("=" * 82)
    print("AUDITORÍA DE ENTRADAS DE CAPA 1")
    print("=" * 82)
    for r in resultados:
        resumen = f"[{r['estado']}] {r['archivo']}"
        if "filas" in r:
            resumen += f" | filas={r['filas']:,} | columnas={r['columnas']}"
        if r.get("faltantes"):
            resumen += f" | faltantes={r['faltantes']}"
        if r.get("detalle"):
            resumen += f" | {r['detalle']}"
        print(resumen)
    print(f"Informe JSON: {args.json}")

    return 1 if any(r["estado"] == "ERROR" for r in resultados) else 0


if __name__ == "__main__":
    finalizar_proceso(main())
