# Arquitectura nube del Dashboard General

## Flujo operativo

1. `0_ABRIR_PANEL.bat` permite elegir el corte y ejecutar `2_ACTUALIZAR_DATOS.bat` mediante botones. El proceso reconstruye Capa 1, aplica el corte en Capa 2 y prepara el lote manual de Parquet.
2. El lote se deja en `entrega_asistente_comercial\AAAA-MM-DD`. El rol Asistente Comercial lo carga manualmente en el portal.
3. La web consulta los datos autorizados desde Supabase según el rol del usuario.
4. Netlify sirve la aplicación React.
5. React envía chat o audio a Supabase Edge Functions; las funciones validan al usuario y recién entonces llaman a Groq.

## Corte y cobertura de fuentes

- El valor predeterminado es el último lunes; un operador puede elegir otra fecha.
- Los movimientos posteriores al corte se excluyen solamente de Capa 2. Capa 1 conserva el histórico completo para poder regenerar otro corte; las metas futuras se mantienen porque representan el plan anual, no una transacción real.
- El stock es mensual y usa la última fotografía anterior o igual al corte. No necesita coincidir con la fecha máxima de ventas.
- `capa2/Reporte_Cobertura.json` registra máximo disponible, datos incluidos, rezago y filas excluidas por cada fuente.
- El dashboard genera la malla completa tienda/mes y usa cero donde falta una medición, mostrando además las advertencias de cobertura.

## Seguridad

- Inicio de sesión con Supabase Auth mediante usuario o correo y contraseña.
- `dashboard_users` guarda `usuario`, `cargo` y `dispositivo`; la contraseña nunca se almacena en esa tabla, sino cifrada en Supabase Auth.
- Una sola sesión activa por usuario: el inicio más reciente reemplaza al dispositivo anterior.
- Lista de acceso en `dashboard_users`; un usuario autenticado pero no habilitado no puede leer datos.
- Row Level Security en todas las tablas públicas y políticas privadas en Storage.
- Los BAT vigentes no publican ni crean usuarios; el rol Asistente Comercial carga manualmente los Parquet producidos.
- El navegador recibe únicamente la clave publicable de Supabase.
- `GROQ_API_KEY` queda en Supabase Edge Function Secrets y nunca llega a Netlify ni al navegador.
- Las publicaciones son versionadas, verificadas con SHA-256 y se activan de forma atómica.

## Rendimiento

- La pestaña de inventario pinta primero los agregados compactos.
- Antigüedad de stock se descarga aparte (~4 MB).
- El detalle por producto se procesa en un Web Worker y en tiempo ocioso, sin bloquear el cambio de pestaña.
- Las URL privadas duran cinco minutos y los datos siguen protegidos por la sesión activa.

## Inteligencia artificial

- Modelo principal: `openai/gpt-oss-120b` con razonamiento alto.
- Respaldos automáticos: `openai/gpt-oss-20b` y `llama-3.1-8b-instant`.
- Voz a texto: `whisper-large-v3-turbo`.
- Si Groq alcanza un límite o no está disponible, el dashboard continúa funcionando normalmente.

## Archivos de configuración

- Migraciones SQL versionadas en `supabase/migrations`.
- Configuración Netlify: `netlify.toml`; el dashboard React integrado vive en `src/commercial/` y `src/components/`.
- Los usuarios se administran dentro de Asiste. El paquete portable no incluye secretos ni herramientas de alta/publicación.
- Variables públicas del build: `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
- Secretos de IA en Supabase: `GROQ_API_KEY`, `GROQ_CHAT_MODEL` y `GROQ_TRANSCRIBE_MODEL`.

## Recuperación

Las publicaciones anteriores no se sobrescriben. Si una carga falla, conserva el estado `failed` y la web sigue mostrando la última versión `published`. Esto permite auditar y recuperar datos sin interrumpir el dashboard.
