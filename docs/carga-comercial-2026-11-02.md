# Carga comercial del 2 de noviembre de 2026

Los Excel RMS de `input` contienen ventas, ingresos y transferencias de 2024,
2025 y 2026. Ventas, ingresos y transferencias llegan al 31/10/2026; el Excel
de tráfico llega al 25/10/2026. El usuario confirmó que STOCK202611.xlsx es
una fotografía del 01/11/2026. No se imputan visitas para los días posteriores.

El flujo admite cortes explícitos separados:

```powershell
.\7_ACTUALIZAR_TODO.bat --fecha-corte 2026-10-31 --fecha-trafico 2026-10-25 --fecha-stock 2026-11-01 --valorar-stock-cantidad-precio --sin-pausa
```

`--valorar-stock-cantidad-precio` usa la fórmula de valoración ya existente
en `modelo_relacional.py`: cantidad por precio sugerido. Conserva
`total_fuente`, `diferencia_total` y `es_total_consistente` para auditoría.
No altera el Excel original. Solo permite que diferencias de total fuente
continúen hacia esa valoración; cantidades negativas, claves vacías y precios
negativos continúan siendo errores. Sin esa opción se mantiene la validación
estricta del total fuente.

Las diferencias detectadas en los importes se conservan en los campos de
auditor?a del Parquet, junto con el indicador de consistencia del origen.
La homologación de estados sigue BUENO/MERMA/DESMEDRO. Los archivos de
agosto, septiembre y octubre idénticos al de julio no se consideran fotos nuevas.

La conversión del período no se calcula cuando el tráfico no cubre el mismo
corte de ventas. Los reportes privados y la metadata conservan los cortes
independientes. El nuevo stock se carga como `loading`, se comprueban cantidades
y sumas y solo después se marca `ready`. Se conservan las fotografías anteriores.
