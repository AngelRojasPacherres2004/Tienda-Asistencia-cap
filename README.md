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

Para revisar gráficos operativos con una muestra separada, abre `http://127.0.0.1:5180/?demo=1`. Esta vista solo funciona en desarrollo local y simula tráfico por hora y el comparativo zonal en Gestión Asiste. Muestra una etiqueta DEMO; no inserta registros en Supabase ni modifica los indicadores de la vista normal. Las pantallas de captura y los reportes siguen mostrando los datos reales.

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

## Facebook en Marketing

En el proyecto Supabase `bd-app`, guarda `META_ACCESS_TOKEN` y `META_PAGE_ID` en **Edge Functions → Secrets**. La función `supabase/functions/facebook-insights` consulta los seguidores actuales de la página. El token de Meta permanece en Supabase; Netlify solo usa su clave de servicio existente para invocar la función desde la ruta privada `/api/marketing/facebook-insights`, después de validar la sesión y el rol Marketing.

Las campañas de la pantalla son registros internos de la aplicación. Las campañas publicitarias de Meta Ads requieren una cuenta publicitaria (`act_...`) y permisos de Marketing API adicionales; no se mezclan con estos registros. Si Meta rechaza el token, la pantalla muestra un estado de error en vez de inventar una cifra.

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

## Reportes comerciales anuales

La pantalla **Reportes** reúne **Cifras comerciales** y **Personas y operación**. Cada descarga comercial exige exactamente un año; puede acotarse por mes, día, clúster, formato, tienda y clasificación de producto. El detalle CSV conserva fecha, año, mes, día, descripción y columnas separadas. El resumen Excel contiene indicadores, una tabla diaria por tienda y una hoja de stock por tienda. Stock usa la última foto disponible hasta el fin del período y muestra su fecha; no suma inventarios de distintos cortes. Tráfico no tiene clasificación de producto, por lo que esos filtros no aplican a su detalle ni se inventan tasas de conversión por rubro.

Los archivos se generan desde la Capa 2 sin modificar la base:

```powershell
& '.\.venv\Scripts\python.exe' scripts/generate-annual-reports.py --source-root . --output .\.etl_work\annual-reports --years 2024,2025,2026
```

La API local usa automáticamente ese directorio si sus cortes de ventas y stock coinciden con la publicación vigente. Para validar tamaño, mapeo y cortes antes de cualquier publicación, ejecuta (sin `--apply`):

```powershell
node --env-file=.env scripts/publish-annual-reports.mjs --directory=.\.etl_work\annual-reports
```

Solo `--apply` sube los objetos comprimidos al bucket privado `dashboard-data`. El catálogo se publica al final y se verifica el alcance de tienda/rol al descargar. No subas `.etl_work` ni las credenciales al repositorio.

## Motor de datos del Dashboard General Comercial

Dashboard ejecutivo de ventas e inventario para Almacén de Remates. La interfaz está construida en Angular, los datos privados se publican de forma versionada en Supabase y la web se sirve desde Netlify.

## Operación diaria

1. Abre `0_ABRIR_PANEL.bat`. Deja la fecha vacía para seleccionar automáticamente el último día con tráfico suficiente, o escribe un corte confirmado.
2. **Actualizar datos locales** reconstruye y valida Capa 1, Capa 2 y el dashboard. **Actualizar y publicar en la web** hace eso y publica el dashboard y los reportes privados en `bd-app`.
3. La web detecta la versión publicada sin volver a desplegar Netlify.

`4_EJECUTAR_DASHBOARD_WEB.bat` abre la aplicación unificada Asiste desde esta misma raíz en `http://127.0.0.1:5180/`. `--legacy` conserva la apertura directa del dashboard Angular para paquetes portables previos.

Por consola, `2_ACTUALIZAR_DATOS.bat --fecha-corte AAAA-MM-DD` prepara los datos y `6_ACTUALIZAR_DASHBOARD_WEB.bat` publica el corte preparado. `7_ACTUALIZAR_TODO.bat --fecha-corte AAAA-MM-DD --sin-pausa` ejecuta ambos pasos. Si llega un Excel diario nuevo de tráfico, usa `7_ACTUALIZAR_TODO.bat --fecha-corte AAAA-MM-DD --trafico-excel "RUTA_DEL_ARCHIVO.xlsx"`; primero valida e importa los conteos diarios a `bd-app` y Capa 1, reparte cada total en horas manteniendo la suma y después reconstruye y publica. `--trafico-desde AAAA-MM-DD` permite acotar el intervalo. Añade `--solo-verificar` para revisar el Excel, la base y el modelo sin escribir ni publicar. No reimportes un Excel si solo quieres reconstruir el corte.

