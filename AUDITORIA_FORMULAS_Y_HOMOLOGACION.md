# Auditoría de fórmulas y homologación del dashboard

Fecha de actualización: 2 de septiembre de 2026.

## Criterio de calidad

La fuente original (`capa2/*.parquet`) no se modifica ni se elimina. La capa de
publicación web aplica una homologación de presentación y conserva las métricas
de origen. El objetivo es que un mismo rubro no aparezca dos veces por una tilde,
plural o valor técnico distinto.

| Variantes de origen | Valor publicado |
| --- | --- |
| COMPUTO / CÓMPUTO | CÓMPUTO |
| FERRETERIA / FERRETERÍA | FERRETERÍA |
| TECNOLOGIA / TECNOLOGÍA | TECNOLOGÍA |
| LINEA BLANCA / LÍNEA BLANCA | LÍNEA BLANCA |
| MUEBLE / MUEBLES | MUEBLE |
| VARIOS, N/A, SIN CLASIFICACIÓN o vacío | PRODUCTOS VARIOS / N/A |
| Variantes con o sin tilde de BAÑO, RECREACIÓN, JOYERÍA y MOCHILA/MALETA/MALETÍN/CARTERA | Un único nombre canónico con tilde |

Las áreas de la visual **Participación por categoría** se calculan a partir del
rubro canónico: Textil; Calzado; Hogar; Electro; Tecnología; Perfumería y
Joyería; Ferretería y Automotriz; y Productos varios. La columna **Línea con
mayor participación** es la línea real de mayor venta neta dentro del rubro o
área visible.

## Fórmulas verificadas

| Indicador | Cálculo aplicado |
| --- | --- |
| Venta bruta | `Σ(cantidad positiva × precio sugerido)` |
| Venta real positiva | `Σ(total_venta cuando total_venta > 0)` |
| Notas de crédito | `abs(Σ(total_venta cuando total_venta < 0))` |
| Descuento total | `venta bruta − venta real positiva` |
| Venta neta | `Σ(total_venta)` |
| Ticket promedio | `venta neta ÷ transacciones` |
| Venta promedio diaria | `venta neta ÷ días calendario del rango filtrado` |
| Venta × colaborador | `venta neta ÷ colaboradores del contexto` |
| Meta | Meta válida por tienda/período; para el total anual 2026 se usa la meta corporativa aprobada de S/ 70.56 millones |
| Ocupación | `stock físico ÷ capacidad física` |
| Cobertura | `stock vendible ÷ demanda diaria`; demanda diaria = unidades vendidas de la ventana ÷ días de ventana |
| Ingreso promedio | `FactIngresos ÷ días del período`; si la tienda no tiene registros de ingreso, `(variación de stock entre cortes + unidades vendidas del intervalo) ÷ días entre cortes` |
| Salud inventario | Estado por SKU según cobertura, demanda reciente, ventana de movimiento, merma y umbrales configurados |
| Proyección 30/60/90 | `cobertura futura = max(0, cobertura actual − horizonte)`; el estado y los productos a revisar se recalculan con cada horizonte |

## Validaciones incluidas

- El filtro Día carga primero el detalle diario y luego aplica el rango, evitando
  gráficos vacíos durante la carga.
- Capacidad vs Stock usa el resumen de stock ya disponible al abrir el tablero;
  el detalle de producto solo mejora el desglose posterior.
- Los filtros de Rubro, Línea y Sublínea comparan nombres canónicos en ventas,
  ingresos, stock, marcas, rangos de precio, vendedores y clientes.
