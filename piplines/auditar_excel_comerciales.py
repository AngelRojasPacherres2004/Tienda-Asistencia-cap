from __future__ import annotations
from runtime_config import finalizar_proceso

"""Auditoría rápida y sin DuckDB de los Excel manuales de Capa 1.

Valida contratos de columnas, claves de negocio, valores obligatorios y cobertura
contra TIENDAS.xlsx. Usa el staging CSV cacheado, por lo que no vuelve a abrir el
Excel si el archivo no cambió.
"""

import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from maestros import ANIO_INICIO_MODELO, TIENDAS_EQUIVALENCIAS, clave_texto
from project_paths import CAPA1_DIR, PROJECT_ROOT
from xlsx_staging import materializar_hoja_csv

SALIDA = PROJECT_ROOT / "auditoria_excel_comerciales.json"

CONTRATOS = {
    "tiendas": {
        "archivo": "TIENDAS.xlsx", "palabras": ("TIENDA",), "hoja": "TIENDAS",
        "columnas": ("tienda", "Alias", "tipo_ubicacion", "formato_tienda", "cluster", "metraje_m2", "capacidad_stock_unid", "cant_colaboradores_normal", "colaboradores_camp", "departamento", "provincia", "distrito", "direccion", "fecha_apertura", "estado_operativo", "fecha_cierre"),
    },
    "catalogo": {
        "archivo": "CATALOGO_TIENDAS.xlsx", "palabras": ("CATALOGO", "TIENDA"), "hoja": "CATALOGO",
        "columnas": ("rls_codigo", "rubro_codigo", "rubro", "linea", "sub_linea", "jerarquia_original"),
    },
    "guias": {
        "archivo": "GUIAS_EN_TRANSITO.xlsx", "palabras": ("GUIA", "TRANSITO"), "hoja": "GUIAS_EN_TRANSITO_C1",
        "columnas": ("fecha_hora_transferencia", "estado_transferencia", "nro_guia", "tienda_origen", "tienda_destino", "codigo_nissei", "proveedor", "lote", "departamento_codigo", "rubro", "linea", "sub_linea", "marca", "modelo", "descripcion", "modelo_codigo", "cantidad", "precio_sugerido", "total_transferencia", "fecha_hora_creacion"),
    },
    "merma": {
        "archivo": "MERMA.xlsx", "palabras": ("MERMA",), "hoja": "MERMA",
        "columnas": ("fecha_periodo", "fecha_ocurrencia", "anio", "mes_numero", "mes_nombre", "tienda", "area", "tipo_merma", "detalle_ocurrencia", "codigo_nissei", "descripcion", "cantidad", "precio_unitario", "total_merma"),
    },
    "metas": {
        "archivo": "METAS_TIENDAS.xlsx", "palabras": ("META", "TIENDA"), "hoja": "METAS",
        "columnas": ("anio", "mes_numero", "mes_nombre", "tienda", "meta_total", "meta_textil", "meta_calzado", "otros_validos"),
    },
    "personal": {
        "archivo": "PERSONAL_TIENDAS.xlsx", "palabras": ("PERSONAL", "TIENDA"), "hoja": "PERSONAL_TIENDAS",
        "columnas": ("nombre_completo", "numero_documento", "tienda", "puesto", "area", "fecha_ingreso", "estado_laboral", "fecha_retiro"),
    },
    "trafico": {
        "archivo": "TRAFICO_CLIENTES.xlsx", "palabras": ("TRAFICO", "CLIENTE"), "hoja": "TRAFICO_CLIENTE",
        "columnas": ("fecha", "tienda", "cantidad_personas", "estado_registro"),
    },
}


def normalizar_archivo(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto.upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"[^A-Z0-9]+", " ", texto).strip()


def buscar_archivo(contrato: dict[str, Any]) -> Path:
    exacto = CAPA1_DIR / contrato["archivo"]
    if exacto.exists():
        return exacto
    candidatos = []
    for p in CAPA1_DIR.glob("*.xlsx"):
        if p.name.startswith("~$"):
            continue
        clave = normalizar_archivo(p.stem)
        if all(palabra in clave for palabra in contrato["palabras"]):
            candidatos.append(p)
    if len(candidatos) != 1:
        raise RuntimeError(
            f"No se pudo resolver {contrato['archivo']}; candidatos={[p.name for p in candidatos]}"
        )
    return candidatos[0]


