# Revisión de datos y pantallas — 5 de octubre de 2026

## Cambios realizados

- Lecturas paginadas para evitar totales recortados por el límite de respuestas de la base de datos. Un error de página interrumpe el cálculo, evitando publicar cifras parciales.
- Fechas de negocio y visualización de horas en America/Lima.
- Criterios compartidos para asistencia, faltas, permisos, descansos, suspensión, rotación y avance de capacitación por rol.
- Corrección de rangos horarios, hora pico, valores cero y ausencia de registros de tráfico. Los conteos históricos con horarios desconocidos permanecen en el total y muestran una advertencia.
- Protección frente a respuestas atrasadas al cambiar filtros y mensajes visibles cuando falla una consulta.
- Corrección del alcance de tiendas y personal en los paneles, y del acceso a alertas de gerencia/comercial.
- Gerencia general: gráficos de visitas por clúster y de estados de asistencia/días sin marca; comparativas de tiendas con el mismo periodo y etiquetas explícitas.
- Los porcentajes sin registros se muestran como ausencia de datos. Las capacitaciones se identifican como estado actual cuando no hay historial por periodo.

## Verificación ejecutada

- 21 pruebas automatizadas aprobadas: métricas, paginación, reportes de asistencia y campañas.
- La prueba de paginación procesa 2.305 registros y verifica que un fallo posterior no entregue un total parcial.
- Auditoría de API: 140 comprobaciones por ejecución, sin fallos, para agosto y septiembre de 2026. Incluye permisos y reconciliación de asistencia y tráfico entre vistas.
- Navegación de 75 páginas en 15 roles: sin errores JavaScript, respuestas fallidas de API ni avisos de error. Revisión posterior de 29 páginas en cuatro roles, también sin fallos.
- Inspección visual del resumen de gerencia en escritorio y móvil con datos de septiembre.
- Compilación Vite aprobada. Permanece el aviso de tamaño del paquete de ExcelJS.
- ESLint de código de aplicación, API y utilidades aprobado; comprobación de espacios del diff aprobada.

## Alcance y límites

- Cambios locales: no se publicó ni desplegó la aplicación.
- La auditoría usó consultas de lectura; bloqueó escrituras a API/base de datos y no modificó cuentas ni contraseñas.
- Asistente y trabajador se probaron con sesiones de rol simuladas porque no había cuentas activas correspondientes. Los demás roles utilizaron identificadores existentes con sesiones temporales.
- Las pruebas de navegador verifican navegación y presentación; no certifican todos los formularios de creación, edición y eliminación.
- Los pendientes representan días dentro del vínculo laboral sin marca, incluidos descansos todavía sin registrar. No equivalen a faltas.
- La atribución histórica por tienda depende de la asignación disponible en los datos: no se reconstruyen traslados sin historial de tienda.
- La matriz mensual enumera colaboradores que tienen marcas en el periodo. La comparativa gerencial calcula por separado días pendientes del personal.

## Repetir comprobaciones

Desde la raíz del proyecto, con dependencias instaladas:

```powershell
node --test tests/*.test.mjs
npx.cmd eslint src netlify shared --max-warnings=0
npm.cmd run build
$env:AUDIT_DATE = "2026-09-30"
node scripts/audit-data.mjs
```

La auditoría de API necesita la configuración local de Supabase/JWT en `.env`. No imprime claves ni sesiones. `scripts/audit-browser.mjs` requiere Edge y `playwright-core`; admite la ruta del módulo mediante `AUDIT_PLAYWRIGHT`. Guarda capturas y resultados en `../tmp/web-audit`.
