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
- `/commercial/store-goals` ya no vuelve a descargar y descomprimir el
  `dashboard.json` general cuando las metas centrales y anuales existen en
  PostgreSQL. El fallback a la publicación sigue disponible si falta el plan
  central; el cliente conserva sus metas base por tienda para cualquier fila
  que todavía no esté en la base. Esto evita una lectura pesada en el arranque
  del panel Meta vs real.
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
  La migración `20261026180000_optimize_operational_schema.sql` se aplicó en la
  base principal el 26/10/2026. `pg_class.reloptions` confirmó los factores
  `autovacuum_vacuum_scale_factor=0.05` y
  `autovacuum_analyze_scale_factor=0.02`; la versión quedó registrada en
  `supabase_migrations.schema_migrations`. No se borró ningún índice.

## Paso 4: React autónomo en local; Angular disponible como respaldo

- El 27–28/10 se añadieron cuarenta y tres módulos de interfaz con flags independientes:
  cabecera, navegación, filtros (incluido calendario), indicadores principales,
  indicadores clave, tarjetas de avance, indicadores de talento y controles de
  tallas, dotación por tienda, matriz ampliada de stock, modal de cumpleaños y
  tarjetas completas de tendencia, Meta vs real, desempeño por hora, siete
  gráficos de Talento, tallas, valor de inventario, participación por categoría,
  venta por marca, ranking de tiendas, participación por género, rango de
  precios, rotación/capacidad, antigüedad del stock, salud del inventario,
  prioridad de reposición, valor en riesgo, los tres cuadros emergentes mensuales
  y el detalle de origen del stock, el ranking de vendedores y la matriz de
  traslados entre tiendas, los controles de proyección de inventario y los
  encabezados de página y sección, los estados de acceso y carga y la interfaz
  del asistente comercial. El puente conserva los mismos
  cálculos de Angular y comunica las acciones al controlador existente. En
  local se activan con `?reactModule=header`, `page-tabs`, `filters`,
  `primary-kpis`, `key-kpis`, `progress`, `talent-kpis`, `size-controls`,
  `talent-capacity`, `stock-matrix`, `birthday-modal`, `growth-card`,
  `meta-vs-real-card`, `hourly-card`, `talent-history-card`,
  `talent-team-card`, `talent-area-card`, `talent-store-card`,
  `talent-exit-card`, `talent-incidents-card`, `talent-training-card`,
  `size-card`, `store-value-card`, `category-card`, `brand-card` o
  `ranking-card`, `gender-card`, `price-range-card`, `rotation-card` o
  `antiquity-card`, `health-card`, `replenishment-card` o
  `projection-card`, `ticket-modal`, `conversion-modal`, `traffic-modal` o
  `stock-origin-modal`, `seller-card`, `transfer-modal` o
  `predictive-parameters`, `section-heading`, `commercial-access` o
  `assistant-widget`;
  en un despliegue se controlan con
  `VITE_COMMERCIAL_REACT_MODULES`. En desarrollo local se muestran todos los
  módulos React por defecto; `?reactModule=angular` vuelve a la interfaz
  Angular y `?reactModule=<id>` aísla un módulo. El despliegue público conserva
  Angular por defecto.
  Una comprobación de gerencia comercial a 1440 px confirmó el cambio de año,
  navegación, filtros de mes y día, restablecimiento y apertura del detalle de
  ticket y de cumpleaños. Los controles de tallas cambiaron entre CALZADO,
  TEXTIL, stock y EUR y abrieron la matriz. Cabecera, navegación, filtros,
  indicadores, controles de tallas, dotación, matriz de stock, modal de
  cumpleaños y la mayoría de tarjetas completas tuvieron
  cero píxeles distintos; las tarjetas de avance variaron 26 de 366,490
  píxeles en un área de 8 × 10 px. La tarjeta de equipos varió 24 píxeles
  en el icono del título. Capacitación conserva una diferencia acotada a las
  etiquetas del lado izquierdo (1,578 de 78,540 píxeles), ya observada en la
  comparación previa del gráfico. Las acciones de cambiar audiencia y ampliar
  la tarjeta respondieron en ambos motores.
  Las cinco tarjetas nuevas pasaron una comprobación local de gerencia a
  1440 px, incluyendo sus acciones. Tallas, categoría, marca y ranking
  coincidieron píxel por píxel; inventario difirió 69 de 1,183,396 píxeles
  en el borde derecho de la vista ampliada.
  Género, precios, rotación y antigüedad pasaron una prueba local de acciones
  y comparación con Angular. Rotación y antigüedad coincidieron píxel por
  píxel; precios difirió 18 píxeles en el icono de ampliar y género 314 píxeles
  en una etiqueta exterior del gráfico circular. La prueba de antigüedad esperó
  la carga efectiva de sus datos; ciertos archivos opcionales devolvieron 404
  y el cliente utilizó su ruta de respaldo.
  Las tres tarjetas predictivas pasaron una comprobación local de gerencia y
  acciones; salud y valor en riesgo coincidieron píxel por píxel. Prioridad
  de reposición difirió en una etiqueta de 88 × 8 px (323 píxeles), dentro de
  la tolerancia acotada que ya se aplicaba a esa gráfica. Se fijó un criterio
  alfabético para prioridades empatadas y evitar cambios de orden entre cargas.
  Ticket, conversión y tráfico coincidieron píxel por píxel en la prueba
  local; se comprobó cambio de año y cierre. El detalle de origen del stock
  abrió y cerró con la misma tabla; su captura difirió 1,059 de 1,183,396
  píxeles por un tooltip que permaneció brevemente visible tras el clic.
  El puente de módulos ahora también monta las vistas creadas después de
  abrir el dashboard. Se amplió el límite duro del paquete Angular de
  1.50 a 1.55 MB para permitir el puente temporal; el tamaño actual es
  aproximadamente 1.50 MB y el límite de advertencia de 1.30 MB sigue activo.
  El servidor local admite un puerto API alternativo para comprobar datos
  preparados sin cambiar la versión publicada.

