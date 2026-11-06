# Auditoría local de base y formulario de personal

Fecha: 2026-11-05
Alcance: lectura estática de las migraciones SQL, dominios Netlify, componentes React y pruebas del repositorio. No se consultó ni modificó el proyecto remoto de Supabase.

## Resultado ejecutivo

- `usuarios` es la tabla canónica del personal operativo. `periodos_laborales` conserva ingresos, retiros y reingresos; la separación es correcta y debe mantenerse.
- Los campos `email`, `telefono_emergencia`, `alergia` y `condicion_salud` son anulables. `numero_hijos` todavía es `NOT NULL DEFAULT 0`; por eso la interfaz puede mostrarlo vacío, pero la API actualmente lo normaliza a `0` al guardar. Si se requiere distinguir “no informado” de “cero hijos”, se debe hacer una migración posterior para permitir `NULL`.
- El formulario local ahora usa casillas de activación para esos cinco datos. Sin marcar, el control no se renderiza y el valor se limpia; al marcarlo, el dato se habilita y pasa a ser obligatorio y validable.
- Hay catálogos duplicados: roles y etiquetas están en `roles`, `Usuarios.jsx`, `Layout.jsx`, `personnel.js` y `shared/store-personnel.js`. Conviene dejar `roles` como fuente de negocio y exportar un catálogo compartido para evitar divergencias.
- Marketing mantiene un segundo perfil (`personal_marketing`) con campos personales en `perfil` JSON. Es funcional, pero duplica `usuarios`; a medio plazo conviene relacionarlo con un `usuario_id` o una tabla de perfil única.
- El historial se arma hoy uniendo cuatro fuentes desde JavaScript (`log_asistencias`, seguimientos de requerimientos, observaciones zonales e incidencias zonales). Una vista SQL homologada reduciría lógica duplicada y facilitaría auditoría y exportación.
- Se identifican tablas históricas o sin uso en el código actual. No deben eliminarse sin respaldo y una ventana de migración.

## Homologación propuesta para el formulario

| Campo | Sin marcar | Marcado | Persistencia actual | Mejora recomendada |
|---|---|---|---|---|
| Correo | `null` | correo válido | `usuarios.email` | agregar `CHECK` de formato básico y mantener índice único parcial si se usa para login/notificaciones |
| Teléfono de emergencia | `null` | 9 dígitos | `usuarios.telefono_emergencia` | conservar `NULL`; evitar cadenas vacías |
| Número de hijos | vacío en UI | entero `>= 0` | `usuarios.numero_hijos` guarda `0` si vacío | migrar a nullable si se necesita distinguir “no informado” de “0” |
| Alergia | `null` | texto descriptivo | `usuarios.alergia` | conservar `NULL`; no guardar “Ninguna” como texto técnico |
| Condición de salud | `null` | texto descriptivo | `usuarios.condicion_salud` | conservar `NULL`; restringir acceso por rol y auditar lectura |
| Nivel de estudios | valor seleccionado | Técnico/Universitario/Posgrado | `usuarios.grado_academico` | `carrera` solo para esos niveles; limpiar carrera para Primaria/Secundaria |
| Fecha de retiro | no aplica | fecha válida | `usuarios.fecha_salida` + `periodos_laborales` | mantener ambas por compatibilidad, usando `periodos_laborales` como histórico |
| Motivo de retiro | no aplica | catálogo válido | `motivo_salida` + `periodos_laborales` | usar un catálogo FK en vez de texto libre cuando el listado se estabilice |

## Inventario de tablas

### Identidad, tiendas y permisos

| Tabla | Función | Estado / observación |
|---|---|---|
| `usuarios` | Cuenta, ficha personal, rol, tienda y estado laboral actual. | Activa y canónica para personal operativo. |
| `periodos_laborales` | Historial de ingresos, retiros y reingresos. | Activa; tiene un único período abierto por usuario. |
| `tiendas` | Maestro de tiendas, formato, ubicación, jefe y clúster. | Activa; núcleo de alcance. |
| `clusters` | Agrupa tiendas y asigna jefe zonal. | Activa; reemplaza asignación zonal directa. |
| `roles` | Catálogo de roles, nivel y ámbito. | Existe, pero parte del frontend/backend aún está hardcodeada. |
| `horarios_trabajadores` | Horario semanal por trabajador. | Preparada; no se encontró consumo activo en el código auditado. |
| `tienda_jefes_zonales_legacy` | Relación antigua jefe zonal–tienda. | Legacy; reemplazada por `clusters`. |
| `dashboard_users` | Usuarios del portal comercial publicado. | Activa para publicación/comercial; separar claramente de `usuarios`. |
| `dashboard_roles` | Roles del portal comercial. | Activa para portal; posible duplicación conceptual con `roles`. |
| `dashboard_user_scopes` | Alcance de usuarios del dashboard. | Activa para seguridad de datos. |
| `dashboard_scope_files` | Archivos comerciales restringidos por alcance. | Activa en publicación segmentada. |
| `commercial_store_map` | Mapeo portal comercial–tienda. | Activa; revisar si puede derivarse de `tiendas`. |
| `commercial_user_scopes` | Tiendas permitidas por usuario comercial. | Activa; mantener separada de permisos operativos. |
| `apoyos_administradores_tienda` | Asignación temporal de apoyo entre administradores. | Activa; tiene alcance por tienda. |