def cargar(nombre: str) -> tuple[Path, list[str], list[dict[str, str]]]:
    contrato = CONTRATOS[nombre]
    archivo = buscar_archivo(contrato)
    csv_path = materializar_hoja_csv(archivo, contrato["hoja"])
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        lector = csv.DictReader(f)
        columnas = [str(c or "").strip() for c in (lector.fieldnames or [])]
        filas = [dict(fila) for fila in lector]
    faltan = [c for c in contrato["columnas"] if c not in columnas]
    if faltan:
        raise RuntimeError(
            f"{archivo.name}/{contrato['hoja']}: faltan columnas {faltan}; encontradas={columnas}"
        )
    return archivo, columnas, filas


def vacio(valor: Any) -> bool:
    return valor is None or str(valor).strip() == ""


def numero(valor: Any) -> float | None:
    if vacio(valor):
        return None
    texto = str(valor).strip().replace(" ", "")
    try:
        if "," in texto and "." not in texto:
            texto = texto.replace(",", ".")
        else:
            texto = texto.replace(",", "")
        resultado = float(texto)
        return resultado if math.isfinite(resultado) else None
    except ValueError:
        return None


def fecha_excel(valor: Any) -> date | None:
    if vacio(valor):
        return None
    n = numero(valor)
    if n is not None and 1 <= n <= 100000:
        return (datetime(1899, 12, 30) + timedelta(days=n)).date()
    texto = str(valor).strip()
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            pass
    return None


_MAPA_TIENDAS = {clave_texto(k): v for k, v in TIENDAS_EQUIVALENCIAS.items()}


def tienda(valor: Any) -> str | None:
    if vacio(valor):
        return None
    raw = str(valor).strip().upper()
    return _MAPA_TIENDAS.get(clave_texto(raw), raw)


def duplicados(claves: list[tuple[Any, ...]]) -> tuple[int, int]:
    conteo = Counter(claves)
    return sum(v - 1 for v in conteo.values() if v > 1), sum(v > 1 for v in conteo.values())


def agregar(resultado: dict[str, Any], severidad: str, mensaje: str) -> None:
    resultado[severidad].append(mensaje)


