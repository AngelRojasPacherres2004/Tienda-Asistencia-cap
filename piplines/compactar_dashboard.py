"""Codifica detalles comerciales sin perder filas ni valores.

Las dimensiones repetidas se guardan una sola vez. El navegador reconstruye
objetos con las mismas claves mediante compact-dashboard.ts.
"""

from __future__ import annotations

import math
from typing import Any


SCHEMAS: dict[str, tuple[str, ...]] = {
    "sellerPerformance": (
        "periodId", "storeId", "category", "line", "subline", "seller", "net", "units", "transactions",
    ),
    "monthlyBrand": ("periodId", "storeId", "category", "line", "subline", "brand", "net", "units"),
    "monthlySubline": (
        "periodId", "storeId", "category", "line", "subline", "gross", "positiveReal",
        "notes", "discount", "net", "transactions", "units", "received",
    ),
    "monthlyPriceRange": (
        "periodId", "storeId", "category", "line", "subline", "bandOrder", "priceBand", "net", "units",
    ),
    "stockHierarchy": (
        "storeId", "category", "line", "subline", "brand", "stockUnits", "stockValue",
        "goodUnits", "units30", "sales30",
    ),
}

DIMENSIONS = frozenset({"periodId", "storeId", "category", "line", "subline", "brand", "priceBand"})
SELLER_GROUP_FIELDS = SCHEMAS["sellerPerformance"][:5]
SELLER_DIMENSIONS = (*SELLER_GROUP_FIELDS, "seller")
DAILY_FIELDS = frozenset({
    "date", "periodId", "year", "month", "storeId", "category", "line", "subline", "brand",
    "bandOrder", "gross", "positiveReal", "notes", "discount", "net", "transactions",
    "units", "target", "traffic", "personnel", "received",
})
HOURLY_FIELDS = frozenset({"date", "periodId", "storeId", "hour", "transactions", "net"})
DAILY_DIMENSIONS = ("date", "storeId", "category", "line", "subline", "brand")
DAILY_OPTIONAL_METRICS = ("net", "target", "traffic", "personnel", "received")
PREDICTIVE_FIELDS = frozenset({
    "storeId", "productId", "units60", "units90", "merma30", "merma60", "merma90",
})
PREDICTIVE_METRICS = ("units60", "units90", "merma30", "merma60", "merma90")
STOCK_METADATA = ("productId", "productCode", "product", "category", "line", "subline", "brand")
STOCK_METRICS = (
    "stockUnits", "stockValue", "goodUnits", "mermaStockUnits", "desmedroStockUnits",
    "units30", "sales30", "units12", "sales12",
)


def compactar_registros(registros: list[dict[str, Any]], clave: str) -> dict[str, Any]:
    if clave == "sellerPerformance":
        return _compactar_vendedores(registros)
    columnas = SCHEMAS[clave]
    esperadas = set(columnas)
    diccionarios: dict[str, list[Any]] = {columna: [] for columna in columnas if columna in DIMENSIONS}
    indices: dict[str, dict[Any, int]] = {columna: {} for columna in diccionarios}
    filas: list[list[Any]] = []
    for registro in registros:
        if set(registro) != esperadas:
            raise ValueError(f"{clave} tiene columnas inesperadas o faltantes: {set(registro) ^ esperadas}")
        fila: list[Any] = []
        for columna in columnas:
            valor = registro[columna]
            if columna in diccionarios:
                indice = indices[columna].get(valor)
                if indice is None:
                    indice = len(diccionarios[columna])
                    indices[columna][valor] = indice
                    diccionarios[columna].append(valor)
                fila.append(indice)
            else:
                fila.append(valor)
        filas.append(fila)
    return {"encoding": "dictionary-v1", "columns": columnas, "dictionary": diccionarios, "rows": filas}


