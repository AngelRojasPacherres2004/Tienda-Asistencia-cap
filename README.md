# Dashboard General Comercial

Dashboard ejecutivo de ventas e inventario para Almacén de Remates. La interfaz está construida en Angular, los datos privados se publican de forma versionada en Supabase y la web se sirve desde Netlify.

## Operación diaria

1. Abre `0_ABRIR_PANEL.bat`.
2. Elige la fecha de corte (por defecto, el último lunes) y pulsa **Actualizar datos locales**.
3. Para hacer ambas tareas de una vez pulsa **Actualizar y publicar en la web**. Al llegar a la publicación, el BAT 6 solicita las credenciales y no las guarda.
4. La web detecta la versión publicada sin necesidad de volver a desplegar Netlify.

También se puede usar la consola: `2_ACTUALIZAR_DATOS.bat --fecha-corte AAAA-MM-DD`. Si no se indica fecha, se usa automáticamente el último lunes.

## Reglas de corte y actualización

- El corte elegido se aplica a ventas, ingresos, transferencias y demás movimientos; no se cuentan registros posteriores. Las metas planificadas del año se conservan completas para poder comparar avance contra el objetivo anual.
- Ventas y movimientos se esperan semanalmente. Stock, personal y merma se esperan mensualmente. Metas e históricos se reprocesan cuando cambia el archivo.
- Stock utiliza la fotografía más reciente cuya fecha sea anterior o igual al corte. Ya no se obliga a que su fecha coincida con la última venta.
- Cuando una fuente no llega al corte, el resumen tienda/mes se completa con cero y aparece una alerta amarilla. Nunca se fabrican filas dentro de los Parquet de origen.
- El detalle de cobertura queda auditado en `capa2/Reporte_Cobertura.json`.

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

El proyecto Supabase correcto es **dashboard-comercial**, referencia `hiwvtldpwenstxeoteui`. Puedes abrir directamente su [Editor de tablas](https://supabase.com/dashboard/project/hiwvtldpwenstxeoteui/editor). Allí deben verse `dashboard_users`, `dashboard_releases` y `dashboard_files`. El proyecto llamado `dashboardcomercialn-dev's Project` que aparece en la captura es otro proyecto vacío.

Consulta [ARQUITECTURA_NUBE.md](ARQUITECTURA_NUBE.md) para el flujo completo.

## Contenido excluido de GitHub

El repositorio no incluye Excel comerciales, Parquet, JSON generados, archivos `.env`, entornos virtuales, `node_modules`, compilaciones ni paquetes portables. Estos elementos se regeneran o se trasladan por el canal privado correspondiente.
