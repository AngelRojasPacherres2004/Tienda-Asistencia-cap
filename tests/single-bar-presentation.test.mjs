import assert from 'node:assert/strict';
import test from 'node:test';
import { singleBarMetric, singleBarGauge, singleBarRadial } from '../src/components/singleBarPresentation.js';
import { storeRotationRatio } from '../src/commercial/inventory-performance.ts';

const option = (data, axis = {}) => ({ xAxis: { type: 'value', ...axis }, yAxis: { type: 'category', data: data.map((_, i) => `Tienda ${i}`) }, series: [{ type: 'bar', data }] });
test('only a genuine single bar can change presentation', () => {
  for (const value of [null, undefined, '', true, NaN, Infinity]) assert.equal(singleBarMetric(option([value])), null);
  assert.equal(singleBarMetric(option([10, 20])), null);
  assert.equal(singleBarMetric({ ...option([10]), series: [{ type: 'line', data: [10] }] }), null);
  assert.equal(singleBarMetric({ ...option([10]), series: [{ type: 'bar', data: [10] }, { type: 'bar', data: [20] }] }), null);
});
test('absolute metrics use their existing units and preserve click data', () => {
  const source = { value: 1240, period: '2026-10' };
  const metric = singleBarMetric(option([source], { axisLabel: { formatter: value => `S/ ${value}` }, max: 1500 }));
  assert.equal(metric.kind, 'indicator');
  assert.equal(metric.formatted, 'S/ 1240');
  assert.equal(metric.source, source);
  assert.equal(singleBarMetric(option([0])).value, 0);
  assert.equal(singleBarMetric(option([-10])).kind, 'indicator');
});
test('a speedometer requires a real percentage scale and never invents a target', () => {
  const metric = singleBarMetric(option([0.7], { max: 1, axisLabel: { formatter: value => `${value * 100}%` } }));
  assert.equal(metric.kind, 'gauge');
  const gauge = singleBarGauge(metric).series[0];
  assert.equal(gauge.max, 100);
  assert.equal(gauge.data[0].value, 70);
  assert.equal(singleBarMetric(option([0.7], { max: 2 })).kind, 'indicator');
});
test('absolute radial charts retain the original numeric scale and units', () => {
  const metric = singleBarMetric(option([994500], { max: 1200000, axisLabel: { formatter: value => `S/ ${value}` } }));
  const series = singleBarRadial(metric).series[0];
  assert.equal(series.max, 1200000);
  assert.equal(series.data[0].value, 994500);
  assert.equal(series.detail.formatter(), 'S/ 994500');
  assert.equal(series.axisLabel.formatter(300000), 'S/ 300000');
  assert.equal(series.pointer.show, false);
});
test('rotation uses a fixed 0–100% scale and preserves stock and units in its tooltip', () => {
  const source = option([0.066], { max: 0.08, axisLabel: { formatter: value => `${value * 100}%` } });
  source.tooltip = { trigger: 'axis', formatter: params => `Stock físico: 1000 und · Vendidas 30D: 66 und · Rotación: ${params[0].value * 100}%` };
  const metric = singleBarMetric(source, 'inventory-rotation');
  assert.equal(metric.kind, 'gauge');
  const gauge = singleBarGauge(metric, source.tooltip);
  assert.equal(gauge.series[0].min, 0);
  assert.equal(gauge.series[0].max, 100);
  assert.equal(gauge.series[0].axisLabel.show, false);
  assert.equal(gauge.series[0].pointer.show, false);
  assert.ok(Math.abs(gauge.series[0].data[0].value - 6.6) < 1e-10);
  assert.match(gauge.tooltip.formatter({ dataIndex: 0 }), /Stock físico: 1000 und · Vendidas 30D: 66 und/);
  assert.equal(singleBarMetric(source).kind, 'indicator');
  source.series[0].data = [1.25];
  const above = singleBarGauge(singleBarMetric(source, 'inventory-rotation'));
  assert.equal(above.series[0].data[0].value, 125);
  assert.match(above.series[0].data[0].name, /supera el 100/);
});
test('inventory has a smaller radial chart and a structured inventory tooltip', () => {
  const datum = { value: 994464.75, inventoryDetails: { stockUnits: 22012, soldUnits30: 1731, coverageDays: 95.4, status: 'EXCESO' } };
  const metric = singleBarMetric(option([datum]), 'inventory-store-value');
  const chart = singleBarRadial(metric);
  assert.equal(chart.series[0].radius, '65%');
  const tooltip = chart.tooltip.formatter({});
  assert.equal((tooltip.match(/grid-template-columns/g) || []).length, 5);
  for (const label of ['Valor del inventario', 'Stock físico', 'Vendidas en 30 días', 'Cobertura estimada', 'Estado de cobertura']) assert.ok(tooltip.includes(label));
  assert.match(tooltip, /994,464.75/);
});
test('rotation is sold units divided by current stock, with separate tooltip rows', () => {
  assert.equal(storeRotationRatio(66, 1000), 0.066);
  assert.equal(storeRotationRatio(0, 1000), 0);
  assert.equal(storeRotationRatio(1250, 1000), 1.25);
  assert.equal(storeRotationRatio(66, 0), null);
  assert.equal(storeRotationRatio(66, -1), null);
  assert.equal(storeRotationRatio(NaN, 1000), null);
  const datum = { value: storeRotationRatio(66, 1000), rotationDetails: { stockUnits: 1000, soldUnits30: 66, stockValue: 50000, sales30: 3300 } };
  const metric = singleBarMetric(option([datum], { axisLabel: { formatter: value => `${value * 100}%` } }), 'inventory-rotation');
  const gauge = singleBarGauge(metric);
  assert.equal(gauge.series[0].axisLabel.show, false);
  const tooltip = gauge.tooltip.formatter({});
  assert.equal((tooltip.match(/grid-template-columns/g) || []).length, 5);
  assert.match(tooltip, /Stock físico actual/);
  assert.match(tooltip, /1,000 unidades/);
  assert.match(tooltip, /66 unidades/);
  assert.match(tooltip, /vendidas en 30 días ÷ stock actual × 100/);
});
