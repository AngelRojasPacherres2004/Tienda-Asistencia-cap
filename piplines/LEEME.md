# DashboardGeneral ETL v3.3.0

## Uso rápido en una computadora nueva

1. Extraer el ZIP completo en una carpeta local.
2. Instalar Python 3.10 o superior y marcar `Add Python to PATH` durante la instalación.
3. Ejecutar `1_INSTALAR_REQUISITOS.bat`.
4. Colocar o actualizar los Excel RMS dentro de `input` y los Excel comerciales dentro de `capa1`.
5. Ejecutar `2_ACTUALIZAR_DATOS.bat`. El proceso asigna al stock la última fecha comercial disponible en `FactVentas`; la fecha en que se cargó el Excel no se usa como corte del negocio.

La actualización genera todos los Parquet finales en `capa2` y regenera `capa2/Modelo_Dashboard.tmdl` con la ruta de la computadora actual.

La construcción de las dos páginas en Power BI está documentada en `../README_DASHBOARD_POWER_BI.md`. Esa guía indica el tipo de visual, los campos, las medidas, los filtros y el tratamiento de datos faltantes para cada bloque del mockup.

## Archivos BAT de la raíz

- `1_INSTALAR_REQUISITOS.bat`: crea `.venv`, instala las versiones declaradas en `requirements.txt` y comprueba DuckDB y los scripts.
- `2_ACTUALIZAR_DATOS.bat`: reconstruye Capa 1, Capa 2 y el TMDL; después ejecuta la validación estricta.
- `3_CREAR_PAQUETE_PORTABLE.bat`: genera un ZIP estándar con lo mínimo necesario para instalar y reconstruir el proyecto en otra PC.

## Arquitectura

- `input`: Excel RMS de ventas, ingresos, transferencias y stock.
- `capa1`: Excel comerciales editables y Parquet RMS consolidados.
- `capa2`: Parquet analíticos finales y `Modelo_Dashboard.tmdl`.
- `.etl_work`: caché, staging, temporales, respaldo y estado de ejecución. Se crea automáticamente y no se incluye en el ZIP.
- `piplines`: scripts Python vigentes del ETL.

Los Excel comerciales son escalables. Las nuevas tiendas agregadas a `TIENDAS.xlsx` reciben una clave estable y se relacionan con los hechos que utilicen el mismo nombre homologado.

## Catálogo de productos en Supabase

`CODIGO NISSEI` se conserva desde los Excel RMS hasta `DimProducto.parquet` y los detalles comerciales publicados. Para actualizar también la tabla relacional `public.productos` sin cambiar los IDs existentes:

1. Ejecutar `python piplines/sincronizar_productos_supabase.py` para validar el origen y ver la cantidad esperada.
2. Ejecutar `python piplines/sincronizar_productos_supabase.py --apply` para hacer el *upsert* por `codigo_nissei` en el proyecto `bd-app`.

El comando se detiene si las credenciales apuntan a otro proyecto. Nunca elimina productos ni altera las relaciones existentes de `productos_tienda`.

## Contenido del paquete portable

El ZIP incluye:

- los Excel RMS de `input`;
- únicamente los Excel comerciales de `capa1`;
- todos los scripts vigentes de `piplines`;
- los tres BAT de la raíz.
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

`FactMerma` se mantiene como histórico de incidencias del Excel manual. No se suma automáticamente a la merma del snapshot de stock para evitar doble conteo. Las medidas de merma actual del modelo usan `FactStock`; los robos y el histórico manual siguen usando `FactMerma`.
