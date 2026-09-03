// La versión publicada obtiene los JSON privados desde Supabase Storage. Angular
// ya excluye assets/data en producción: no los copies nuevamente al resultado,
// porque duplicaría cientos de MB y expondría datos locales. runtime-config.js
// fue generado antes del build con las claves públicas de la instalación remota.
console.log('Build remoto listo: datos privados desde Supabase Storage.');
