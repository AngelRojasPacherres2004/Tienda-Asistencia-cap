# Retiro de incidencias internas de tienda

Por solicitud del usuario, se retiraron el formulario y el permiso de registro de incidencias internas para administrador y asistente de tienda. El registro de incidencias de tienda queda reservado a seguridad y jefe de seguridad.

Limpieza ejecutada el 10 de noviembre de 2026 en `bd-app`: se eliminaron exclusivamente los registros de `incidencias` con IDs 14, 24, 25, 26 y 29, comprobando en la misma sentencia que pertenecieran a usuarios con rol `jefe_tienda` o `asistente_tienda` y fueran de tipo `falla_interna`, `problema_operativo` o `dano_infraestructura`.

Los cinco pertenecian a administradores de tienda; no habia registros del asistente. Ninguno tenia productos ni personas asociados. El conteo paso de 138 a 133. La verificacion posterior encontro cero incidencias asociadas a esos dos roles. No se modificaron otras tablas ni los registros historicos de seguridad cargados por Sistemas.

El asistente conserva su rol y su tienda asignada, y comparte el dashboard comercial, navegacion, vistas de asistencia, Mi tienda y reportes con la administracion de tienda. Su acceso comercial siempre queda limitado al mapeo de su propia tienda; no hereda permisos globales ni de otra tienda.

Los cambios de aplicacion estan en TEST2 local. La limpieza de datos ya se ejecuto en la base conectada.
