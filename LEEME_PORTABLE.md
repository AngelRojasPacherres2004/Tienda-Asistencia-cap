# Dashboard General · paquete portable

1. Extrae por completo el ZIP en una carpeta local; no ejecutes los BAT desde dentro del ZIP.
2. Instala Python 3.10+ y Node.js LTS si la computadora aún no los tiene.
3. Copia las credenciales privadas autorizadas a `.env` (y, si corresponde, `.env.supabase.local`). El ZIP no lleva contraseñas ni claves.
4. Ejecuta `1_INSTALAR_REQUISITOS.bat` una vez.
5. Abre `0_ABRIR_PANEL.bat`. Desde el panel selecciona el período y una fecha de corte en su calendario, y procesa el lote.

En `Entrada\AAAAMM` se usa un Excel que inicie con `VENTA`, otro con `INGRESO` y otro con `TRANSFERENCIA`; al cierre mensual se añade uno que inicie con `STOCK`. El texto posterior del nombre es libre. La carpeta conserva el acumulado del mes: reemplaza los tres archivos cuando llegue una entrega nueva y procesa de nuevo el mismo período. El resultado queda en `Salida\AAAAMM` con tres Parquet diarios o cuatro al cierre, `manifiesto.json` y `Vista_Previa.html`.

Antes de publicar, el panel impide fechas fuera del período, futuras, sin los tres Excel requeridos, con Stock fuera de cierre o con datos anteriores al primer día del mes y posteriores al corte. Usa **Abrir dashboard local** para revisar `Vista_Previa.html` sin iniciar sesión ni cargar nada. En el portal, el Asistente Comercial o Sistemas selecciona el manifiesto local y exactamente los Parquet indicados; el manifiesto no se publica y valida corte, nombres, tamaño, firma y checksum.

Los pies estándar que RMS agrega al final de sus reportes (`Totales`, `Página` y el resumen de venta) se excluyen automáticamente. Cualquier fila inesperada que no sea uno de esos pies sigue bloqueando el proceso para evitar publicar datos dañados.

Los datos de personal, tráfico, catálogos, tiendas, metas y merma se consultan desde la base de datos. No copies sus Excel históricos al paquete.
