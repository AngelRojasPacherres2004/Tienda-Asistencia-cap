"""Prepara salidas comerciales limitadas a una tienda o a un clúster.

No publica ni reemplaza el conjunto general. La publicación debe mantener
estas salidas en rutas privadas y autorizar cada ruta desde la base de datos.
"""

from __future__ import annotations

from typing import Any

from compactar_dashboard import (
    SCHEMAS, compactar_diario, compactar_predictivo, compactar_registros, compactar_stock, compactar_tallas,
    descompactar_diario, descompactar_predictivo, descompactar_registros, descompactar_stock, descompactar_tallas,
)


GLOBAL_FIELDS = frozenset({"note"})
PRIVATE_METADATA_FIELDS = frozenset({"sourceCoverage", "dataWarnings"})


def scope_payload(payload: dict[str, Any], allowed_store_ids: set[str]) -> dict[str, Any]:
    """Quita métricas de otras tiendas y rechaza estructuras desconocidas."""

    if not allowed_store_ids:
        raise ValueError("El alcance comercial no contiene tiendas")
    result: dict[str, Any] = {}
    for name, value in payload.items():
        if name == "metadata":
            if not isinstance(value, dict):
                raise ValueError("metadata debe ser un objeto")
            result[name] = {key: item for key, item in value.items() if key not in PRIVATE_METADATA_FIELDS}
        elif name in GLOBAL_FIELDS:
            result[name] = value
        elif name == "dailyCompact" and isinstance(value, dict) and value.get("encoding") == "daily-v1":
            decoded = descompactar_diario(value)
            if any(not isinstance(row.get("storeId"), str) for rows in decoded.values() for row in rows):
                raise ValueError("dailyCompact no tiene storeId; no se puede publicar con seguridad")
            result[name] = compactar_diario(
                [row for row in decoded["dailyStore"] if row["storeId"] in allowed_store_ids],
                [row for row in decoded["hourlySales"] if row["storeId"] in allowed_store_ids],
            )
        elif name == "predictiveCompact" and isinstance(value, dict) and value.get("encoding") == "predictive-v1":
            decoded = descompactar_predictivo(value)
            if any(not isinstance(row.get("storeId"), str) for row in decoded["rows"]):
                raise ValueError("predictiveCompact no tiene storeId; no se puede publicar con seguridad")
            result[name] = compactar_predictivo(
                [row for row in decoded["rows"] if row["storeId"] in allowed_store_ids],
                decoded["note"],
            )
        elif name == "stockCompact" and isinstance(value, dict) and value.get("encoding") == "stock-v1":
            decoded = descompactar_stock(value)
            if any(not isinstance(row.get("storeId"), str) for row in decoded):
                raise ValueError("stockCompact no tiene storeId; no se puede publicar con seguridad")
            result[name] = compactar_stock([row for row in decoded if row["storeId"] in allowed_store_ids])
        elif name == "sizeCompact" and isinstance(value, dict) and value.get("encoding") == "sizes-v1":
            decoded = descompactar_tallas(value)
            if any(not isinstance(row.get("storeId"), str) for row in decoded):
                raise ValueError("sizeCompact no tiene storeId; no se puede publicar con seguridad")
            result[name] = compactar_tallas(
                [row for row in decoded if row["storeId"] in allowed_store_ids], value["category"],
            )
        elif name in SCHEMAS and isinstance(value, dict) and value.get("encoding") in {"dictionary-v1", "seller-grouped-v1"}:
            if value["encoding"] == "seller-grouped-v1" and name != "sellerPerformance":
                raise ValueError(f"Codificación de vendedores inesperada para {name}")
            rows = descompactar_registros(value)
            if any(not isinstance(row.get("storeId"), str) for row in rows):
                raise ValueError(f"{name} no tiene storeId; no se puede publicar con seguridad")
            result[name] = compactar_registros(
                [row for row in rows if row["storeId"] in allowed_store_ids], name,
            )
        elif isinstance(value, list):
            if name == "hierarchyCatalog":
                source_lines = payload.get("monthlyLine", [])
                visible_lines = {
                    (row.get("category"), row.get("line"))
                    for row in source_lines
                    if isinstance(row, dict) and row.get("storeId") in allowed_store_ids
                }
                result[name] = [row for row in value if isinstance(row, dict) and
                                (row.get("category"), row.get("line")) in visible_lines]
            elif not value:
                result[name] = []
            elif all(isinstance(row, dict) and isinstance(row.get("storeId"), str) for row in value):
                result[name] = [row for row in value if row["storeId"] in allowed_store_ids]
            else:
                raise ValueError(f"{name} no tiene storeId; no se puede publicar con seguridad")
        else:
            raise ValueError(f"Campo desconocido en JSON comercial: {name}")
    return result


def scope_catalog(stores: list[dict[str, Any]]) -> dict[tuple[str, str], set[str]]:
    """Construye los alcances de tiendas y clústeres desde el catálogo publicado."""

    result: dict[tuple[str, str], set[str]] = {}
    for store in stores:
        if not store.get("isStore"):
            continue
        store_id = str(store.get("storeId") or "")
        cluster = str(store.get("cluster") or "")
        if not store_id or not cluster:
            raise ValueError("Una tienda comercial no tiene código o clúster")
        result[("store", store_id)] = {store_id}
        result.setdefault(("cluster", cluster), set()).add(store_id)
    if not result:
        raise ValueError("El catálogo comercial no contiene tiendas")
    return result
