# DashboardGeneral ETL v3.3.0

## Uso rápido en una computadora nueva

1. Extraer el ZIP completo en una carpeta local.
2. Instalar Python 3.10 o superior y marcar `Add Python to PATH` durante la instalación.
3. Ejecutar `1_INSTALAR_REQUISITOS.bat`.
4. En `Entrada\AAAAMM`, sobrescribir un Excel que inicie con `VENTA`, otro con `INGRESO` y otro con `TRANSFERENCIA` con la entrega acumulada nueva del mes. No se vuelven a colocar archivos históricos.
5. Abrir `0_ABRIR_PANEL.bat`, seleccionar el período, elegir la fecha de corte desde el calendario y pulsar **Procesar período**. Al cierre del mes agrega también `STOCK.xlsx` y selecciona el último día del mes.

La actualización genera únicamente los Parquet del período, `manifiesto.json` y `Vista_Previa.html` en `Salida\AAAAMM`; las capas técnicas se usan de forma temporal y no guardan histórico local. **Abrir dashboard local** abre esa vista sin depender de una sesión web. La validación rechaza fechas fuera del período o posteriores al corte antes de publicar la salida.

Los pies estándar de RMS (`Totales`, `Página` y el resumen final de ventas) no se consideran transacciones y se retiran automáticamente. Una fila inesperada se conserva para que la validación la bloquee y muestre el problema.

La construcción de las dos páginas en Power BI está documentada en `../README_DASHBOARD_POWER_BI.md`. Esa guía indica el tipo de visual, los campos, las medidas, los filtros y el tratamiento de datos faltantes para cada bloque del mockup.

## Archivos BAT de la raíz

- `1_INSTALAR_REQUISITOS.bat`: crea `.venv`, instala las versiones declaradas en `requirements.txt` y comprueba DuckDB y los scripts.
- `2_ACTUALIZAR_DATOS.bat`: prepara y valida el lote de un período de `Entrada` en `Salida`.
- `3_CREAR_PAQUETE_PORTABLE.bat`: genera en `paquetes_portables` un ZIP comprobado con los lanzadores vigentes, la web compilada y el flujo RMS. No incluye credenciales, Excel ni datos históricos.

## Arquitectura

- `Entrada\AAAAMM`: bandeja mensual; admite un archivo que inicie con `VENTA`, otro con `INGRESO`, otro con `TRANSFERENCIA` y, en cierre mensual, otro con `STOCK`.
- `Salida\AAAAMM`: Parquet limpios del período, `manifiesto.json` y `Vista_Previa.html`, listos para validar y cargar desde el rol autorizado.
- `.operacion_temporal`: capas técnicas aisladas y eliminadas al terminar cada proceso.
- `piplines`: scripts Python vigentes del ETL.

Personal, tiendas, tráfico, metas, catálogo, mermas y demás dimensiones administrativas se obtienen de Supabase; ya no se cargan Excel comerciales locales.

## Catálogo de productos en Supabase

`CODIGO NISSEI` se conserva desde los Excel RMS hasta `DimProducto.parquet` y los detalles comerciales publicados. Para actualizar también la tabla relacional `public.productos` sin cambiar los IDs existentes:

1. Ejecutar `python piplines/sincronizar_productos_supabase.py` para validar el origen y ver la cantidad esperada.
2. Ejecutar `python piplines/sincronizar_productos_supabase.py --apply` para hacer el *upsert* por `codigo_nissei` en el proyecto `bd-app`.

El comando se detiene si las credenciales apuntan a otro proyecto. Nunca elimina productos ni altera las relaciones existentes de `productos_tienda`.

## Contenido del paquete portable

El ZIP incluye:

- la estructura vacía de `Entrada` y su guía operativa;
- los scripts y el modelo para reconstruir desde las fuentes vigentes;
- todos los scripts vigentes de `piplines`;
- los cinco BAT vigentes de la raíz (`0` a `4`);
- `LEEME_PORTABLE.md` con la instalación y el uso seguro.
- la guía `README_DASHBOARD_POWER_BI.md` para construir el informe.

No incluye `.venv`, `.etl_work`, `__pycache__`, Parquet, TMDL con rutas de otra PC, respaldos, JSON de auditoría ni documentos Word. Todos esos resultados se recrean al ejecutar la actualización.

## Página 2: inventario y analítica predictiva

- Capacidad vs stock: `CAPACIDAD STOCK UNIDADES` y `UNIDADES EN STOCK TIENDAS ACTUAL`.
- Antigüedad mes a mes: eje `DimFechaOrigenStock[anio_mes]`, ordenado por `DimFechaOrigenStock[orden_anio_mes]`, y valor `STOCK ANTIGÜEDAD MES UND`.
- Textos de antigüedad: `TEXTO STOCK ANTIGUO HASTA 2024` y `TEXTO CALIDAD ANTIGÜEDAD STOCK`.
- Pronóstico por tienda: `DimTiendas[alias]`, `PRONÓSTICO QUIEBRE STOCK DÍAS` y `COBERTURA TIENDA TEXTO`.
- Máxima cobertura: `TEXTO COBERTURA MÁXIMA TIENDAS`.
- Productos extremos: `PRODUCTO MAYOR STOCK TEXTO` y `PRODUCTO MENOR STOCK POSITIVO TEXTO`.
- La fotografía de stock es única; `TÍTULO STOCK ACTUAL` comunica la fecha y la ausencia de histórico.

Para el punto de reorden se recomienda un gráfico combinado: `UNIDADES EN STOCK ACTUAL` como columnas y `PUNTO DE REORDEN ROP UND` como línea, complementado con `DIFERENCIA STOCK VS ROP UND`, `ESTADO REORDEN` y `TEXTO PUNTO REORDEN`.

## EOQ y ROP

- `EOQ CLÁSICO UND = SQRT((2 × demanda anual × costo de ordenar) / costo de mantener)`.
- `EOQ AJUSTADO UND = EOQ clásico / vendibilidad esperada`.
- `PUNTO DE REORDEN ROP UND = ritmo diario 30D × lead time`.

Los ejemplos del libro de lote económico no se publican como datos reales. Mientras falten costo de ordenar, costo anual de mantener, porcentaje no vendible, ICT o lead time, las medidas de texto indican `FALTAN DATOS`.

## Regla de negocio de ESTADO de stock (2026-08)

`FactStock.estado_stock` y `FactStock.estado_grupo` se publican únicamente con tres valores: `BUENO`, `MERMA` y `DESMEDRO`.

- `MERMA`: pérdida marcada explícitamente como MERMA en RMS.
- `BUENO`: BUENO, OK, NUEVO, VENDIBLE, RECUPERADO y estados reparados; vacíos/0 se interpretan como ausencia de defecto.
- `DESMEDRO`: cualquier condición de deterioro o no vendibilidad (sucio, fallado, manchado, incompleto, servicio técnico, roto, usado, lavado, remate, etc.) y cualquier estado nuevo no reconocido. Esta regla conservadora hace que nuevos defectos queden automáticamente fuera de BUENO sin tener que ampliar una lista cada mes.

La merma vigente se obtiene únicamente del estado homologado de `FactStock` (`MERMA` y `DESMEDRO`). El histórico manual de Excel dejó de formar parte de la carga local.
