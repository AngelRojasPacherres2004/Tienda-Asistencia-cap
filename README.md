# Dashboard General Comercial

Dashboard ejecutivo de ventas e inventario para Almacén de Remates. La interfaz está construida en Angular, los datos privados se publican de forma versionada en Supabase y la web se sirve desde Netlify.

## Operación diaria

1. Coloca o reemplaza los Excel autorizados dentro de `input`.
2. Ejecuta `2_ACTUALIZAR_DATOS.bat` para reconstruir y validar los datos locales.
3. Ejecuta `6_ACTUALIZAR_DASHBOARD_WEB.bat` para publicar una nueva versión atómica en Supabase. El BAT solicita las credenciales y no las guarda.
4. La web detecta la versión publicada sin necesidad de volver a desplegar Netlify.

En una PC nueva ejecuta primero `1_INSTALAR_REQUISITOS.bat`. El paquete creado por `3_CREAR_PAQUETE_PORTABLE.bat` ya incluye la web compilada, los datos operativos, el BAT de publicación y las instrucciones necesarias. La contraseña se solicita al publicar y nunca se guarda en el ZIP ni en GitHub.

## Desarrollo web

Requisitos: Node.js 22 y npm.

```text
cd dashboard-web
npm ci
npm run build
```

La configuración pública de Supabase se genera durante el build de Netlify. `GROQ_API_KEY` permanece exclusivamente en Supabase Edge Function Secrets.

## Arquitectura y seguridad

- Supabase Auth y lista de acceso privada.
- La tabla de acceso contiene `usuario`, `cargo` y `dispositivo`; las contraseñas cifradas pertenecen exclusivamente a Supabase Auth.
- Una sola sesión activa por usuario; el inicio más reciente reemplaza al anterior.
- Row Level Security en tablas y Storage privado.
- Publicaciones con staging, checksum SHA-256 y activación atómica.
- IA opcional: GPT-OSS 120B, respaldo GPT-OSS 20B/Llama 3.1 8B y Whisper Large V3 Turbo para audio.
- Si Groq no responde, el dashboard continúa funcionando sin depender de la IA.
- Los datos de inventario se cargan por niveles: resumen primero y detalle por producto en segundo plano.

Consulta [ARQUITECTURA_NUBE.md](ARQUITECTURA_NUBE.md) para el flujo completo.

## Contenido excluido de GitHub

El repositorio no incluye Excel comerciales, Parquet, JSON generados, archivos `.env`, entornos virtuales, `node_modules`, compilaciones ni paquetes portables. Estos elementos se regeneran o se trasladan por el canal privado correspondiente.
