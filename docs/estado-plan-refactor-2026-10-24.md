# Estado y puerta de la refactorización integral

Rama Git local: `prueba/refactor-integral`. El proyecto operativo es
`xtnihjzqnxozbotymoma` (`bd-app`), no el proyecto legacy al que está enlazada
la CLI local. El paso 1 incluyó cambios verificados en esa base principal.

## Paso 1: corrección de datos — aplicado y verificado en la base principal

- Antes de escribir, se creó un volcado lógico completo con `pg_dump 17.11`
  fuera de Git, en `%LOCALAPPDATA%/DashBoardGeneral/backups/`. El archivo
  `xtnihjzqnxozbotymoma-pre-migrations-20261024-083607.dump` tiene
  6,124,539 bytes, 1,117 entradas (105 de datos, incluidas las 66 tablas de
  `public`), se leyó íntegramente con `pg_restore` y tiene SHA-256
  `B2B20F606FC4515D9D4C0EE9BD1F982F89AC2723E18BC3158634B396C3AC93FB`.
  La prueba de restauración en una instancia independiente sigue pendiente;
  es obligatoria antes de retirar tablas en el paso 5.
- Se aplicaron transaccionalmente las migraciones de metas, tallas y códigos
  de producto. El esquema y los permisos se comprobaron con SQL y por la API.
  El historial remoto se reparó para seis versiones ya verificadas, desde
  `20261020120000` hasta `20261023162555`. La migración operativa
  `20261023164227` se reserva para el paso 3.
- El backfill de la publicación `20261018T182658Z-ecc5c3a0d968` importó y
  verificó 840 metas: 216 en 2024 (S/ 51,719,360.62), 216 en 2025
  (S/ 68,152,791.94) y 408 de TEXTIL/CALZADO en 2026
  (S/ 66,358,635.86). `T018` no tenía desglose 2026 y no se inventaron cifras.
  La vista calcula 204 totales mensuales de tienda para 2026.
- El catálogo contiene 68 tallas. De 265,612 productos, 47,960 tienen código
  canónico de 14 caracteres y 34,558 obtienen una talla del catálogo.
  No hay derivaciones de talla desde códigos de longitud distinta ni colisiones
  del identificador normalizado. `EXPLAIN ANALYZE` confirmó que la búsqueda
  por identificador usa `productos_codigo_portal_id_ux`.
- Las 45 contraseñas no nulas ya estaban en bcrypt; la migración modificó
  cero filas. La API confirmó acceso de servicio a metas, tallas y vista de
  códigos. Pasaron 241 pruebas Node (8 omitidas), 8 pruebas Python, ESLint y
  el build. El build aún avisa que el bundle inicial Angular supera su límite.

La organización Supabase está en Free y no dispone de respaldos programados.
La CLI local continúa enlazada al proyecto legacy `imiuwbhuiqvktcqeyowq`;
las migraciones se aplicaron con la conexión explícita a la base principal,
sin usar `db push` indiscriminadamente. La contraseña temporal se retiró del
árbol de trabajo al concluir las operaciones de base.

## Paso 2: optimización del dashboard — en curso, no publicado

- La publicación vigente contiene 42 archivos y 848.85 MiB descomprimidos
  (53.97 MiB almacenados con gzip). `dashboard.json` mide 15.36 MiB y supera
  el objetivo inicial de 15 MB. Los mayores detalles individuales son
  vendedores (84.81 MiB), productos de stock (56.83 MiB), marcas (39.64 MiB),
  rangos de precio (33.84 MiB) y sublíneas (29.32 MiB).
- El resumen inicial de marcas repetía tres campos vacíos en 49,252 filas.
  Se compactó el generador sin alterar los importes ni las unidades; la
  regeneración local redujo el núcleo de 15.36 a 13.62 MiB (14.28 MB
  decimales), por debajo de la puerta de 15 MB. Aún no se ha publicado.
- El ranking de vendedores sin filtros jerárquicos se preagrupó por
  mes/tienda/vendedor: 498,005 filas históricas quedan en 9,044 filas de
  resumen, de 0.44–0.46 MiB por año. Al elegir un mes y un filtro de
  rubro/línea/sublínea se descarga su partición mensual, cuyo máximo medido
  es 4.32 MiB (4.53 MB). La vista conserva un fallback para publicaciones
  antiguas y cancela solicitudes de vendedor al cambiar los filtros.
- Con filtro exclusivo de rubro, vendedores usa ahora un resumen exacto por
  mes/tienda/rubro/vendedor. El peor año regenerado mide 4.858 MB, dentro de
  la puerta de 5 MB. El filtro de línea o sublínea conserva el detalle y el
  fallback anual anterior; los archivos nuevos todavía no se han publicado.
