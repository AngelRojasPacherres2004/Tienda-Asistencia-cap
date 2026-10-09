# Ampliación del historial: julio a octubre de 2026

La base configurada en `.env` contiene ahora **tres meses completos** de información operativa: julio, agosto y septiembre de 2026, además del 1 al 5 de octubre. La carga nueva es **sintética** y está destinada a revisar paneles; no constituye asistencia, afluencia ni ventas medidas.

| Mes | Días laborables (lunes a sábado) | Tiendas con cobertura horaria completa | Visitas en comparativa general | Marcas en comparativa general |
|---|---:|---:|---:|---:|
| Julio | 27 | 21 | 354.139 | 6.019 |
| Agosto | 26 | 21 | 338.166 | 5.926 |
| Septiembre | 26 | 21 | 337.551 | 6.171 |
| Octubre, hasta el día 5 | 4 | 21 | Periodo en curso | Periodo en curso |

Los totales verificados del 1 de julio al 5 de octubre son 19.080 marcas de asistencia, 22.551 conteos horarios y 1.733 cierres de bitácora. La comprobación de las 21 tiendas detectó **cero franjas faltantes** de 09:00 a 22:00 en días laborables completos; el día actual solo incluye horas terminadas. La carga adicional creó 11.709 marcas, 14.066 conteos y 1.082 cierres. Se conservaron los registros existentes.

## Corrección del domingo

Se retiraron exclusivamente filas identificables de la carga sintética anterior: 281 marcas, 1.326 conteos y 102 cierres de domingo. La nueva carga omite los domingos. Permanecen 122 marcas, 143 conteos y 11 cierres dominicales **anteriores a esa carga**; se preservaron porque podrían representar registros históricos o excepciones que requieren revisión humana. Los días sin marca pendientes y los promedios de gerencia ahora usan lunes a sábado.

## Verificación de API y error intermitente

La comparativa de gerencia y la del zonal B respondieron HTTP 200 para cada uno de julio, agosto y septiembre, con 21 y 10 tiendas respectivamente. Una lectura de Supabase devolvió de forma intermitente `JWT issued at future` y funcionó al repetirse. Se añadió un reintento breve solo para lecturas con ese error exacto. Esta modificación de código es local y requiere despliegue para afectar el sitio publicado.

Ocho pruebas focalizadas aprobaron el calendario y el reintento; ESLint y la compilación de producción también aprobaron. El tamaño del paquete de ExcelJS sigue generando un aviso de compilación sin impedirla.

## Repetición

`node scripts/fill-operational-history.mjs` muestra la vista previa y `--apply` inserta solo huecos desde el 1 de julio por defecto. `FILL_FROM` y `FILL_TO` acotan el rango. `scripts/reconcile-generated-sundays.mjs` documenta y permite repetir la retirada selectiva de la carga anterior. No se debe ejecutar esta generación automática como fuente de datos reales.