## Reglas de corte y actualización

- El corte elegido se aplica a ventas, ingresos, transferencias y demás movimientos; no se cuentan registros posteriores. El corte automático se basa en la cobertura diaria de tráfico, no en el día de la semana. Antes de publicar se comprueba que ventas y tráfico lleguen al corte. Las metas planificadas del año se conservan completas para comparar avance contra el objetivo anual.
- Ventas y movimientos se esperan semanalmente. Stock, personal y merma se esperan mensualmente. Metas e históricos se reprocesan cuando cambia el archivo.
- Stock utiliza la fotografía más reciente cuya fecha sea anterior o igual al corte. Ya no se obliga a que su fecha coincida con la última venta.
- Cuando una fuente no llega al corte, el resumen tienda/mes se completa con cero y aparece una alerta amarilla. Nunca se fabrican filas dentro de los Parquet de origen.
- El detalle de cobertura queda auditado en `capa2/Reporte_Cobertura.json`.

En una PC nueva clona este repositorio, cambia a `test` y ejecuta primero `1_INSTALAR_REQUISITOS.bat`. El archivo privado `.env` de Asiste debe quedar en la raíz y apuntar a `bd-app`; nunca se incluye en GitHub. El paquete creado por `3_CREAR_PAQUETE_PORTABLE.bat` incluye la web Angular compilada, datos operativos y los BAT. `5_CREAR_USUARIO_WEB.bat` ya no crea usuarios: las cuentas se administran desde Asiste.

## Desarrollo web

Requisitos: Node.js 22 y npm.

```powershell
npm ci
npm run build
```

El build raíz compila la aplicación React y el dashboard comercial en `dist/`.

La configuración pública de Supabase se genera durante el build de Netlify. `GROQ_API_KEY` permanece exclusivamente en Supabase Edge Function Secrets.

## Arquitectura y seguridad

- Supabase Auth y lista de acceso privada.
- `dashboard_users` contiene el usuario operativo y su contraseña en texto plano por requerimiento del propietario; la columna no se concede al cliente web.
- `dashboard_roles` define si el rol entra y si su alcance es general, por tienda, por clúster o sin acceso. `dashboard_user_scopes` guarda las tiendas o clústeres permitidos de cada usuario.
- Jefe comercial ve todo; Administrador de tienda recibe una tienda fija; Zonal recibe un clúster fijo; Seguridad no puede iniciar sesión.
- Una sola sesión activa por usuario; el inicio más reciente reemplaza al anterior.
- Row Level Security en tablas y Storage privado.
- Publicaciones con staging, checksum SHA-256 y activación atómica.
- IA opcional: GPT-OSS 120B, respaldo GPT-OSS 20B/Llama 3.1 8B y Whisper Large V3 Turbo para audio.
- Si Groq no responde, el dashboard continúa funcionando sin depender de la IA.
- Los datos de inventario se cargan por niveles: resumen primero y detalle por producto en segundo plano.

El flujo actual de los BAT 6 y 7 publica en `bd-app` (`xtnihjzqnxozbotymoma`) desde este repositorio unificado. El proyecto Supabase anterior `dashboard-comercial-produccion` queda fuera del flujo y los BAT de publicación no deben escribir allí.

Consulta [ARQUITECTURA_NUBE.md](ARQUITECTURA_NUBE.md) para el flujo completo.

## Contenido excluido de GitHub

El repositorio no incluye Excel comerciales, Parquet, JSON generados, archivos `.env`, entornos virtuales, `node_modules`, compilaciones ni paquetes portables. Estos elementos se regeneran o se trasladan por el canal privado correspondiente.

## Flujo Git del equipo

La única raíz de trabajo es la carpeta `DashBoardGeneral`; no clones otro repositorio dentro de ella. La rama compartida es `test`:

```powershell
git switch test
git pull --ff-only origin test
# realizar y verificar cambios
git add -A
git commit -m "descripcion del cambio"
git push origin test
```

Antes de empezar una tarea ejecuta siempre el `pull`. Antes de subir, confirma con `git status --short --branch` que estás en `test` y que `origin` apunta a `AngelRojasPacherres2004/Tienda-Asistencia-cap`.
