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

## Paso 2: optimización del dashboard — verificada en local, no activada en Netlify

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
- `scripts/check-dashboard-payload-budget.py` mide el peor caso sin comprimir.
  Antes de la consulta por API pasaban 18 de 19 escenarios: el detalle completo
  de SKU medía 64.682 MB. Ahora el manifiesto excluye ese archivo y los 18
  escenarios estáticos pasan: núcleo 14.280 MB y peor panel 4.858 MB.
  El panel de stock por API se verifica por separado, porque depende de la
  sesión, el corte publicado y los filtros.
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
- En modo directo legacy, el detalle completo de SKU comienza al acercarse a
  la sección de productos mediante `IntersectionObserver`; salir de Inventario
  cancela la observación.
  Los gráficos generales, tallas y traslados pueden mostrarse con sus archivos
  acotados antes de iniciar esa lectura pesada. Esta carga diferida mejora la
  respuesta visible pero no cierra la puerta de 5 MB del detalle predictivo.
- En la base principal se aplicó `20261025180000_dashboard_stock_snapshot.sql`
  y las versiones `20261025181000`–`20261025182000` de la consulta de stock.
  El corte validado 2026-07-31 contiene 176,756 métricas de tienda/SKU y
  66,695 SKU de catálogo. La instantánea queda inaccesible para `anon` y
  `authenticated`; la API aplica el alcance de tiendas del usuario.
- Las señales de marca, salud, proyección, riesgo y productos prioritarios se
  calculan ahora en PostgreSQL para el rubro, jerarquía, tienda y parámetros
  elegidos. La comparación contra los JSON originales dio paridad en el total
  de 142,055 filas y en una tienda de CALZADO. La consulta API real devolvió
  24,034 bytes para las 18 tiendas autorizadas. La consulta conjunta podía
  agotar el tiempo cuando el publicador cargaba archivos; la API ahora consulta
  hasta cuatro tiendas en paralelo y suma las métricas sin alterar el alcance.
  Bajo esa carga respondió en 9.28 s con 24,478 bytes y coincidió con el JSON fuente;
  también pasó un filtro de tienda/rubro/línea/sublínea de 1,203 filas.
  La API conserva el resultado un minuto.
  No se descargan 64.682 MB para abrir esa sección en modo portal.
- El build, 160 pruebas Node (156 conformes, cuatro omitidas), 37 pruebas
  Python, ESLint y el presupuesto de archivos pasaron. La compilación de
  producción excluye `assets/data/**` del sitio. La inspección visual local
  mostró el nuevo panel de salud; todavía aparecen respuestas 404 esperadas
  del manifiesto anterior para los nuevos archivos compactos, por lo que la
  prueba visual completa se repetirá después de publicar la nueva versión.
- La versión anterior de Supabase sigue siendo la única publicada. Se
  detuvieron y limpiaron dos cargas temporales: activar un manifiesto sin el
  archivo grande antes de desplegar el frontend actualizado podría romper
  clientes anteriores. Netlify requiere reconectar la integración para
  comprobar el despliegue de TEST2; la publicación de datos queda pendiente
  hasta confirmar la compatibilidad del sitio consumidor. El usuario indicó
  que Netlify existe pero que por ahora se validará localmente. El backend
  local puede leer explícitamente una versión `staging` mediante
  `DASHBOARD_PREVIEW_RELEASE_VERSION`; ese ajuste solo funciona con
  `CONTEXT=dev` y no cambia la publicación activa.
- La versión `20261026T041029Z-fd83aac2ac10` quedó preparada en `staging`:
  136 archivos generales y 2,720 archivos privados de tienda/clúster,
  298,443,807 bytes lógicos. `scripts/verify-staged-dashboard.py` comprobó
  nombres, tamaños y checksums de los 136 archivos, cobertura completa de
  alcances y descargas reales del núcleo y de tallas de una tienda.
  `dashboard-stock-products.json` no figura en el manifiesto nuevo.
- La API local con esa versión preparada pasó una prueba de navegador en
  `http://127.0.0.1:5180/comercial/`: Inventario y el panel de salud mostraron
  importes reales, `/commercial/stock-insights` devolvió HTTP 200 y no hubo
  respuestas 404 para los archivos compactos. Pasaron 161 pruebas Node (157
  conformes, cuatro omitidas), 37 Python, ESLint y el presupuesto de carga.
  La activación pública espera la validación del despliegue Netlify, conforme
  a la indicación de trabajar localmente por ahora.

## Paso 3: backend modularizado y auditado en local

- `netlify/functions/api.js` pasó de 5,272 a 1,013 líneas. La lógica reside en
  módulos de autenticación, personal, tiendas, comercial, seguridad, marketing,
  reportes, archivos, operaciones, dashboard, capacitaciones, supervisión
  zonal, Mi tienda y Excel. El archivo principal conserva la composición y el
  enrutamiento. La extracción conservó el cuerpo de las funciones y aisló las
  dependencias de cada dominio mediante fábricas.
- Las lecturas de reportes usan `netlify/lib/report-queries.js`; la carga de
  Excel sigue siendo diferida. Cada gráfica comercial lee su archivo agregado
  específico por año, mes, tienda y rubro según los filtros. Inventario usa
  `/commercial/stock-insights`, que consulta por tienda y agrega las respuestas
  sin enviar el detalle completo de SKU.
- La auditoría de integración de solo lectura recorrió 140 rutas y roles contra
  la base principal, sin fallos. Otra auditoría comprobó seis rutas de comercial
  y seguridad, todas HTTP 200. Pasaron 161 pruebas Node (157 conformes,
  cuatro omitidas), 37 Python, ESLint, build y los 18 límites de carga.
- Medición en la base principal: `productos` tiene 265,612 filas y 78 MB;
  `dashboard_stock_metrics`, 176,756 filas y 51 MB; `trafico_tienda`, 58,546
  filas vivas, 8,720 muertas y 19 MB. `pg_stat_statements` está instalado;
  la consulta más acumulada sobre stock registró 76 ejecuciones, media de
  1,528.6 ms y máximo de 6,351.7 ms. Un `EXPLAIN (ANALYZE, BUFFERS)` del
  agregado CALZADO/T001 usó los índices de catálogo y métricas, leyó 3,545
  filas coincidentes y tardó 758.546 ms. No hubo escaneo secuencial de esas
  tablas en ese plan.
- `index_advisor` no está instalado. Se revisó el uso de índices existente:
  `dashboard_stock_metrics_product_idx` registra 4,697,228 búsquedas y el
  índice de jerarquía del catálogo 172; los índices nuevos de código base y
  talla de `productos` todavía registran cero. **No se retiró ningún índice.**
  Antes de una retirada futura se requiere instalar y ejecutar Index Advisor,
  revisar planes representativos y observar uso durante un periodo suficiente.
  La migración local `20261026180000_optimize_operational_schema.sql` sigue
  pendiente en producción; ajusta autovacuum de tráfico, sin borrar índices.

## Pasos 4–5: pendientes

- **React:** Angular sigue siendo el dashboard. Falta migrar panel por panel,
  activar flags y comprobar paridad visual y funcional por rol.
- **Tablas:** hay candidatas legacy documentadas, pero faltan periodo de
  observación, consolidación, archivo, restauración probada y eliminación.

La versión optimizada del paso 2 sigue preparada para validación local; la
publicación pública espera comprobar la compatibilidad de Netlify. No retirar
Angular ni tablas antes de cumplir sus puertas de paridad y restauración.
