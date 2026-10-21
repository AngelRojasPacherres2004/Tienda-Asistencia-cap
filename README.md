# Dashboard General Comercial

Dashboard ejecutivo de ventas e inventario para Almacén de Remates. La interfaz está construida en Angular, los datos privados se publican de forma versionada en Supabase y la web se sirve desde Netlify.

## Operación diaria

1. Abre `0_ABRIR_PANEL.bat`. Deja la fecha vacía para seleccionar automáticamente el último día con tráfico suficiente, o escribe un corte confirmado.
2. **Actualizar datos locales** reconstruye y valida Capa 1, Capa 2 y el dashboard. **Actualizar y publicar en la web** hace eso y publica el dashboard y los reportes privados en `bd-app`.
3. La web detecta la versión publicada sin volver a desplegar Netlify.

`4_EJECUTAR_DASHBOARD_WEB.bat` abre la aplicación unificada Asiste en `http://127.0.0.1:5180/` cuando el repositorio `Tienda-Asistencia-cap` está presente. `--legacy` conserva la apertura del dashboard Angular antiguo para paquetes previos.

Por consola, `2_ACTUALIZAR_DATOS.bat --fecha-corte AAAA-MM-DD` prepara los datos y `6_ACTUALIZAR_DASHBOARD_WEB.bat` publica el corte preparado. `7_ACTUALIZAR_TODO.bat --fecha-corte AAAA-MM-DD --sin-pausa` ejecuta ambos pasos. Si llega un Excel diario nuevo de tráfico, usa `7_ACTUALIZAR_TODO.bat --fecha-corte AAAA-MM-DD --trafico-excel "RUTA_DEL_ARCHIVO.xlsx"`; primero valida e importa los conteos diarios a `bd-app` y Capa 1, reparte cada total en horas manteniendo la suma y después reconstruye y publica. `--trafico-desde AAAA-MM-DD` permite acotar el intervalo. Añade `--solo-verificar` para revisar el Excel, la base y el modelo sin escribir ni publicar. No reimportes un Excel si solo quieres reconstruir el corte.

## Reglas de corte y actualización

- El corte elegido se aplica a ventas, ingresos, transferencias y demás movimientos; no se cuentan registros posteriores. El corte automático se basa en la cobertura diaria de tráfico, no en el día de la semana. Antes de publicar se comprueba que ventas y tráfico lleguen al corte. Las metas planificadas del año se conservan completas para comparar avance contra el objetivo anual.
- Ventas y movimientos se esperan semanalmente. Stock, personal y merma se esperan mensualmente. Metas e históricos se reprocesan cuando cambia el archivo.
- Stock utiliza la fotografía más reciente cuya fecha sea anterior o igual al corte. Ya no se obliga a que su fecha coincida con la última venta.
- Cuando una fuente no llega al corte, el resumen tienda/mes se completa con cero y aparece una alerta amarilla. Nunca se fabrican filas dentro de los Parquet de origen.
- El detalle de cobertura queda auditado en `capa2/Reporte_Cobertura.json`.

En una PC nueva ejecuta primero `1_INSTALAR_REQUISITOS.bat`. El paquete creado por `3_CREAR_PAQUETE_PORTABLE.bat` incluye la web compilada, datos operativos y los BAT. Para publicar, también debe existir el proyecto Asiste en `Tienda-Asistencia-cap` (o indicarse con `--app-root`) con su `.env` privado configurado para `bd-app`; ese archivo no se incluye en el ZIP ni en GitHub. `5_CREAR_USUARIO_WEB.bat` ya no crea usuarios: las cuentas se administran desde Asiste.

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
- `dashboard_users` contiene el usuario operativo y su contraseña en texto plano por requerimiento del propietario; la columna no se concede al cliente web.
- `dashboard_roles` define si el rol entra y si su alcance es general, por tienda, por clúster o sin acceso. `dashboard_user_scopes` guarda las tiendas o clústeres permitidos de cada usuario.
- Jefe comercial ve todo; Administrador de tienda recibe una tienda fija; Zonal recibe un clúster fijo; Seguridad no puede iniciar sesión.
- Una sola sesión activa por usuario; el inicio más reciente reemplaza al anterior.
- Row Level Security en tablas y Storage privado.
- Publicaciones con staging, checksum SHA-256 y activación atómica.
- IA opcional: GPT-OSS 120B, respaldo GPT-OSS 20B/Llama 3.1 8B y Whisper Large V3 Turbo para audio.
- Si Groq no responde, el dashboard continúa funcionando sin depender de la IA.
- Los datos de inventario se cargan por niveles: resumen primero y detalle por producto en segundo plano.

El flujo actual de los BAT 6 y 7 publica en `bd-app` (`xtnihjzqnxozbotymoma`), que utiliza la aplicación Asiste dentro de `Tienda-Asistencia-cap`. El proyecto Supabase anterior `dashboard-comercial-produccion` y esta carpeta `dashboard-web` permanecen como legado local; los BAT de publicación no deben escribir allí.

Consulta [ARQUITECTURA_NUBE.md](ARQUITECTURA_NUBE.md) para el flujo completo.

## Contenido excluido de GitHub

El repositorio no incluye Excel comerciales, Parquet, JSON generados, archivos `.env`, entornos virtuales, `node_modules`, compilaciones ni paquetes portables. Estos elementos se regeneran o se trasladan por el canal privado correspondiente.
