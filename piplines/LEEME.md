# DashboardGeneral ETL v3.3.0

## Uso rápido en una computadora nueva

1. Extraer el ZIP completo en una carpeta local.
2. Instalar Python 3.10 o superior y marcar `Add Python to PATH` durante la instalación.
3. Ejecutar `1_INSTALAR_REQUISITOS.bat`.
4. En `input`, sobrescribir `VENTAS.xlsx`, `INGRESO.xlsx` y `TRANSFERENCIAS.xlsx` con la entrega nueva del día. No se vuelven a colocar archivos históricos.
5. Abrir `0_ABRIR_PANEL.bat`, usar **Abrir carpeta input** para cargar los archivos, elegir con el calendario la fecha de esa entrega y pulsar **Actualizar datos locales**. Al cierre del mes agrega también `STOCK.xlsx` y usa **Usar cierre de mes** antes de actualizar.

La actualización genera todos los Parquet finales en `capa2` y regenera `capa2/Modelo_Dashboard.tmdl` con la ruta de la computadora actual.

La construcción de las dos páginas en Power BI está documentada en `../README_DASHBOARD_POWER_BI.md`. Esa guía indica el tipo de visual, los campos, las medidas, los filtros y el tratamiento de datos faltantes para cada bloque del mockup.

## Archivos BAT de la raíz

- `1_INSTALAR_REQUISITOS.bat`: crea `.venv`, instala las versiones declaradas en `requirements.txt` y comprueba DuckDB y los scripts.
- `2_ACTUALIZAR_DATOS.bat`: reconstruye Capa 1, Capa 2 y el TMDL; después ejecuta la validación estricta.
- `3_CREAR_PAQUETE_PORTABLE.bat`: genera en `paquetes_portables` un ZIP comprobado con los lanzadores vigentes, la web compilada y el flujo RMS. No incluye credenciales, Excel ni datos históricos.

## Arquitectura

- `input`: bandeja operativa; solo admite `VENTAS.xlsx`, `INGRESO.xlsx`, `TRANSFERENCIAS.xlsx` y, en cierre mensual, `STOCK.xlsx`.
- `capa1`: Parquet RMS consolidados e históricos.
- `capa2`: Parquet analíticos finales y `Modelo_Dashboard.tmdl`.
- `.etl_work`: caché, staging, temporales, respaldo y estado de ejecución. Se crea automáticamente y no se incluye en el ZIP.
- `piplines`: scripts Python vigentes del ETL.

Personal, tiendas, tráfico, metas, catálogo, mermas y demás dimensiones administrativas se obtienen de Supabase; ya no se cargan Excel comerciales locales.

## Catálogo de productos en Supabase

`CODIGO NISSEI` se conserva desde los Excel RMS hasta `DimProducto.parquet` y los detalles comerciales publicados. Para actualizar también la tabla relacional `public.productos` sin cambiar los IDs existentes:

1. Ejecutar `python piplines/sincronizar_productos_supabase.py` para validar el origen y ver la cantidad esperada.
2. Ejecutar `python piplines/sincronizar_productos_supabase.py --apply` para hacer el *upsert* por `codigo_nissei` en el proyecto `bd-app`.

El comando se detiene si las credenciales apuntan a otro proyecto. Nunca elimina productos ni altera las relaciones existentes de `productos_tienda`.

## Contenido del paquete portable

El ZIP incluye:

- la estructura vacía de `input` y su guía operativa;
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
