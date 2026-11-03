import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_CATALOG, searchCharts } from '../src/components/chartSearchCatalog.js';

test('interpreta frases y errores comunes sin depender de acentos o mayúsculas', () => {
  for (const [query, expected] of [
    ['muéstrame cuánto personal hay', 'talent-capacity'],
    ['quiero ver las ventas por marca', 'brand-card'],
    ['stok antiguo', 'antiquity-card'],
    ['TRAFICO POR TIENDA', 'talent-traffic-card'],
    ['valor de inventario por tienda', 'store-value-card'],
    ['mejor vendedor', 'seller-card'],
    ['proyeccion de cierre', 'primary-kpis'],
    ['proyeccion de inventario', 'projection-card'],
    ['cursos del equipo', 'talent-training-card'],
    ['productos que no se venden', 'antiquity-card'],
    ['cuanta gente entra', 'talent-traffic-card'],
    ['que productos debo pedir', 'replenishment-card'],
    ['personas que trabajan en cada local', 'talent-capacity'],
    ['como terminaremos el mes', 'primary-kpis'],
    ['por que renunciaron', 'talent-exit-card'],
  ]) assert.equal(searchCharts(query)[0]?.id, expected, query);
});
test('no inventa resultados para búsquedas vacías o temas ajenos', () => {
  for (const query of ['', 'la gráfica que quiero ver', 'meteorología espacial', 'zzzzzzzz']) assert.deepEqual(searchCharts(query), []);
});
test('ofrece alternativas para consultas amplias y respeta módulos del rol', () => {
  assert.ok(searchCharts('ventas').length > 1);
  assert.ok(searchCharts('incidencias').some(row => row.id === 'talent-incidents-card'));
  assert.ok(!searchCharts('incidencias', { storeAdmin: true }).some(row => row.id === 'talent-incidents-card'));
  assert.equal(new Set(CHART_CATALOG.map(row => row.id)).size, CHART_CATALOG.length);
});
