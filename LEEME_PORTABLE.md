# Dashboard General · paquete portable completo

1. Extrae todo el ZIP en una carpeta local. No ejecutes los BAT dentro del ZIP.
2. Ejecuta una vez `1_INSTALAR_REQUISITOS.bat`.
3. Abre `0_ABRIR_PANEL.bat`.
4. Elige el período y su fecha en el calendario. Pulsa **Procesar** y, cuando termine sin errores, **Publicar web**.

El paquete ya lleva `.env`, Capa 1 y Capa 2 históricas. Por ello no se vuelven a cargar Excel de 2024–2026: en `Entrada\AAAAMM` se carga únicamente el acumulado del mes actual. Los archivos deben comenzar con `VENTA`, `INGRESO` y `TRANSFERENCIA`; al cierre mensual se agrega `STOCK`. El texto posterior del nombre es libre.

**Procesar** valida las fechas y genera el lote local. **Publicar web** integra ese lote al histórico, recompone Capa 2 y publica una versión atómica para todos los usuarios. Si otra PC ya publica, muestra el equipo y evita una segunda publicación. El corte debe ser posterior al publicado. Se registra PC, usuario de Windows, corte y respaldo de Capa 1 en Supabase.

Los datos de personal, tráfico, catálogo, tiendas, metas y merma no llevan Excel en este paquete: se consultan desde Supabase. Capa 1 contiene solo ventas, ingresos, transferencias y stock.