def _compactar_vendedores(registros: list[dict[str, Any]]) -> dict[str, Any]:
    esperadas = set(SCHEMAS["sellerPerformance"])
    diccionarios: dict[str, list[Any]] = {columna: [] for columna in SELLER_DIMENSIONS}
    indices: dict[str, dict[Any, int]] = {columna: {} for columna in SELLER_DIMENSIONS}
    grupos: list[list[int]] = []
    indices_grupos: dict[tuple[int, ...], int] = {}
    filas: list[list[Any]] = []
    for registro in registros:
        if set(registro) != esperadas:
            raise ValueError(f"sellerPerformance tiene columnas inesperadas o faltantes: {set(registro) ^ esperadas}")
        dimension: dict[str, int] = {}
        for columna in SELLER_DIMENSIONS:
            valor = registro[columna]
            indice = indices[columna].get(valor)
            if indice is None:
                indice = len(diccionarios[columna])
                indices[columna][valor] = indice
                diccionarios[columna].append(valor)
            dimension[columna] = indice
        grupo = tuple(dimension[columna] for columna in SELLER_GROUP_FIELDS)
        indice_grupo = indices_grupos.get(grupo)
        if indice_grupo is None:
            indice_grupo = len(grupos)
            indices_grupos[grupo] = indice_grupo
            grupos.append(list(grupo))
        fila = [indice_grupo, dimension["seller"], registro["net"], registro["units"]]
        if registro["transactions"] != registro["units"] or type(registro["transactions"]) is not type(registro["units"]):
            fila.append(registro["transactions"])
        filas.append(fila)
    return {
        "encoding": "seller-grouped-v1",
        "groupColumns": SELLER_GROUP_FIELDS,
        "dictionary": diccionarios,
        "groups": grupos,
        "rows": filas,
    }


