# Entrada mensual RMS

Cada carpeta `AAAAMM` contiene la fotografía acumulada de ese mes.

- `VENTA*.xlsx`
- `INGRESO*.xlsx`
- `TRANSFERENCIA*.xlsx`
- `STOCK*.xlsx` únicamente al cierre del último día del mes.

El texto posterior al prefijo es libre, pero debe haber solo un archivo por
prefijo dentro de cada carpeta mensual.

Al recibir una entrega nueva del mismo mes, reemplaza los tres archivos por el
acumulado actualizado y vuelve a procesar ese período. No copies históricos de
otros meses ni archivos de personal, tráfico, catálogo, tiendas, metas o merma.
