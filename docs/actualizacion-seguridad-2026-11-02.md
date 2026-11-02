# Actualización de tráfico y robos · 2026-11-02

Origen: `FORMATO DE ROBO Y TRAFICO DE CLIENTES 2026 (4).xlsx`.

| Fuente | Último dato del Excel | Destino | Resultado |
| --- | --- | --- | --- |
| Tráfico diario | 2026-10-25 | `trafico_tienda` | 120 días por tienda faltantes, distribuidos en 1,680 registros horarios |
| Incidencias | 2026-10-24 | `incidencias` | 7 incidencias nuevas; 122 filas del Excel identificadas en total |
| Tráfico comercial | 2026-10-25 | `FactTraficoClientes` | Capa 1 y Capa 2 extendidas 10 días y 180 filas |
| Robos efectivos | 2026-10-22 | `FactMerma` | 23 robos nuevos; S/ 3,634.10 de pérdida registrada |

El Excel contiene ocho subtotales semanales que no coinciden con sus siete celdas diarias. La importación usa las celdas diarias. Hay 89 días con diferencias respecto a registros manuales existentes en `trafico_tienda`; esos registros se conservaron. Los robos frustrados se registran como incidencias, sin sumarlos a pérdidas de `FactMerma`.

El dashboard comercial sigue calculando ventas y conversión hasta su corte de ventas disponible, **2026-10-15**. Su metadata informa por separado que las fuentes ya llegan a 2026-10-25 en tráfico y 2026-10-22 en merma. No se mezclan visitantes posteriores con ventas anteriores.

Las copias previas a la actualización están en `.etl_work/security-import-backup-*.json` y `.etl_work/security-layer1-backups/`. Los scripts `import-security-workbook.mjs` y `update-security-layer1.mjs` hacen vista previa por defecto; `--apply` aplica los cambios.
