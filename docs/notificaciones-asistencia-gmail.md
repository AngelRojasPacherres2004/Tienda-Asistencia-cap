# Configurar avisos de asistencia con Gmail

1. Ejecuta en Supabase SQL Editor las migraciones `supabase/migrations/20260928190000_notificaciones_asistencia_zonal.sql` y `supabase/migrations/20260928203000_programaciones_reportes_asistencia.sql`.
2. Entra a la cuenta `thisisalexa363@gmail.com` y activa la verificación en dos pasos: https://myaccount.google.com/security.
3. Genera una contraseña de aplicación para Asiste en https://myaccount.google.com/apppasswords. Google requiere verificación en dos pasos; algunas cuentas con restricciones no permiten contraseñas de aplicación. Ayuda oficial: https://support.google.com/accounts/answer/185833?hl=es.
4. Configura en `.env` local y en Netlify > Environment variables (ámbito Functions):

   ```env
   GMAIL_USER=thisisalexa363@gmail.com
   GMAIL_APP_PASSWORD=contraseña_de_aplicación_de_16_caracteres
   ```

   No uses la contraseña normal de Google. No subas `.env` a Git ni uses el prefijo `VITE_` para estas variables. Reinicia el servidor local o vuelve a desplegar Netlify después de cambiarlas.
5. Inicia sesión como jefe zonal, pulsa tu nombre abajo a la izquierda y entra en **Ajustes**.
6. Pulsa **Nueva programación**. Escribe nombre, asunto, hora diaria en Lima, alcance (una tienda o todas las activas de tu clúster) y destinatarios (máximo 20). Guarda la programación activa o pausada.
7. Para probar el reporte real, selecciona la fecha y pulsa **Enviar ahora**. Enviará a los destinatarios guardados sin modificar la próxima ejecución automática. Revisa entrada y spam, y el historial de envíos.
8. Vuelve a desplegar el proyecto en Netlify. La función `attendance-reports-cron` revisa las programaciones vencidas cada minuto en el despliegue de producción. El comando `npm run dev` no ejecuta automáticamente esa función; en local puedes utilizar el envío manual. Referencia: https://docs.netlify.com/build/functions/api/ y https://docs.netlify.com/snippets/functions/scheduled-functions/cron-expression-format/.

Los destinatarios reciben el correo en copia oculta. El envío usa SMTP de Gmail por TLS, puerto 465. Cada zonal administra exclusivamente sus programaciones y destinatarios. El reporte incluye resumen, detalle y CSV de su alcance actual. Incluye al personal actualmente activo, incorporado hasta la fecha elegida; una fecha histórica no reconstruye automáticamente la dotación histórica de una tienda.

Asistentes incluye asistencia, tardanza, medio turno y apoyo. **Faltas** cuenta únicamente marcas explícitas de falta. **Sin registro** cuenta personas sin una marca guardada: no se presenta como falta. Permisos, descansos médicos y otros estados se mantienen en el detalle y CSV.

Cada programación automática envía como máximo un reporte por fecha. El historial registra envíos manuales y automáticos, errores y cantidades. Se conserva al eliminar una programación. Los errores de Gmail no revierten asistencias; el reporte fallido se puede volver a enviar manualmente. No hay reintentos automáticos de correos fallidos. Un proceso interrumpido puede quedar como “Enviando”; revisa Gmail antes de reenviarlo manualmente. El programador procesa hasta tres reportes simultáneos por minuto, por lo que una cola grande puede retrasar los envíos.

Los **avisos inmediatos al guardar asistencia** anteriores siguen disponibles en un apartado opcional, independiente de las programaciones. Puedes desactivarlos si solo quieres reportes diarios. Sus avisos se filtran por registros, faltas o tardanzas; guardar sin cambios no genera otro aviso.

Sin la migración no se podrán guardar ajustes. Sin la contraseña de aplicación los correos no se enviarán. Si Gmail revoca la contraseña (por ejemplo, al cambiar la contraseña de la cuenta), genera otra y actualiza el servidor.