- Rango de precios sin filtros jerárquicos usa totales por mes/tienda/banda:
  los tres resúmenes anuales suman 0.90 MB y la comparación habitual de dos
  años descarga menos de 0.61 MB. Con rubro/línea/sublínea conserva el detalle
  original. El cambio de filtros cancela la carga anterior y evita pintar una
  respuesta obsoleta. Si además se elige un mes, descarga solo ese mes para
  cada año comparado; la mayor partición individual mide 1.574 MB.
- Con un filtro exclusivo de rubro, la comparación de precios usa bandas
  agregadas por mes/tienda/rubro. Los dos años más grandes suman 2.898 MB;
  conservan importes y unidades. Con filtro de línea o sublínea continúa
  utilizando el detalle. Hay fallback para la publicación anterior.
- Marca con solo filtro de rubro usa un resumen exacto por mes/tienda/rubro/
  marca, máximo 2.326 MB por año. El detalle de sublínea ya no se solicita al
  filtrar únicamente por rubro o línea. La actualización de índices de marcas
  y sublíneas ahora invalida sus cálculos reactivos al finalizar la carga.
- La codificación sin pérdida comparte dimensiones repetidas y reconstruye
  todas las filas en el navegador. Los máximos anuales son vendedores 4.764 MB,
  marcas 2.796 MB y sublíneas 2.638 MB; la comparación de dos años de precios
  suma 4.334 MB. El detalle diario mensual más grande mide 4.656 MB y el
  predictivo por SKU 3.777 MB. Se conserva fallback para versiones anteriores.
  La publicación por tienda o clúster vuelve a codificar solo sus propias
  filas y diccionarios para no filtrar nombres o SKU de otro alcance.
- Antes de regenerar se copiaron los 42 JSON locales (890,085,911 bytes) a
  `%LOCALAPPDATA%/DashBoardGeneral/backups/dashboard-data-pre-regen-20261024-1740`.
  `scripts/verify-dashboard-regeneration.py` comparó 202 conjuntos de filas
  sin depender del orden: cero diferencias no explicadas. La única variación
  en stock es el campo adicional `productCode`; la fecha `generatedAt` cambió
  como corresponde. El manifiesto local incluye 137 archivos, sin faltantes;
  prefiere los detalles compactos a los anuales y mensuales crudos.
- `scripts/check-dashboard-payload-budget.py` mide el peor caso sin comprimir
  y falla hasta que se cumplan ambas puertas. Pasan 18 de 19 escenarios:
  únicamente falla el detalle completo de SKU (64.682 MB). Esa misma matriz
  aún alimenta búsqueda de SKU y cálculos predictivos; requiere
  preagregados para los gráficos y consultas específicas para el detalle.
  La nueva versión no se publicará antes de preservar esas funciones y probar
  el máximo de 5 MB por panel completo, no solo por archivo.
- Un agregado exacto por tienda/rubro/línea/sublínea/marca ocupa 0.898 MB y
  alimenta cobertura, rotación y totales mientras carga el detalle. Los SKU
  candidatos para traslados ocupan 0.817 MB; las 2,839 recomendaciones
  calculadas con ellos coinciden, fila por fila y en orden, con las del archivo
  completo. El publicador filtra y vuelve a codificar ambos archivos por
  tienda o clúster. También se corrigió el filtrado del nuevo formato compacto
  de vendedores por alcance, que habría impedido publicarlo.
- Una codificación sin pérdida de todo el stock ocupa 13.177 MB; incluso el
  rubro TEXTIL ocupa 6.727 MB. Esto confirma que la búsqueda y los paneles
  restantes requieren agregados o consultas por filtro: comprimir el mismo
  detalle no satisface el límite de 5 MB.
- Las tallas ahora usan un archivo por rubro. TEXTIL mide 3.943 MB y CALZADO
  2.970 MB; con los candidatos de traslado el peor panel suma 4.760 MB.
  `scripts/verify-stock-size-parity.mjs` comparó ventas, stock, traslados y
  conteos exactos de SKU contra las 142,055 filas originales, en USA y EUR:
  cuatro comparaciones conformes. La pantalla mantiene el fallback anterior.

## Pasos 3–5: no completados

- **Backend:** `api.js` sigue concentrando los dominios. La carga de Excel se
  hizo diferida, pero la división por dominios y las consultas por gráfica
  todavía no están completas. Ningún índice se retirará sin `EXPLAIN`, métricas
  de consultas e Index Advisor; la migración local de tráfico ya no los borra.
- **React:** Angular sigue siendo el dashboard. No hay migración panel por
  panel, feature flags ni paridad visual/funcional comprobada por rol.
- **Tablas:** hay candidatas legacy documentadas, pero no hay periodo de
  observación, archivo, respaldo probado ni eliminación.

No avanzar al paso 3 hasta publicar y verificar el paso 2. Tampoco retirar
Angular ni tablas antes de sus puertas respectivas.
