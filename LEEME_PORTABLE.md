# Dashboard General · paquete portable

1. Extrae por completo el ZIP en una carpeta local; no ejecutes los BAT desde dentro del ZIP.
2. Instala Python 3.10+ y Node.js LTS si la computadora aún no los tiene.
3. Copia las credenciales privadas autorizadas a `.env` (y, si corresponde, `.env.supabase.local`). El ZIP no lleva contraseñas ni claves.
4. Ejecuta `1_INSTALAR_REQUISITOS.bat` una vez.
5. Abre `0_ABRIR_PANEL.bat`. Desde el panel puedes abrir `input`, elegir la fecha de corte y actualizar los datos.

En `input` solo se usan `VENTAS.xlsx`, `INGRESO.xlsx`, `TRANSFERENCIAS.xlsx` y, al cierre mensual, `STOCK.xlsx`. Tras actualizar se deja el lote de Parquet listo en `entrega_asistente_comercial\AAAA-MM-DD`; el Asistente Comercial lo carga manualmente en el portal.

Los datos de personal, tráfico, catálogos, tiendas, metas y merma se consultan desde la base de datos. No copies sus Excel históricos al paquete.
