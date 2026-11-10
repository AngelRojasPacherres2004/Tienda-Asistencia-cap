export const CHART_PAGES = { 1: 'Gestión comercial', 2: 'Inventario y predictivo', 3: 'Operación y equipo' };
const entry = (id, page, title, phrases, extra = {}) => ({ id, page, title, phrases: [title, ...phrases], selector: `[data-react-commercial-module="${id}"]`, ...extra });
export const CHART_CATALOG = [
  entry('primary-kpis', 1, 'Resumen comercial', ['meta venta bruta neta descuento notas credito proyeccion cierre diaria'], { selector: '[data-react-commercial-module="primary-kpis"]' }),
  entry('progress', 1, 'Cumplimiento y avance de metas', ['cumplimiento objetivo avance acumulado mensual cuanto falta meta']),
  entry('meta-vs-real-card', 1, 'Avance meta vs real', ['comparar ventas meta objetivo real']),
  entry('category-card', 1, 'Ventas por rubro', ['ventas categoria textil calzado']),
  entry('brand-card', 1, 'Ventas por marca', ['marcas mas vendidas nike adidas']),
  entry('hourly-card', 1, 'Desempeño comercial por hora', ['ventas horarios horas mejor hora vender']),
  entry('ranking-card', 1, 'Ranking de tiendas', ['ventas por tienda quien vende mas mejores tiendas ranking']),
  entry('gender-card', 1, 'Ventas por género y línea', ['hombre mujer genero dama caballero linea']),
  entry('growth-card', 1, 'Crecimiento de ventas', ['comparar años meses crecimiento evolucion ventas historico interanual']),
  entry('price-range-card', 1, 'Ventas por rango de precio', ['precios barato caro rangos importe']),
  entry('rotation-card', 2, 'Rotación de inventario', ['stock rotacion productos movimiento salida']),
  entry('antiquity-card', 2, 'Antigüedad del inventario', ['stock antiguo viejo antiguedad origen año mercaderia']),
  entry('store-value-card', 2, 'Valor de inventario por tienda', ['cuanto vale stock por tienda valor inventario cobertura'], { generalOnly: true }),
  entry('size-card', 2, 'Venta por talla', ['distribución de tallas tamaños numeros calzado tallaje ventas stock']),
  entry('health-card', 2, 'Salud del inventario', ['stock sano sobrestock exceso quiebre riesgo salud']),
  entry('replenishment-card', 2, 'Reposición de productos', ['reponer pedir comprar falta mercaderia abastecimiento reposicion']),
  entry('projection-card', 2, 'Proyección de inventario', ['prediccion stock futuro cobertura dias durara inventario']),
  entry('talent-capacity', 3, 'Dotación por tienda', ['cuanto personal hay trabajadores empleados dotacion plantilla tienda faltan personas']),
  entry('talent-history-card', 3, 'Evolución mensual de personal', ['historial empleados colaboradores evolucion personal meses']),
  entry('talent-team-card', 3, 'Venta promedio por colaborador y equipo', ['productividad equipo venta colaborador area rendimiento equipo']),
  entry('seller-card', 3, 'Desempeño de vendedores', ['vendedor vendedores mejor vendedor rendimiento ventas por persona']),
  entry('talent-traffic-card', 3, 'Tráfico por tienda', ['visitas visitantes afluencia clientes ingresan trafico tienda']),
  entry('traffic-hour-matrix', 3, 'Matriz de tráfico por hora y día', ['matriz trafico horas dias todas tiendas visitantes horario'], { generalOnly: true, selector: 'slot[name="commercial-traffic"]' }),
  entry('talent-store-card', 3, 'Productividad por tienda', ['productividad rendimiento local tiendas']),
  entry('talent-training-card', 3, 'Capacitaciones del equipo', ['cursos capacitacion formacion aprendizaje progreso cursos']),
  entry('talent-exit-card', 3, 'Retiros por motivo', ['salidas bajas renuncia retiro motivos personal']),
  entry('talent-incidents-card', 3, 'Incidencias externas y terceros', ['incidentes incidencias terceros seguridad problemas'], { generalOnly: true }),
];

// Frases de intención: conectan preguntas cotidianas con los gráficos existentes.
const INTENTS = {
  'antiquity-card': ['productos que no se venden', 'mercaderia que no se mueve', 'stock estancado', 'ropa vieja', 'productos guardados mucho tiempo'],
  'replenishment-card': ['que productos debo pedir', 'que me falta comprar', 'productos por agotarse', 'que debo reponer'],
  'health-card': ['tengo demasiado stock', 'inventario en riesgo', 'sobran productos'],
  'talent-capacity': ['personas que trabajan en cada local', 'cuanta gente trabaja', 'cuantos trabajadores tengo', 'faltan empleados'],
  'talent-team-card': ['cuanto vende cada equipo', 'rendimiento del equipo', 'venta por trabajador'],
  'seller-card': ['quien vende mas', 'quien es mi mejor vendedor', 'comparar vendedores'],
  'ranking-card': ['cual local vende mas', 'comparar ventas entre tiendas', 'mejores locales'],
  'talent-traffic-card': ['cuanta gente entra', 'cuantas personas entraron', 'clientes que visitan los locales'],
  'primary-kpis': ['como terminaremos el mes', 'cuanto vamos a vender al cierre', 'cuanto hemos vendido'],
  progress: ['cuanto falta para llegar al objetivo', 'estamos llegando a la meta'],
  'size-card': ['que numeros de zapatos tenemos', 'que tallas hay'],
  'talent-training-card': ['quien termino sus cursos', 'como van las capacitaciones'],
  'talent-exit-card': ['por que se fue el personal', 'por que renunciaron'],
};
const STOP = new Set('a al de del la las el los un una unos unas en y o por para con que quiero ver mostrar muestra muestrame grafica grafico graficas graficos como esta estan es se me lo donde saber necesito puedes podria podrias favor acerca sobre informacion datos quisiera ensename enseñame'.split(' '));
export function normalizeChartQuery(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function words(value) { return normalizeChartQuery(value).split(' ').filter(w => w && !STOP.has(w)); }
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[b.length];
}
function match(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return .85;
  const size = Math.max(a.length, b.length);
  return Math.min(a.length, b.length) >= 4 && distance(a, b) <= (size >= 8 ? 2 : 1) ? .7 : 0;
}
export function searchCharts(query, { storeAdmin = false, limit = 6 } = {}) {
  const tokens = words(query).slice(0, 20);
  if (!tokens.length) return [];
  return CHART_CATALOG.filter(item => !storeAdmin || !item.generalOnly).map(item => {
    const intents = INTENTS[item.id] || [];
    const title = words(item.title); const vocabulary = words([...item.phrases, ...intents].join(' '));
    const hits = tokens.map(token => Math.max(...vocabulary.map(word => match(token, word))));
    const coverage = hits.filter(hit => hit > 0).length / tokens.length;
    const intentMatch = intents.some(phrase => {
      const intent = words(phrase);
      return intent.length >= 2 && intent.every(word => tokens.some(token => match(token, word) >= .7)) && tokens.filter(token => intent.some(word => match(token, word) >= .7)).length / tokens.length >= .65;
    });
    const score = hits.reduce((a, b) => a + b, 0) / tokens.length + tokens.reduce((sum, token) => sum + Math.max(0, ...title.map(word => match(token, word))), 0) / tokens.length * .35 + (intentMatch ? .8 : 0);
    return { ...item, score, coverage };
  }).filter(item => item.coverage >= .5 && item.score >= .5).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