- El ranking de vendedores y la matriz de traslados tienen pilotos React y
  conservan Angular como vista predeterminada. El ranking muestra los mismos
  datos y el control vertical en ambos motores; su captura difiere 5,917 de
  132,240 píxeles dentro del área del gráfico por pequeñas posiciones de barras
  y etiquetas. La comparación limita esa tolerancia al interior del gráfico.
  La matriz mostró 719 de 1,183,396 píxeles distintos en una captura local,
  dentro del límite visual; también se comprobaron rubro, expansión de rutas
  y cierre. Los controles de proyección coincidieron píxel por píxel en una
  captura local; se probaron el cambio de rubro, la unidad de demanda y la
  merma. El encabezado de Cobertura y distribución coincidió píxel por píxel
  y abrió el modal de traslados. Los cálculos y filtros siguen en el
  controlador Angular. El estado de acceso denegado de `commercial-access`
  coincidió píxel por píxel al neutralizar el fondo animado de la captura.
  El asistente coincidió píxel por píxel con Angular en una captura local;
  apertura, escritura de borrador y cierre funcionaron con el servicio actual.
  Una prueba conjunta de las tres páginas pasó con gerencia comercial,
  jefatura zonal y jefatura de tienda a 1440 px, más gerencia a 820 px.
  Esta prueba comprueba montaje y navegación, sin equivaler a la paridad
  funcional exhaustiva requerida para retirar el controlador Angular.

- Se añadió un puente React/ECharts para veintisiete gráficas: Tendencia interanual,
  Meta vs real, Desempeño comercial por hora, Participación por rubro o
  categoría, Rango de precios vendidos, Ranking tiendas, Venta por marca y
  los dos gráficos de Participación género, Rotación de inventario, Capacidad
  Valor de inventario por tienda, Venta, stock y traslados por talla y
  Antigüedad del stock, Evolución mensual de personal, Venta promedio por
  colaborador de cada equipo, Distribución del equipo por área, Productividad
  por tienda, Avance de capacitación, Retiros por motivo, Incidencias externas,
  Salud de inventario, Prioridad de reposición, Valor en riesgo y los tres
  gráficos emergentes de ticket, conversión y tráfico.
  Reciben la misma opción ECharts y los
  mismos filtros que Angular; las tarjetas, sus controles y los demás paneles
  continúan en Angular.
