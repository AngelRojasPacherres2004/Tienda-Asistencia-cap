from __future__ import annotations

"""Sobrescrituras editables de homologación para las fuentes RMS.

La lógica del ETL mantiene sus reglas base en código, mientras que las nuevas
variantes que el negocio detecte se agregan en ``homologaciones_usuario.json``.
Así un nombre nuevo no exige editar ni reemplazar las pipelines.
"""

import json
from pathlib import Path


ARCHIVO_REGLAS = Path(__file__).with_name("homologaciones_usuario.json")
SECCIONES_ADMITIDAS = frozenset(
    {
        "tiendas",
        "proveedores",
        "marcas",
        "rubros",
        "lineas",
        "sublineas",
        "personal",
    }
)


def cargar_homologaciones_usuario() -> dict[str, dict[str, str]]:
    """Lee y valida las reglas editables sin modificar el archivo fuente."""
    if not ARCHIVO_REGLAS.exists():
        return {}
    try:
        contenido = json.loads(ARCHIVO_REGLAS.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{ARCHIVO_REGLAS.name} no tiene JSON válido (línea {exc.lineno}, columna {exc.colno})."
        ) from exc

    if not isinstance(contenido, dict):
        raise ValueError(f"{ARCHIVO_REGLAS.name} debe contener un objeto JSON.")

    desconocidas = sorted(set(contenido) - SECCIONES_ADMITIDAS)
    if desconocidas:
        raise ValueError(
            f"Secciones no admitidas en {ARCHIVO_REGLAS.name}: {', '.join(desconocidas)}. "
            f"Usa: {', '.join(sorted(SECCIONES_ADMITIDAS))}."
        )

    resultado: dict[str, dict[str, str]] = {}
    for seccion, reglas in contenido.items():
        if not isinstance(reglas, dict):
            raise ValueError(
                f"La sección '{seccion}' de {ARCHIVO_REGLAS.name} debe ser un objeto de equivalencias."
            )
        limpias: dict[str, str] = {}
        for origen, destino in reglas.items():
            if not isinstance(origen, str) or not origen.strip():
                raise ValueError(f"'{seccion}' tiene un origen vacío o no textual.")
            if not isinstance(destino, str) or not destino.strip():
                raise ValueError(
                    f"'{seccion}.{origen}' debe tener un destino textual no vacío."
                )
            limpias[origen.strip()] = destino.strip()
        if limpias:
            resultado[seccion] = limpias
    return resultado


def aplicar_homologaciones_usuario(
    catalogos: dict[str, dict[str, str]],
    fuente: str,
) -> None:
    """Mezcla las reglas editables con los diccionarios de una pipeline.

    Las reglas editables tienen prioridad sobre las reglas base de forma
    intencional; se imprimen para que el operador pueda auditar qué se aplicó.
    """
    reglas = cargar_homologaciones_usuario()
    aplicadas: list[str] = []
    for seccion, destino in catalogos.items():
        nuevas = reglas.get(seccion, {})
        if nuevas:
            destino.update(nuevas)
            aplicadas.append(f"{seccion}: {len(nuevas)}")
    if aplicadas:
        print(f"[HOMOLOGACIÓN] {fuente}: " + ", ".join(aplicadas), flush=True)
