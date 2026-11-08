# Entrada operativa RMS

Esta carpeta ya no almacena históricos. El histórico consolidado está en los
Parquet de `capa1` y `capa2`.

En el panel local usa **Abrir carpeta input** para llegar directamente a esta
carpeta. Para una ejecución diaria, sobrescribe estos archivos aquí mismo:

- `VENTAS.xlsx`
- `INGRESO.xlsx`
- `TRANSFERENCIAS.xlsx`

Cada archivo debe contener únicamente la entrega nueva que se quiere incorporar.
En el panel local selecciona la fecha de corte de esa entrega y usa **Actualizar
datos locales**.

`STOCK.xlsx` es opcional. Colócalo solo para el cierre de mes y usa el botón
**Usar cierre de mes** para fijar el último día calendario de ese mes. En las ejecuciones diarias no incluyas
`STOCK.xlsx`; se conserva la última fotografía mensual publicada.

Las carpetas históricas existentes se ignoran y no participan en este flujo.