- La activación es por ID mediante `VITE_COMMERCIAL_REACT_CHARTS` (lista
  separada por comas). Por defecto los gráficos siguen en Angular. Solo en Vite
  local puede probarse una gráfica con `?reactChart=growth`,
  `?reactChart=meta-vs-real`, `?reactChart=hourly-performance`,
  `?reactChart=category-participation`, `?reactChart=price-range` o
  `?reactChart=store-ranking`, `?reactChart=brand-sales`,
  `?reactChart=gender-donut`, `?reactChart=gender-bar`,
  `?reactChart=inventory-rotation`, `?reactChart=inventory-capacity` o
  `?reactChart=inventory-store-value`, `?reactChart=inventory-sizes` o
  `?reactChart=inventory-antiquity` o alguno de los siete IDs de talento
  (`talent-history`, `talent-team-productivity`, `talent-area-distribution`,
  `talent-store-productivity`, `talent-training`, `talent-exit`,
  `talent-incidents`), uno de los tres IDs predictivos
  (`predictive-health`, `predictive-replenishment`, `predictive-projection`)
  o uno de los emergentes (`modal-ticket`, `modal-conversion`,
  `modal-traffic`).
- `scripts/audit-commercial-react-pilot.mjs` comparó Angular y React para
  gerencia comercial, jefatura zonal y jefatura de tienda, a 1440/820 px y
  en 2026/2025. Tendencia, Meta vs real, Desempeño por hora y la vista Rubro
  de Participación tuvieron cero píxeles distintos en sus seis pares cada una.
  La vista Categoría conservó el lienzo y los controles; una sola etiqueta
  exterior cambió de posición en un área de hasta 38 × 29 px (máximo 308 de
  107,415 píxeles). El comparador limita expresamente esa excepción a una
  caja pequeña y mantiene tolerancia de 0.1 % para los otros gráficos.
- Rango de precios espera la partición seleccionada antes de pintar; las seis
  comparaciones conservaron el mismo lienzo y mostraron entre cero y 18
  píxeles distintos en la tarjeta, limitados al icono de ampliar. Los
  porcentajes sobre las barras ahora se eligen por importancia y separación
  para evitar saturación y ocultaciones variables entre motores.
- Ranking tiendas tuvo cero píxeles distintos en los seis escenarios base,
  en los seis escenarios de solo Markup y en los seis escenarios donde se
  interrumpió la petición del ranking central. La auditoría detectó que el
  fallback local mostraba 18 tiendas durante la carga para una jefatura de
  tienda. El universo y el contador ahora aplican el alcance del rol antes
  de pintar, incluso si la petición central falla; una respuesta de sesión
  anterior tampoco puede sobrescribir el ranking actual.
- Venta por marca tuvo cero píxeles distintos en los seis escenarios normales
  y en los seis ampliados con la tabla de detalle. Se fijó una selección de
  hasta cuatro etiquetas de participación separadas entre sí para evitar
  saturación y decisiones variables de ocultación de ECharts.
- Participación género conserva el anillo normal y las barras de la tarjeta
  ampliada con la misma opción ECharts. Las barras tuvieron cero píxeles
  distintos en seis escenarios. El anillo, tanto con ambos rubros como con
  solo Textil, conservó el lienzo y los controles; una etiqueta exterior se
  desplazó en algunos casos dentro de un recuadro máximo de 47 × 29 px.
  El comparador solo tolera ese desplazamiento acotado en etiquetas de pie.