def auditar() -> dict[str, Any]:
    resultado: dict[str, Any] = {"estado": "OK", "errores": [], "advertencias": [], "archivos": {}}
    datos: dict[str, list[dict[str, str]]] = {}
    for nombre in CONTRATOS:
        archivo, columnas, filas = cargar(nombre)
        datos[nombre] = filas
        resultado["archivos"][nombre] = {
            "archivo": archivo.name, "hoja": CONTRATOS[nombre]["hoja"],
            "filas": len(filas), "columnas": len(columnas), "estado": "OK",
        }

    maestras = [tienda(r["tienda"]) for r in datos["tiendas"] if not vacio(r["tienda"])]
    repetidas, grupos = duplicados([(x,) for x in maestras])
    if repetidas:
        agregar(resultado, "errores", f"TIENDAS: {grupos} nombres duplicados después de homologar.")
    maestro = set(maestras)
    fisicas_sin_m2 = sum(
        clave_texto(r["tipo_ubicacion"]) == "TIENDA FISICA" and numero(r["metraje_m2"]) is None
        for r in datos["tiendas"]
    )
    if fisicas_sin_m2:
        agregar(resultado, "errores", f"TIENDAS: {fisicas_sin_m2} tiendas físicas sin metraje.")

    aliases = [str(r.get("Alias") or "").strip().upper() for r in datos["tiendas"]]
    alias_vacios = sum(not x for x in aliases)
    _, grupos_alias = duplicados([(x,) for x in aliases if x])
    if alias_vacios:
        agregar(resultado, "errores", f"TIENDAS: {alias_vacios} alias vacíos.")
    if grupos_alias:
        agregar(resultado, "errores", f"TIENDAS: {grupos_alias} alias duplicados.")

    columnas_tienda = {
        "metas": ("tienda",), "personal": ("tienda",), "trafico": ("tienda",),
        "merma": ("tienda",), "guias": ("tienda_origen", "tienda_destino"),
    }
    for origen, columnas in columnas_tienda.items():
        for columna in columnas:
            encontrados = {tienda(r[columna]) for r in datos[origen] if not vacio(r[columna])}
            huerfanas = sorted(x for x in encontrados - maestro if x)
            if huerfanas:
                agregar(resultado, "errores", f"{origen}.{columna}: tiendas no registradas en TIENDAS={huerfanas}")


    # Política temporal: el modelo comienza en 2024 y acepta años posteriores.
    minimo_modelo = date(ANIO_INICIO_MODELO, 1, 1)
    controles_fecha = {
        "metas": ("fecha_periodo",),
        "personal": ("fecha_ingreso", "fecha_retiro"),
        "trafico": ("fecha",),
        "merma": ("fecha_periodo", "fecha_ocurrencia"),
    }
    for origen, columnas_fecha in controles_fecha.items():
        anteriores = 0
        for fila in datos[origen]:
            for columna in columnas_fecha:
                valor = fecha_excel(fila.get(columna))
                if valor is not None and valor < minimo_modelo:
                    anteriores += 1
        if anteriores:
            agregar(
                resultado,
                "errores",
                f"{origen.upper()}: {anteriores} fechas anteriores a {minimo_modelo}; "
                "el modelo solo admite 2024 en adelante.",
            )

    # Catálogo: un código RLS por fila y clasificación completa.
    catalogo = datos["catalogo"]
    codigos = [str(r["rls_codigo"]).strip() for r in catalogo if not vacio(r["rls_codigo"])]
    rep, grupos = duplicados([(c,) for c in codigos])
    if rep:
        agregar(resultado, "errores", f"CATALOGO: {grupos} códigos RLS duplicados.")
    incompletas = sum(any(vacio(r[c]) for c in ("rls_codigo", "rubro", "linea", "sub_linea")) for r in catalogo)
    if incompletas:
        agregar(resultado, "errores", f"CATALOGO: {incompletas} filas sin clasificación completa.")

    # Metas: una fila por mes y tienda. TEXTIL/CALZADO son metas oficiales;
    # los otros rubros se estimarán en la interfaz desde el remanente y ventas.
    metas = datos["metas"]
    claves = []
    inconsistentes = negativas = ceros = 0
    for r in metas:
        y = numero(r["anio"]); m = numero(r["mes_numero"])
        y_int = int(y) if y is not None else None
        m_int = int(m) if m is not None else None
        if y_int is None or m_int is None or not 1 <= m_int <= 12:
            inconsistentes += 1
        valores = [numero(r[campo]) for campo in ("meta_total", "meta_textil", "meta_calzado", "otros_validos")]
        negativas += sum(valor is not None and valor < 0 for valor in valores)
        ceros += sum(valor == 0 for valor in valores)
        claves.append((y_int, m_int, tienda(r["tienda"]), "META VENTAS"))
    rep, grupos = duplicados(claves)
    if rep:
        agregar(resultado, "errores", f"METAS: {grupos} claves mes/tienda duplicadas.")
    if inconsistentes:
        agregar(resultado, "errores", f"METAS: {inconsistentes} años o meses inválidos.")
    if negativas:
        agregar(resultado, "errores", f"METAS: {negativas} importes negativos.")
    if ceros:
        agregar(resultado, "advertencias", f"METAS: {ceros} filas con meta 0 se publicarán como SIN META.")

    # Personal: padrón individual. El pipeline lo agrega por mes, tienda, puesto y área.
    personal = datos["personal"]
    claves = [
        (str(r["numero_documento"] or "").strip(), clave_texto(r["nombre_completo"]), fecha_excel(r["fecha_ingreso"]))
        for r in personal
    ]
    rep, grupos = duplicados(claves)
    if rep:
        agregar(resultado, "errores", f"PERSONAL: {grupos} colaboradores duplicados por documento/nombre/fecha de ingreso.")
    invalidas = sum(
        fecha_excel(r["fecha_ingreso"]) is None or vacio(r["tienda"]) or vacio(r["puesto"]) or vacio(r["area"])
        for r in personal
    )
    if invalidas:
        agregar(resultado, "errores", f"PERSONAL: {invalidas} filas con fecha de ingreso, tienda, puesto o área inválidos.")
    retiros_invalidos = sum(
        fecha_excel(r["fecha_retiro"]) is not None and fecha_excel(r["fecha_ingreso"]) is not None
        and fecha_excel(r["fecha_retiro"]) < fecha_excel(r["fecha_ingreso"])
        for r in personal
    )
    if retiros_invalidos:
        agregar(resultado, "errores", f"PERSONAL: {retiros_invalidos} retiros anteriores al ingreso.")

    # Tráfico: una fila por fecha y tienda; NULL solo con estado informativo.
    trafico = datos["trafico"]
    claves = [(fecha_excel(r["fecha"]), tienda(r["tienda"])) for r in trafico]
    rep, grupos = duplicados(claves)
    if rep:
        agregar(resultado, "errores", f"TRAFICO: {grupos} claves fecha/tienda duplicadas.")
    nulos = sum(numero(r["cantidad_personas"]) is None for r in trafico)
    nulos_inconsistentes = sum(
        numero(r["cantidad_personas"]) is None
        and clave_texto(r["estado_registro"]) not in {"SIN INFORMACION", "CERRADO", "FERIADO"}
        for r in trafico
    )
    negativos = sum((numero(r["cantidad_personas"]) or 0) < 0 for r in trafico)
    if negativos:
        agregar(resultado, "errores", f"TRAFICO: negativos={negativos}.")
    if nulos_inconsistentes:
        # Datos recien actualizados pueden tener conteos NULL sin estado_registro
        # definitivo. Se publica como advertencia para no bloquear la pipeline.
        agregar(resultado, "advertencias", f"TRAFICO: {nulos_inconsistentes} conteos NULL sin estado informativo (se conservan como NULL).")
    if nulos:
        agregar(resultado, "advertencias", f"TRAFICO: {nulos} conteos NULL se conservaran segun estado_registro.")


    # Merma: código y precio pueden faltar, cantidad/total no pueden ser negativos.
    merma = datos["merma"]
    claves = [
        (fecha_excel(r["fecha_periodo"]), fecha_excel(r["fecha_ocurrencia"]), tienda(r["tienda"]), clave_texto(r["area"]), clave_texto(r["tipo_merma"]), str(r["codigo_nissei"]).strip(), clave_texto(r["descripcion"]), numero(r["cantidad"]), numero(r["total_merma"]))
        for r in merma
    ]
    rep, grupos = duplicados(claves)
    if rep:
        agregar(resultado, "errores", f"MERMA: {grupos} filas de negocio duplicadas.")
    invalidas = sum(
        fecha_excel(r["fecha_periodo"]) is None or numero(r["cantidad"]) is None
        or (numero(r["cantidad"]) or 0) < 0 or (numero(r["total_merma"]) is not None and numero(r["total_merma"]) < 0)
        for r in merma
    )
    if invalidas:
        agregar(resultado, "errores", f"MERMA: {invalidas} filas con período/cantidad/importe inválido.")
    sin_codigo = sum(vacio(r["codigo_nissei"]) for r in merma)
    if sin_codigo:
        agregar(resultado, "advertencias", f"MERMA: {sin_codigo} filas sin código conservarán producto_id NULL.")

    # Guías: clave completa única y total consistente con cantidad x precio.
    guias = datos["guias"]
    claves = [
        (r["fecha_hora_transferencia"], clave_texto(r["estado_transferencia"]), str(r["nro_guia"]).strip(), tienda(r["tienda_origen"]), tienda(r["tienda_destino"]), str(r["codigo_nissei"]).strip(), str(r["lote"]).strip(), clave_texto(r["modelo_codigo"]), numero(r["cantidad"]), numero(r["precio_sugerido"]))
        for r in guias
    ]
    rep, grupos = duplicados(claves)
    if rep:
        agregar(resultado, "errores", f"GUIAS: {grupos} líneas de negocio duplicadas.")
    obligatorias = sum(
        fecha_excel(r["fecha_hora_transferencia"]) is None or vacio(r["nro_guia"])
        or vacio(r["tienda_origen"]) or vacio(r["tienda_destino"]) or vacio(r["codigo_nissei"])
        or numero(r["cantidad"]) is None or numero(r["precio_sugerido"]) is None
        for r in guias
    )
    if obligatorias:
        agregar(resultado, "errores", f"GUIAS: {obligatorias} filas sin campos obligatorios.")
    guias_anteriores = sum(
        (fecha_excel(r["fecha_hora_transferencia"]) or date.max)
        < date(ANIO_INICIO_MODELO, 1, 1)
        for r in guias
    )
    if guias_anteriores:
        agregar(
            resultado,
            "advertencias",
            f"GUIAS: {guias_anteriores} filas anteriores a {ANIO_INICIO_MODELO} "
            "serán excluidas de Capa 2.",
        )
    diferencias = sum(
        abs((numero(r["cantidad"]) or 0) * (numero(r["precio_sugerido"]) or 0) - (numero(r["total_transferencia"]) or 0)) > 0.02
        for r in guias
    )
    if diferencias:
        agregar(resultado, "advertencias", f"GUIAS: {diferencias} totales fuente difieren de cantidad × precio; se recalcularán.")

    resultado["estado"] = "ERROR" if resultado["errores"] else ("ADVERTENCIA" if resultado["advertencias"] else "OK")
    return resultado


def main() -> int:
    try:
        resultado = auditar()
        SALIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
        print("\n" + "=" * 82)
        print("AUDITORÍA DE EXCEL COMERCIALES DE CAPA 1")
        print("=" * 82)
        for nombre, info in resultado["archivos"].items():
            print(f"[OK] {nombre:<10} | filas={info['filas']:,} | archivo={info['archivo']}")
        for mensaje in resultado["advertencias"]:
            print(f"[ADVERTENCIA] {mensaje}")
        for mensaje in resultado["errores"]:
            print(f"[ERROR] {mensaje}")
        print(f"Estado      : {resultado['estado']}")
        print(f"Informe JSON: {SALIDA}")
        return 1 if resultado["errores"] else 0
    except Exception as exc:
        print("\nERROR EN AUDITORÍA DE EXCEL COMERCIALES", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