def descompactar_registros(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if payload.get("encoding") == "seller-grouped-v1":
        diccionarios = payload["dictionary"]
        grupos = payload["groups"]
        return [
            {
                **{
                    columna: diccionarios[columna][indice]
                    for columna, indice in zip(payload["groupColumns"], grupos[fila[0]], strict=True)
                },
                "seller": diccionarios["seller"][fila[1]],
                "net": fila[2],
                "units": fila[3],
                "transactions": fila[4] if len(fila) == 5 else fila[3],
            }
            for fila in payload["rows"]
        ]
    if payload.get("encoding") != "dictionary-v1":
        raise ValueError("Formato de detalle desconocido")
    columnas = payload["columns"]
    diccionarios = payload["dictionary"]
    return [
        {
            columna: diccionarios[columna][valor] if columna in diccionarios else valor
            for columna, valor in zip(columnas, fila, strict=True)
        }
        for fila in payload["rows"]
    ]


def compactar_diario(diario: list[dict[str, Any]], horas: list[dict[str, Any]]) -> dict[str, Any]:
    diccionarios: dict[str, list[Any]] = {columna: [] for columna in DAILY_DIMENSIONS}
    indices: dict[str, dict[Any, int]] = {columna: {} for columna in DAILY_DIMENSIONS}

    def indice(columna: str, valor: Any) -> int:
        existente = indices[columna].get(valor)
        if existente is not None:
            return existente
        nuevo = len(diccionarios[columna])
        indices[columna][valor] = nuevo
        diccionarios[columna].append(valor)
        return nuevo

    filas_diarias: list[list[Any]] = []
    for registro in diario:
        if set(registro) != DAILY_FIELDS:
            raise ValueError(f"dailyStore tiene columnas inesperadas o faltantes: {set(registro) ^ DAILY_FIELDS}")
        fecha = registro["date"]
        if (int(fecha[:4]), int(fecha[5:7]), int(fecha[:4]) * 100 + int(fecha[5:7])) != (
            registro["year"], registro["month"], registro["periodId"],
        ):
            raise ValueError("dailyStore tiene fecha y período inconsistentes")
        fila = [indice(columna, registro[columna]) for columna in DAILY_DIMENSIONS]
        fila.extend(registro[columna] for columna in (
            "bandOrder", "gross", "positiveReal", "notes", "discount", "transactions", "units",
        ))
        valores = [registro[columna] for columna in DAILY_OPTIONAL_METRICS]
        presentes = [
            valores[0] != registro["positiveReal"] or type(valores[0]) is not type(registro["positiveReal"]),
            *(valor != 0 or type(valor) is not float for valor in valores[1:]),
        ]
        mascara = sum(1 << posicion for posicion, presente in enumerate(presentes) if presente)
        fila.append(mascara)
        fila.extend(valor for valor, presente in zip(valores, presentes, strict=True) if presente)
        filas_diarias.append(fila)

    filas_horarias: list[list[Any]] = []
    for registro in horas:
        if set(registro) != HOURLY_FIELDS:
            raise ValueError(f"hourlySales tiene columnas inesperadas o faltantes: {set(registro) ^ HOURLY_FIELDS}")
        fecha = registro["date"]
        if int(fecha[:4]) * 100 + int(fecha[5:7]) != registro["periodId"]:
            raise ValueError("hourlySales tiene fecha y período inconsistentes")
        filas_horarias.append([
            indice("date", fecha), indice("storeId", registro["storeId"]),
            registro["hour"], registro["transactions"], registro["net"],
        ])
    return {"encoding": "daily-v1", "dictionary": diccionarios, "dailyStore": filas_diarias, "hourlySales": filas_horarias}


def descompactar_diario(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    if payload.get("encoding") != "daily-v1":
        raise ValueError("Formato diario desconocido")
    diccionarios = payload["dictionary"]
    diario = []
    for fila in payload["dailyStore"]:
        fecha, tienda, rubro, linea, sublinea, marca = (
            diccionarios[columna][fila[posicion]]
            for posicion, columna in enumerate(DAILY_DIMENSIONS)
        )
        mascara = fila[13]
        valores = iter(fila[14:])
        opcionales = [next(valores) if mascara & (1 << posicion) else (fila[8] if posicion == 0 else 0.0)
                     for posicion in range(len(DAILY_OPTIONAL_METRICS))]
        anio = int(fecha[:4]); mes = int(fecha[5:7])
        diario.append({
            "date": fecha, "periodId": anio * 100 + mes, "year": anio, "month": mes,
            "storeId": tienda, "category": rubro, "line": linea, "subline": sublinea, "brand": marca,
            "bandOrder": fila[6], "gross": fila[7], "positiveReal": fila[8], "notes": fila[9],
            "discount": fila[10], "net": opcionales[0], "transactions": fila[11], "units": fila[12],
            "target": opcionales[1], "traffic": opcionales[2], "personnel": opcionales[3], "received": opcionales[4],
        })
    horas = []
    for fila in payload["hourlySales"]:
        fecha = diccionarios["date"][fila[0]]
        horas.append({
            "date": fecha, "periodId": int(fecha[:4]) * 100 + int(fecha[5:7]),
            "storeId": diccionarios["storeId"][fila[1]], "hour": fila[2], "transactions": fila[3], "net": fila[4],
        })
    return {"dailyStore": diario, "hourlySales": horas}


def compactar_predictivo(registros: list[dict[str, Any]], nota: str) -> dict[str, Any]:
    diccionarios: dict[str, list[str]] = {"storeId": [], "productId": []}
    indices: dict[str, dict[str, int]] = {"storeId": {}, "productId": {}}
    filas: list[list[Any]] = []
    for registro in registros:
        if set(registro) != PREDICTIVE_FIELDS:
            raise ValueError(f"predictiveRows tiene columnas inesperadas o faltantes: {set(registro) ^ PREDICTIVE_FIELDS}")
        fila: list[Any] = []
        for columna in ("storeId", "productId"):
            valor = registro[columna]
            indice = indices[columna].get(valor)
            if indice is None:
                indice = len(diccionarios[columna])
                indices[columna][valor] = indice
                diccionarios[columna].append(valor)
            fila.append(indice)
        valores = [registro[columna] for columna in PREDICTIVE_METRICS]
        presentes = [
            valores[0] != 0 or type(valores[0]) is not float,
            valores[1] != valores[0] or type(valores[1]) is not type(valores[0]),
            *(valor != 0 or type(valor) is not float for valor in valores[2:]),
        ]
        mascara = sum(1 << posicion for posicion, presente in enumerate(presentes) if presente)
        fila.append(mascara)
        fila.extend(valor for valor, presente in zip(valores, presentes, strict=True) if presente)
        filas.append(fila)
    return {"encoding": "predictive-v1", "note": nota, "dictionary": diccionarios, "rows": filas}


def descompactar_predictivo(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("encoding") != "predictive-v1":
        raise ValueError("Formato predictivo desconocido")
    diccionarios = payload["dictionary"]
    registros: list[dict[str, Any]] = []
    for fila in payload["rows"]:
        mascara = fila[2]
        valores = iter(fila[3:])
        metricas: list[Any] = []
        for posicion in range(len(PREDICTIVE_METRICS)):
            metricas.append(
                next(valores) if mascara & (1 << posicion)
                else metricas[0] if posicion == 1 else 0.0
            )
        registros.append({
            "storeId": diccionarios["storeId"][fila[0]],
            "productId": diccionarios["productId"][fila[1]],
            **dict(zip(PREDICTIVE_METRICS, metricas, strict=True)),
        })
    return {"note": payload["note"], "rows": registros}


def compactar_stock(registros: list[dict[str, Any]]) -> dict[str, Any]:
    """Comparte metadatos de SKU entre tiendas y omite métricas por defecto."""
    productos: list[list[Any]] = []
    tiendas: list[str] = []
    indices_producto: dict[str, int] = {}
    indices_tienda: dict[str, int] = {}
    filas: list[list[Any]] = []
    for registro in registros:
        esperado = {"storeId", *STOCK_METADATA, *STOCK_METRICS}
        if set(registro) != esperado:
            raise ValueError(f"stockProducts tiene columnas inesperadas o faltantes: {set(registro) ^ esperado}")
        producto_id = registro["productId"]
        metadatos = [registro[campo] for campo in STOCK_METADATA]
        indice_producto = indices_producto.get(producto_id)
        if indice_producto is None:
            indice_producto = len(productos)
            indices_producto[producto_id] = indice_producto
            productos.append(metadatos)
        elif productos[indice_producto] != metadatos:
            raise ValueError(f"El SKU {producto_id} tiene metadatos incompatibles entre tiendas")
        tienda_id = registro["storeId"]
        indice_tienda = indices_tienda.get(tienda_id)
        if indice_tienda is None:
            indice_tienda = len(tiendas)
            indices_tienda[tienda_id] = indice_tienda
            tiendas.append(tienda_id)
        unidades = registro["stockUnits"]
        valores = [registro[campo] for campo in STOCK_METRICS[1:]]
        por_defecto = [0.0, unidades, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        presentes = [valor != defecto or type(valor) is not type(defecto)
                     for valor, defecto in zip(valores, por_defecto, strict=True)]
        mascara = sum(1 << i for i, presente in enumerate(presentes) if presente)
        filas.append([indice_tienda, indice_producto, unidades, mascara,
                      *(valor for valor, presente in zip(valores, presentes, strict=True) if presente)])
    return {"encoding": "stock-v1", "stores": tiendas, "products": productos, "rows": filas}


def descompactar_stock(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if payload.get("encoding") != "stock-v1":
        raise ValueError("Formato de stock desconocido")
    resultado: list[dict[str, Any]] = []
    for fila in payload["rows"]:
        unidades = fila[2]
        mascara = fila[3]
        valores = iter(fila[4:])
        por_defecto = [0.0, unidades, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        metricas = [unidades, *[
            next(valores) if mascara & (1 << i) else defecto
            for i, defecto in enumerate(por_defecto)
        ]]
        producto = payload["products"][fila[1]]
        resultado.append({
            "storeId": payload["stores"][fila[0]],
            **dict(zip(STOCK_METADATA, producto, strict=True)),
            **dict(zip(STOCK_METRICS, metricas, strict=True)),
        })
    return resultado


def resumir_stock_jerarquia(registros: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Suma medidas aditivas por tienda y jerarquía para gráficos generales."""
    dimensiones = SCHEMAS["stockHierarchy"][:5]
    metricas = SCHEMAS["stockHierarchy"][5:]
    grupos: dict[tuple[str, ...], dict[str, Any]] = {}
    for registro in registros:
        clave = tuple(registro[campo] for campo in dimensiones)
        fila = grupos.get(clave)
        if fila is None:
            fila = {**dict(zip(dimensiones, clave, strict=True)), **{campo: 0.0 for campo in metricas}}
            grupos[clave] = fila
        for campo in metricas:
            fila[campo] += float(registro[campo])
    return list(grupos.values())


def candidatos_traslado(registros: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Conserva los SKU capaces de generar una ruta con las reglas actuales."""
    posiciones: dict[str, dict[str, list[float]]] = {}
    for registro in registros:
        producto = str(registro["productId"] or "").strip()
        if not producto:
            continue
        tienda = registro["storeId"]
        grupo = posiciones.setdefault(producto, {}).setdefault(tienda, [0.0, 0.0])
        grupo[0] += max(0.0, float(registro["goodUnits"] if registro["goodUnits"] is not None
                                     else registro["stockUnits"] * .82))
        grupo[1] += float(registro["units30"])
    candidatos: set[str] = set()
    for producto, tiendas in posiciones.items():
        donantes: set[str] = set()
        receptores: set[str] = set()
        for tienda, (stock, ventas) in tiendas.items():
            ventas = max(0.0, ventas)
            diario = ventas / 30
            dias = stock / diario if diario > 0 else None
            disponible = max(0, math.floor(stock - diario * 30))
            faltante = max(0, math.ceil(diario * 30 - stock))
            if disponible > 0 and (ventas == 0 or dias is not None and dias > 90):
                donantes.add(tienda)
            if ventas > 0 and dias is not None and dias < 30 and faltante > 0:
                receptores.add(tienda)
        if any(origen != destino for origen in donantes for destino in receptores):
            candidatos.add(producto)
    return [registro for registro in registros if registro["productId"] in candidatos]