- Rotación y Capacidad tuvieron cero píxeles distintos en seis escenarios
  cada una, incluidos los roles con alcance de tienda y clúster. La auditoría
  de Rotación espera datos reales de `dashboard-stock-hierarchy.json`; una
  captura temprana había mostrado 0% y no se aceptó como paridad. La tarjeta
  ahora muestra un estado de preparación mientras carga el agregado de stock.
- Valor de inventario por tienda tuvo cero píxeles distintos en la tarjeta
  normal y la vista ampliada con matriz, seis escenarios cada una. Antes de
  completar la carga, los colores y la cobertura podían cambiar entre una
  lectura y otra; ahora se espera al agregado de stock para mostrar ambos.
- La gráfica de tallas de CALZADO pasó una comprobación local de gerente
  comercial con 2026 y 1440 px, usando 24,934 píxeles visibles en el mismo
  lienzo de 512 × 302 px. El detalle TEXTIL del corte actual contiene 37,582
  SKU del rubro pero cero tallas mapeadas; el estado vacío lo indica
  explícitamente y conserva la opción de reintentar si falló la consulta de
  códigos. En una comprobación de TEXTIL/STOCK con ese mismo rol y ancho,
  Angular y React tuvieron cero píxeles distintos en la tarjeta. La importación
  de tallas textiles reales sigue pendiente de datos
  con la codificación descrita por el negocio.
- Antigüedad de stock mantuvo el mismo lienzo de 645 × 281 px en una prueba
  local de gerente comercial; la diferencia de tarjeta fue de 18 píxeles,
  limitada al icono de ampliar. Al pulsar una barra se abrió el detalle por
  tienda tanto con Angular como con React.
- Siete gráficas de Talento se compararon localmente con gerencia comercial,
  2026 y 1440 px. Seis tarjetas tuvieron cero píxeles distintos. En Avance de
  capacitación las barras coincidieron y la diferencia quedó dentro del área
  de las etiquetas a la izquierda, 1,578 de 78,540 píxeles. La auditoría
  limita expresamente la excepción a esa zona.
- El ranking de vendedores conserva Angular por defecto mientras se completa
  la comprobación de roles; el piloto React muestra el mismo control de
  desplazamiento y los mismos datos, con diferencias pequeñas en posiciones
  dentro del lienzo documentadas arriba.
- Las tres tarjetas predictivas visibles y los tres gráficos emergentes
  pasaron una comprobación local con gerencia comercial, 2026 y 1440 px.
  Salud, valor en riesgo, ticket, conversión y tráfico tuvieron cero píxeles
  distintos. En reposición, 323 de 128,880 píxeles cambiaron dentro de una
  sola etiqueta truncada de 88 × 8 px; el comparador limita esa excepción.
- La respuesta de metas retenida artificialmente mostró el mismo estado
  “Cargando metas…” en Angular y React, cero píxeles distintos en seis pares.
  El gráfico solo se crea después de recibir metas; un token de carga impide
  que una respuesta vieja reemplace las metas de una sesión nueva.
- Las tres páginas visibles (Gestión comercial, Inventario y Talento) ya tienen
  composición completa en React bajo `commercial-page`, `inventory-page` y
  `talent-page`. Los controles y tarjetas existentes se reutilizan dentro de
  cada página. La vista Angular sigue disponible con `?reactModule=angular`.
  En Vite local React es la opción predeterminada; el build público conserva
  Angular como predeterminado porque Netlify sigue fuera del alcance acordado.
- La comparación local de Talento tuvo la misma dimensión y 24 píxeles
  distintos de 1,374,064 a 1440 px; a 820 px cambió 18 de 2,120,864.
  Se recorrieron las tres páginas con gerencia comercial, jefatura zonal y
  jefatura de tienda. Las páginas Comercial e Inventario conservaron el ancho;
  sus alturas difieren 2 y 8 px respectivamente en el escenario de 1440 px.
  Se verificaron interacciones básicas de tarjetas y filtros de cada página.
