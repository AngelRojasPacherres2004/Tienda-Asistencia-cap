"""Explicit source dates for publications with different sales, traffic and stock cuts."""
import os
from datetime import date


def configured_cutoff(source: str, fallback: date) -> date:
    value = os.environ.get(f"DASHBOARD_{source.upper()}_CUTOFF", "").strip()
    result = date.fromisoformat(value) if value else fallback
    if result > date.today():
        raise ValueError(f"El corte de {source} {result} no puede estar en el futuro.")
    if source.upper() == "TRAFFIC" and result > fallback:
        raise ValueError("El corte de tráfico no puede superar el de ventas.")
    return result
