from __future__ import annotations

"""Reglas de negocio compartidas para el corte comercial."""

from datetime import date, timedelta


def ultimo_lunes(referencia: date | None = None) -> date:
    """Devuelve el lunes más reciente, incluyendo la fecha si ya es lunes."""

    base = referencia or date.today()
    return base - timedelta(days=base.weekday())


def fecha_corte_automatica() -> date:
    """Corte semanal predeterminado del dashboard."""

    return ultimo_lunes()


def validar_fecha_corte(fecha_corte: date) -> list[str]:
    """Devuelve advertencias; una fecha manual sigue siendo permitida."""

    advertencias: list[str] = []
    if fecha_corte > date.today():
        advertencias.append("La fecha elegida está en el futuro.")
    if fecha_corte.weekday() != 0:
        advertencias.append(
            "La fecha elegida no es lunes; se respetará porque fue indicada manualmente."
        )
    return advertencias