- Se corrigió el ciclo de vida del gráfico React: el cambio de callback ya no
  destruye el lienzo ECharts sin volver a aplicarle la opción. Esto eliminó un
  gráfico de antigüedad que podía quedar blanco tras una actualización.
  El gráfico de pronóstico de quiebre que ya estaba oculto dejó de instanciarse
  en Angular; las otras dos vistas ocultas siguen dentro de `@if (false)`.
- Angular todavía coordina la carga, cálculos, estado y permisos que alimentan
  los modelos React. Retirarlo requiere trasladar ese controlador y completar
  la paridad funcional y visual; no se ha activado ningún flag en Netlify.
- El 28/10 se añadió un montaje React completo para la vista comercial local.
  Las tres páginas, cabecera, filtros, navegación, cuadros emergentes y asistente
  se renderizan en React, sin crear la vista del componente Angular. Se comparte
  la misma hoja visual de la aplicación. Vite local usa este montaje de forma
  predeterminada; `?reactModule=angular` o `?reactShell=angular` conservan la
  vista Angular. La compilación pública mantiene Angular como opción inicial;
  `VITE_COMMERCIAL_REACT_SHELL=true` permite activar React de forma explícita
  al compilar una futura versión de prueba, sin cambiar la publicación actual.
  El controlador `App` y `CloudDataService` aún usan señales e inyección de
  Angular; esto sigue siendo una migración en curso, no la retirada del runtime.
- Comprobación local acotada con la versión preparada
  `20261026T041029Z-fd83aac2ac10`: Comercial, Inventario y Talento pasaron
  controles básicos frente a Angular con gerencia comercial a 1440 px; los
  paneles tuvieron el mismo ancho y diferencias de alto de 2, hasta 8 y 0 px.
  También se recorrieron las tres páginas y el asistente con jefatura de tienda
  a 820 px. ESLint y ambos builds pasaron. La publicación activa anterior
  devuelve 404 para el detalle de vendedores; la versión de prueba local sí
  lo sirve. Faltan migrar el controlador y sus servicios, medir paridad más
  amplia y activar los flags en un despliegue verificable antes de retirar
  Angular.
- La auditoría del montaje completo recorrió los tres roles comerciales en
  1440 y 820 px, abrió las tres páginas y el asistente en cada combinación;
  los doce recorridos (Angular y React) terminaron sin errores de la API. El
  controlador se separó de `app.ts` en `dashboard-controller.ts`; `App` ahora
  contiene solo la vista Angular de respaldo. React instancia directamente el
  controlador y no crea el componente Angular. El controlador y los servicios
  todavía usan señales e inyección de Angular: queda trasladar ese estado a
  React antes de poder retirar el runtime.
- Tras integrar el cambio de traslados por tienda de `TEST2`, el modal se
  comprobó en Angular y React con jefatura de tienda: abrió, filtró por rubro,
  mostró las rutas y permitió comparar y cerrar. Una respuesta incompleta ya
  no deja el panel cargando sin fin; muestra el error y permite reintentar.
  Si una tienda no tiene productos candidatos, ambos montajes indican ese
  estado explícitamente. La consulta HTTP local de una tienda autorizada
  devolvió 986 rutas y 1,504 posiciones en unos 2.6 segundos; la prueba de
  navegador completa tardó más por la carga de la página y sus detalles.
- El montaje React ya importa el controlador y los servicios directamente desde
  Vite. Las señales usan `@preact/signals-core` en esa ruta y React no solicita
  `/comercial/index.html` ni el bundle Angular. La ruta Angular permanece
  seleccionable con `?reactModule=angular`; local usa React por defecto y un
  despliegue requiere `VITE_COMMERCIAL_REACT_SHELL=true` para activarlo.
