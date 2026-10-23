"""Prepara salidas comerciales limitadas a una tienda o a un clúster.

No publica ni reemplaza el conjunto general. La publicación debe mantener
estas salidas en rutas privadas y autorizar cada ruta desde la base de datos.
"""

from __future__ import annotations

from typing import Any


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
