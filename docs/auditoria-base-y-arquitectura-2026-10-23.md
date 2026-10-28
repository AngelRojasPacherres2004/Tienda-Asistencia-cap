# Auditoría de base y decisión de arquitectura

Fecha de medición: 2026-10-23. Proyecto operativo: `xtnihjzqnxozbotymoma`.
Las consultas fueron de solo lectura sobre `pg_class`, `pg_stat_user_tables`,
`pg_stats`, `pg_index` y `pg_constraint`.

## Resultado principal

La base completa ocupa 118 MB y las tablas del esquema `public`, 94 MB.
El peso se concentra en tres relaciones:

| Tabla | Filas estimadas | Tabla | Índices | Total |
| --- | ---: | ---: | ---: | ---: |
| `productos` | 265,612 | 54.15 MB | 14.61 MB | 68.80 MB |
| `trafico_tienda` | 58,546 | 10.96 MB | 9.27 MB | 20.27 MB |
| `asistencias` | 19,214 | 1.97 MB | 1.52 MB | 3.54 MB |

`productos` representa aproximadamente 70% del esquema público. El código
Nissei vive en `public.productos.codigo_nissei`; es único, no nulo y tiene un
índice utilizado intensivamente. No conviene moverlo a otra tabla.

## Cambios seguros incluidos

- El identificador anonimizado del portal pasa a una vista con índice funcional.
  Esto evita guardar el mismo valor derivado en las 265,612 filas.
- Los índices de talla son parciales. Solo indexan los 47,960 códigos canónicos
  de 14 caracteres, no los más de 217 mil productos cuyo sufijo no representa
  una talla.
- Se eliminan dos índices redundantes de `trafico_tienda`. La restricción única
  `(tienda_id, fecha, rango_hora)` cubre sus prefijos y se conserva el índice por
  `fecha` para reportes globales.
- `trafico_tienda` recibe umbrales de autovacuum apropiados para sus cargas
  frecuentes. En la medición tenía 8,720 versiones muertas.

No se propone particionar `productos`: es una dimensión sin eje temporal. Tampoco
se propone particionar `trafico_tienda` todavía; 58 mil filas no justifican la
complejidad. Se debe reevaluar al superar varios millones de filas.

## Tablas candidatas a retiro, no eliminadas

Las siguientes tablas tienen exactamente cero filas, no aparecen en el código
ejecutable actual y solo conservan sus dependencias internas. No se borran en
esta rama porque la eliminación requiere confirmar respaldo y ventana de
despliegue:

| Tabla | Motivo |
| --- | --- |
| `incidentes` | Modelo anterior; el sistema usa `incidencias` e `incidencias_zonales`. |
| `tienda_jefes_zonales_legacy` | Reemplazada por `clusters.jefe_zonal_id`. |
| `notificaciones_asistencia` | Programación anterior; hoy se usa `programaciones_asistencia_zonal`. |
| `notificaciones_asistencia_envios` | Historial anterior; hoy se usa `envios_asistencia_zonal`. |

Las demás tablas vacías sí corresponden a módulos activos o flujos preparados,
por lo que no deben confundirse con tablas sin uso.

## Columnas y normalización

En `productos`, `lote` y `serie` son nulos en 99.98% de las filas. Separarlas
ahorraría poco y complicaría importaciones y consultas; se mantienen. `modelo` y
`descripcion` tienen valores propios y son usados por la búsqueda de productos,
así que tampoco se fusionan. La mejora rentable es evitar columnas derivadas
duplicadas y consultas que recorran el catálogo completo.

## React o Angular

La opción recomendada es conservar React como aplicación principal y migrar el
dashboard Angular por secciones, no reescribir todo de una vez ni mover el resto
del sistema a Angular.

Razones:

- La aplicación React ya tiene decenas de rutas cargadas de forma diferida y
  concentra autenticación, roles y módulos operativos.
- Angular está aislado al dashboard comercial; una migración gradual permite
  comparar cada gráfico y filtro antes de retirar su equivalente.
- El problema de carga medido proviene primero del volumen de datos JSON y de
  consultas, no del framework. Reescribir sin optimizar datos conservaría el
  cuello de botella y añadiría riesgo funcional.

Orden recomendado restante:

1. Publicar y medir las particiones anuales en una versión de prueba.
2. Extraer la capa de datos y tipos del dashboard a módulos pequeños y cubiertos
   por pruebas de equivalencia.
3. Migrar una página del dashboard a React, comparando cifras y capturas con
   Angular.
4. Repetir por página y retirar Angular solo cuando todas las rutas tengan
   paridad funcional y visual.

## Puerta de validación de particiones (2026-10-24)

La validación local de las cuatro series temporales usó
`scripts/benchmark-dashboard-partitions.py` sobre los JSON del corte
2026-10-15. Comparó cada fila por año con su origen y confirmó 1,139,781 filas
sin pérdida. Los tamaños corresponden a gzip nivel 6, como la publicación:

```powershell
& '.\.venv\Scripts\python.exe' scripts/benchmark-dashboard-partitions.py --directory commercial-dashboard/public/assets/data
```

| Serie | Monolito comprimido | Solo 2026 comprimido |
| --- | ---: | ---: |
| Vendedores | 5,774,471 B | 2,282,264 B |
| Marcas | 3,309,701 B | 1,175,674 B |
| Rangos de precio | 2,447,446 B | 909,225 B |
| Sublíneas | 3,068,819 B | 1,145,771 B |
| **Total** | **14,600,437 B** | **5,512,934 B** |

Para una vista de un año, la transferencia estimada de estas cuatro series
baja aproximadamente 62%. Algunas comparativas requieren dos años, por lo
que su ahorro será menor. La medición es de bytes, no de latencia real del
navegador.

La consulta de solo lectura a la última versión publicada
(`20261018T182658Z-ecc5c3a0d968`) encontró todavía los cuatro monolitos en
`dashboard_files`. No se publicaron las particiones ni se aplicaron las
migraciones SQL de esta rama. Por la indicación de trabajar localmente y de
no avanzar sin verificar el paso anterior, la migración de páginas a React
queda detenida hasta probar las particiones en una versión de prueba con los
roles y filtros reales. El manifiesto de reportes anuales v3, que ya existe,
es un conjunto distinto y no sustituye esta validación.