- Se compararon Comercial, Inventario y Talento con Angular a 1440 px, incluidos
  gráficos y controles; sus contenedores tienen el mismo tamaño. Los tres roles
  comerciales recorrieron las tres páginas y el asistente a 1440 y 820 px.
  El gráfico de metas se verificó con carga diferida y cambio al año 2025 en
  820 px. El endpoint de metas se priorizó y tiene un reintento acotado cuando
  una respuesta HTTP queda sin completar. Pasaron ESLint y los builds Angular
  y Vite. Las capturas completas no son idénticas píxel por píxel, por lo que
  Angular se conserva como respaldo hasta una revisión visual final y prueba
  en el despliegue que active React.
- En 820 px se corrigieron alturas de la tarjeta de género y de la proyección
  de inventario. Pasaron las comparaciones de tamaño y controles de Comercial
  con jefe de tienda, Inventario con jefe zonal y Talento con gerente comercial.
  Los archivos de captura aún difieren; estas pruebas no demuestran igualdad
  visual completa ni autorizan por sí solas retirar el respaldo Angular.
- La auditoría de páginas ahora aplica el año indicado antes de capturar. Se
  repitieron los tres escenarios de 820 px con 2025 seleccionado y pasaron
  sus comprobaciones de controles y dimensiones. Las capturas largas del
  navegador incluyen zonas negras fuera del área visible; se requieren
  capturas por secciones para verificar esas zonas antes de retirar Angular.
- La auditoría captura ahora cada tarjeta tras desplazarla al área visible,
  evitando las zonas negras de la captura larga. Con la misma respuesta real
  de metas en ambas vistas, las comprobaciones de texto y tamaño pasaron para
  12 tarjetas de Comercial a 1440 px, siete de Inventario y nueve de Talento a
  820 px. Las capturas siguen teniendo diferencias de píxeles; esta muestra no
  cubre todas las combinaciones ni confirma por sí sola la paridad completa.
- Se alineó el orden de las hojas de estilos del montaje React con el de
  Angular. Así el título de prioridad de reposición vuelve a caber en una línea
  como en la vista original. Comercial pasó las comprobaciones de texto,
  dimensiones y controles para los tres roles a 1440 y 820 px. Inventario con
  jefe zonal y Talento con gerencia comercial se comprobaron en esos dos anchos.
  Las capturas de las tarjetas siguen presentando diferencias de píxeles, por
  lo que estos resultados no demuestran equivalencia visual completa. El
  respaldo Angular permanece disponible y el paso 4 no se considera finalizado.

## Paso 5: pendiente tras la validación final del paso 4

- Hay candidatas legacy documentadas, pero faltan el periodo de observación,
  consolidación, archivo, restauración probada y eliminación. El respaldo
  lógico previo fue validado con `pg_restore` como archivo, pero todavía no se
  ha restaurado en una instancia independiente. No se ha borrado ninguna tabla.

La versión optimizada del paso 2 sigue preparada para validación local; la
publicación pública espera comprobar la compatibilidad de Netlify. No retirar
Angular ni tablas antes de cumplir sus puertas de paridad y restauración.

## Actualización 29/10: migración del portal comercial a React

- La aplicación monta directamente el controlador y las páginas React. Se retiraron
  el build, las dependencias y el código fuente Angular del repositorio; las
  utilidades comerciales, señales y estilos viven en `src/commercial/`.
- Los datos generados se conservaron localmente en `dashboard-data/` (ignorado
  por Git). Los scripts de generación y publicación apuntan a esa ruta.
- La comparación previa de tarjetas entre Angular y React tuvo el mismo texto
  y dimensiones en los roles y anchos probados. Las diferencias de captura
  recientes fueron inferiores a 0.86 niveles RGB de 255 en promedio por píxel;
  la mayor se concentró en una etiqueta del gráfico de género.
- El portal React recorrió Comercial, Inventario, Talento y el asistente en
  gerencia comercial, jefatura zonal y jefatura de tienda a 1440 y 820 px.
  Pasaron 52 pruebas de lógica, ESLint y el build Vite. Esta comprobación local
  no equivale a una prueba de la futura publicación en Netlify.

Las frases anteriores sobre el respaldo Angular describen el estado histórico
de cada fecha; a partir de esta actualización ya no existe ese respaldo en
el código versionado.
