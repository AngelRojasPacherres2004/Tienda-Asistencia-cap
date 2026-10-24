# Estado y puerta de la refactorización integral

Rama Git local: `prueba/refactor-integral`. El proyecto operativo es
`xtnihjzqnxozbotymoma` (`bd-app`), no el proyecto legacy al que está enlazada
la CLI local. Esta auditoría de la base fue de solo lectura.

## Paso 1: corrección de datos — pendiente de aplicación y verificación

- La última migración registrada en `supabase_migrations.schema_migrations` es
  `20261018120000`. El esquema real contiene objetos posteriores, de modo que
  el historial y la base no coinciden; no se debe ejecutar ciegamente todo el
  directorio de migraciones.
- `metas_comerciales_tienda` existe, pero tiene cero filas y aún no tiene
  `rubro`. No existen `metas_comerciales_anuales`, `tallas_nissei`, la vista de
  códigos de portal ni el índice hash.
- `productos` tiene 265,612 filas; 47,960 códigos son canónicos de 14
  caracteres. No hay grupos duplicados tras la normalización requerida por el
  futuro índice hash. PostgreSQL 17.6 tiene `pgcrypto` 1.3 instalado en
  `extensions`. La migración de catálogo no elimina columnas heredadas.
- Las 45 contraseñas operativas no nulas ya son bcrypt `$2b$12$`; las otras
  225 cuentas tienen contraseña nula. La migración de claves no debe volver a
  convertir esos 45 hashes.
- El backfill de solo lectura de la versión `20261018T182658Z-ecc5c3a0d968`
  encontró 216 filas para 2024, 216 para 2025 y 408 de TEXTIL/CALZADO para
  2026; no faltan mapeos de tiendas. `T018` tiene 12 metas totales cero en
  2026 y no tiene desglose por rubro; no se inventarán cifras.
- `scripts/backfill-commercial-goals.mjs` ahora detiene la importación si una
  meta existente tiene otro importe, envía las 840 filas en una sola operación
  y verifica cada fila e importe al terminar.

La organización Supabase está en Free. Su opción de rama de base exige subir
de plan y muestra un cargo de cómputo de USD 0.01344/h mientras exista la rama.
El panel de Backups confirma que Free no incluye respaldos programados. La
cadena de conexión muestra `[YOUR-PASSWORD]`, no una credencial utilizable;
no hay contraseña de Postgres en el entorno local. Esta máquina tampoco tiene
Docker/Postgres local. La conexión MCP disponible apunta a otro proyecto y la
CLI local sigue enlazada al proyecto legacy `imiuwbhuiqvktcqeyowq`.

El usuario eligió permitir producción **después** de un respaldo. Aún no hay
respaldo verificable ni destino donde ensayar la restauración. Por ello no se
han aplicado migraciones ni backfill al proyecto operativo. No restablecer la
contraseña de producción solo para obtener acceso: puede cortar conexiones
existentes. Una vía segura es proveer una conexión Postgres temporal de forma
local (sin escribir secretos en Git ni en el chat) para hacer un volcado lógico
y ensayar la restauración en otro proyecto antes del despliegue.

## Pasos 2–5: no completados

- **Dashboard:** existen particiones anuales y carga selectiva en código, pero
  la versión publicada todavía contiene los cuatro monolitos. Falta
  preagregación y partición por mes/tienda/rubro, más medir las metas de 15 MB
  iniciales y 5 MB por panel en una versión de prueba.
- **Backend:** `api.js` sigue concentrando los dominios. La carga de Excel se
  hizo diferida, pero la división por dominios y las consultas por gráfica
  todavía no están completas. Ningún índice se retirará sin `EXPLAIN`, métricas
  de consultas e Index Advisor; la migración local de tráfico ya no los borra.
- **React:** Angular sigue siendo el dashboard. No hay migración panel por
  panel, feature flags ni paridad visual/funcional comprobada por rol.
- **Tablas:** hay candidatas legacy documentadas, pero no hay periodo de
  observación, archivo, respaldo probado ni eliminación.

No avanzar al paso 2 hasta aplicar y verificar el paso 1 en el destino
acordado. Tampoco retirar Angular ni tablas antes de sus puertas respectivas.