### Asistencia, capacitación y equipo

| Tabla | Función | Estado / observación |
|---|---|---|
| `asistencias` | Marca diaria por trabajador y tienda. | Activa; fuente operativa. |
| `log_asistencias` | Auditoría de cambios de asistencia. | Activa; fuente del historial. |
| `cursos` | Catálogo de cursos de capacitación. | Activa; reemplazó sesiones antiguas. |
| `curso_roles` | Asigna cursos a roles. | Activa; relación muchos a muchos. |
| `capacitacion_progreso` | Progreso/resultado por usuario y curso. | Activa; base de “Mis capacitaciones”. |
| `encargados` | Catálogo de responsables de capacitación. | Activa; validar si sigue siendo necesario frente a usuarios. |
| `amonestaciones` | Amonestaciones del personal operativo. | Activa. |
| `errores_personal` | Errores operativos y acciones correctivas. | Activa. |
| `coberturas_especiales` | Periodos/días de cobertura entre tiendas. | Activa en operaciones. |
| `cobertura_trabajadores` | Personas asignadas a una cobertura. | Preparada; no se encontró consumo directo suficiente; revisar antes de retirar. |
| `capacitaciones` | Modelo inicial de sesiones fechadas. | Reemplazada por `cursos`/`capacitacion_progreso`. |
| `capacitacion_participantes` | Participantes del modelo inicial. | Eliminada por la migración de capacitación v2. |

### Operación de tienda y zona

| Tabla | Función | Estado / observación |
|---|---|---|
| `documentos_municipales` | Documentos municipales, vencimientos y evidencias. | Activa. |
| `documentos_tienda` | Documentos operativos generales de tienda. | Activa; revisar solapamiento con documentos municipales/legales. |
| `documentos_legales_tienda` | Modelo legal anterior o especializado. | Sin consumo activo detectado; homologar antes de usar. |
| `reclamaciones_tienda` | Libro de reclamaciones. | Activa. |
| `acciones_tienda` | Acciones operativas planificadas/registradas. | Activa. |
| `bitacora_tienda` | Bitácora diaria de eventos y métricas. | Sin consumo activo detectado; podría convertirse en fuente de historial. |
| `visitas_zonales` | Visita del jefe zonal a una tienda. | Activa. |
| `observaciones_zonales` | Hallazgos/checklist y validación de visitas. | Activa; fuente del historial. |
| `mejoras_continuas` | Registro de mejora antes/después. | Sin consumo activo detectado; conservar hasta validar módulo. |
| `requerimientos_tienda` | Solicitud operativa de una tienda. | Activa. |
| `requerimiento_seguimientos` | Seguimiento y evidencias de requerimientos. | Activa; fuente del historial. |
| `tareas_zonales` | Tareas asignadas por jefe zonal. | Activa en reportes/zonal. |
| `incidencias` | Incidencia interna de tienda. | Activa. |
| `incidencia_personas` | Personas asociadas a una incidencia. | Activa como detalle. |
| `incidencia_productos` | Productos asociados a una incidencia. | Activa como detalle. |
| `incidentes` | Modelo anterior de incidentes. | Legacy; el sistema usa `incidencias` e `incidencias_zonales`. |
| `incidencias_zonales` | Incidencia entre tiendas/zona y seguimiento. | Activa; fuente del historial. |
| `apoyos_seguridad` | Apoyo de seguridad por tienda y periodo. | Activa. |
| `apoyo_seguridad_accesos` | Evidencia de acceso del apoyo de seguridad. | Activa; revisar retención de fotos/IP. |
| `bandeja_mensajes_zonal_tienda` | Mensajes entre zona y tienda. | Activa. |
| `notificaciones_asistencia_zonal` | Preferencias de reportes del jefe zonal. | Activa. |
| `programaciones_asistencia_zonal` | Programación de envíos de reportes. | Activa. |
| `envios_asistencia_zonal` | Historial de cada envío y resultado. | Activa. |
| `envios_documentos_vencidos_zonal` | Idempotencia de avisos de documentos vencidos. | Activa. |
| `notificaciones_asistencia` | Programación anterior de notificaciones. | Legacy; no aparece en el código actual. |
| `notificaciones_asistencia_envios` | Envíos del modelo anterior. | Legacy; no aparece en el código actual. |

