# Asiste

Gestión de asistencias y capacitaciones para varias tiendas. React + Vite en el frontend, una Netlify Function como API privada y Supabase (Postgres) como base de datos.

## Roles

- **Administrador**: Dashboard general, Documentos (exportar Excel), Usuarios y Tiendas.
- **Jefe de tienda**: Dashboard de su tienda, registro de Asistencias y Capacitaciones de su equipo, y su perfil.
- **Empleado**: consulta de su propia asistencia y capacitaciones, y su perfil.

## Arquitectura

- `src/`: interfaz React (login, sidebar, dashboard con Recharts, páginas por rol).
- `netlify/functions/api.js`: API privada. Autenticación propia (usuario + contraseña con bcrypt, sesión JWT en cookie httpOnly) y acceso a la base de datos con `@supabase/supabase-js` usando la *service role key* (nunca se expone al navegador).
- `scripts/dev-api.js`: servidor de la API únicamente para desarrollo local (usa el mismo `handler` que Netlify en producción).
- `supabase/migrations/0001_init.sql`: esquema inicial (tiendas, usuarios, asistencias, capacitaciones). Se ejecuta manualmente una vez desde el SQL Editor de Supabase.
- `netlify.toml`: build, funciones y redirecciones para Netlify.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://127.0.0.1:5180`. El comando inicia tanto React como la API local.

Variables requeridas en `.env` (ver `.env.example`):

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx
JWT_SECRET=un-secreto-largo
```

Para generar un `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Base de datos

1. Abre el SQL Editor de tu proyecto en Supabase.
2. Pega y ejecuta el contenido de `supabase/migrations/0001_init.sql`. Crea las tablas, restricciones y un usuario administrador inicial:
   - Usuario: `admin`
   - Contraseña: `Admin123!`
   - **Cámbiala apenas ingreses** (Usuarios → editar → nueva contraseña).

## Despliegue en Netlify

1. Sube el proyecto a GitHub y crea un sitio desde ese repositorio.
2. Netlify detectará `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. En **Site configuration → Environment variables**, agrega `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `JWT_SECRET`.
4. Despliega el sitio.
5. Comprueba `https://tu-sitio.netlify.app/api/health`; debe responder que la base está conectada.

No configures secretos con el prefijo `VITE_`: ese prefijo los haría visibles en el frontend.

## Seguridad incorporada

- Sesión firmada en cookie `HttpOnly`, `Secure` y `SameSite=Lax`.
- Rutas protegidas por rol (`admin`, `jefe_tienda`, `empleado`).
- Contraseñas con bcrypt (costo 12).
- Límite básico de intentos de acceso por IP.
- La *service role key* de Supabase solo vive en variables de entorno del servidor.

## Verificación

```bash
npm run check
npm run build
```
# Tienda-asistencia-cap
