# Carga operativa del 5 de octubre de 2026

Actualización posterior: [ampliación a tres meses y calendario de lunes a sábado](ampliacion-historial-2026-10-05.md). Las cifras siguientes describen la primera carga y no son los totales actuales.

Se completaron registros faltantes en la base configurada en `.env`, del 1 de septiembre al 5 de octubre de 2026, para las 21 tiendas activas. **Los registros añadidos son sintéticos**: sirven para revisar pantallas y gráficos y no constituyen mediciones, ventas ni asistencia constatadas. No deben usarse para decisiones laborales, financieras o regulatorias.

## Resultado

| Conjunto | Total verificado en el periodo | Nuevos registros |
|---|---:|---:|
| Asistencia | 7.416 | 6.744 |
| Tráfico horario | 9.304 | 8.962 |
| Cierres en bitácora | 714 | 688 |

Los registros anteriores se conservaron. El script omite combinaciones ya existentes de persona/día, tienda/día/franja y tienda/día de bitácora. En los días completos se cubren las 13 franjas de 09:00 a 22:00. Para el día en curso se generan solamente horas ya terminadas y no se crea cierre de jornada.

Las marcas se limitan a fechas dentro del vínculo laboral disponible y se alternan estados de presencia, tardanza, medio turno y falta. Los domingos se registra solo parte del personal. Los cierres de bitácora tienen tráfico igual a la suma de los conteos horarios del día; sus ventas son cifras sintéticas. No se inventaron certificados, inspecciones, incidentes, faltas disciplinarias ni capacitaciones completadas.

## Verificación

- Cobertura: cero franjas faltantes entre las fechas y tiendas indicadas.
- `/dashboard` y `/zonal/comparativa` del zonal de clúster B: HTTP 200, 540 marcas y 10 tiendas respectivamente para el 1–5 de octubre. La comparativa devolvió 28.810 visitas.
- Auditoría integral de API después de la carga: 140 comprobaciones, cero fallos.
- Navegación local del rol zonal después de la carga: 9 páginas, sin errores JavaScript, respuestas fallidas ni avisos de error.
- El mensaje «Ocurrió un error al acceder a la base de datos» no se reprodujo en la API local ni en esas consultas. La captura pudo provenir de otra versión desplegada o de un fallo temporal; sin su URL y registros de servidor no puede atribuirse una causa definitiva.

## Repetición

`node scripts/fill-operational-history.mjs` calcula una vista previa; `--apply` añade solo los huecos. Se puede acotar el periodo con `FILL_FROM` y `FILL_TO`. No se debe ejecutar automáticamente como una fuente de datos reales.