### Marketing

| Tabla | Función | Estado / observación |
|---|---|---|
| `personal_marketing` | Personal independiente de marketing y perfil JSON. | Activa, pero duplica identidad de `usuarios`. |
| `marketing_tiendas` | Relación personal marketing–tienda. | Activa. |
| `asistencias_marketing` | Asistencia del personal marketing. | Activa. |
| `campanas_marketing` | Campañas, presupuesto, tiendas y personal. | Activa. |
| `entregables_marketing` | Entregables de campañas. | Activa. |
| `seguidores_redes` | Seguidores registrados por red/fecha. | Activa. |
| `incidencias_marketing` | Incidencias de campañas/marketing. | Activa. |
| `validaciones_marketing` | Aprobación u observación de campañas. | Activa. |
| `capacitaciones_marketing` | Capacitaciones propias de marketing. | Activa. |
| `amonestaciones_marketing` | Amonestaciones del personal marketing. | Activa. |
| `errores_marketing` | Errores y correcciones de marketing. | Activa. |

### Catálogo, inventario y publicación comercial

| Tabla | Función | Estado / observación |
|---|---|---|
| `productos` | Catálogo maestro de productos y código Nissei. | Activa; dimensión pesada y de alto uso. |
| `productos_tienda` | Existencia/precio por tienda y periodo. | Activa, aunque la publicación comercial usa también archivos/parquet. |
| `marcas` | Catálogo de marcas. | Activa. |
| `tallas_nissei` | Catálogo de tallas homologadas. | Preparada; consumo directo no encontrado en el frontend auditado. |
| `trafico_tienda` | Tráfico operativo por tienda, fecha y rango horario. | Activa; requiere índices por tienda/fecha/hora. |
| `metas_comerciales_tienda` | Meta por tienda, periodo y rubro. | Activa; fuente de cuotas. |
| `metas_comerciales_anuales` | Meta corporativa/anual centralizada. | Activa; fuente de meta global. |
| `dashboard_releases` | Versiones/cortes publicados del dashboard. | Activa. |
| `dashboard_files` | Archivos publicados del dashboard. | Activa; aquí viven datos comerciales publicados. |
| `dashboard_stock_snapshots` | Cortes de stock publicados. | Preparada; revisar si la publicación actual ya la usa. |
| `dashboard_stock_catalog` | Catálogo de stock publicado. | Preparada; revisar consumo. |
| `dashboard_stock_metrics` | Métricas agregadas de stock. | Preparada; revisar consumo. |

## Mejoras priorizadas

1. **Ahora (aplicado localmente):** controles de activación para los cinco campos opcionales y limpieza automática cuando se desmarcan.
2. **Siguiente migración SQL:** permitir `NULL` en `usuarios.numero_hijos`, retirar el `DEFAULT 0` y actualizar reportes para mostrar “No informado” cuando sea `NULL`.
3. **Homologar catálogos:** usar `roles`, una tabla de motivos de retiro y catálogos compartidos para nivel de estudios, parentesco, turno y tallas.
4. **Unificar identidad:** agregar `usuario_id` a `personal_marketing` o crear `personal_profiles`; dejar el JSON solo para atributos propios de marketing.
5. **Historial:** crear una vista `v_historial_movimientos` con columnas estándar (`fecha_hora`, `modulo`, `operacion`, `tienda_id`, `realizado_por`, `valor_anterior`, `valor_nuevo`) y consumirla desde la API.
6. **Depuración controlada:** retirar únicamente después de respaldo y confirmación de uso las tablas legacy (`incidentes`, `tienda_jefes_zonales_legacy`, `notificaciones_asistencia`, `notificaciones_asistencia_envios`) y las tablas preparadas sin consumidores confirmados.

### Unicidad de jefaturas

La regla de negocio ya tiene dos defensas: `personnel.js` comprueba que la tienda no tenga otro `jefe_tienda` y el esquema incluye el índice único parcial `usuarios_jefe_tienda_unico_idx` sobre `usuarios(tienda_id)` cuando `rol = 'jefe_tienda'`. La consulta de comprobación está en `supabase/sql/validar_integridad_roles.sql`; no se debe crear otro índice duplicado.
