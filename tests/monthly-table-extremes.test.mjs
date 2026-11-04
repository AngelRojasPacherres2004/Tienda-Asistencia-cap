import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightNumericColumns, isTopKpiModal } from '../src/lib/monthlyTableExtremes.js';

test('limita el sombreado a las tarjetas superiores, excluyendo los gráficos del resto del dashboard', () => {
  for (const id of ['projection-close-modal', 'ticket-modal', 'conversion-modal', 'traffic-modal', 'saleM2-modal', 'saleCollaborator-modal', 'markup-modal', 'sellThrough-modal']) assert.equal(isTopKpiModal(id), true);
  for (const id of ['meta-vs-real-modal', 'size-detail', 'talent-modal', undefined]) assert.equal(isTopKpiModal(id), false);
});

test('compara cada columna por su valor real aunque el texto esté redondeado', () => {
  const rows = highlightNumericColumns([
    { label: 'A', cells: [{ value: 1001, text: 'S/ 1 K' }, { value: -4, text: '-4%' }] },
    { label: 'B', cells: [{ value: 1002, text: 'S/ 1 K' }, { value: -8, text: '-8%', className: 'negative' }] },
  ]);
  assert.equal(rows[0].cells[0].className, 'ticket-extreme-min');
  assert.equal(rows[1].cells[0].className, 'ticket-extreme-max');
  assert.equal(rows[0].cells[1].className, 'ticket-extreme-max');
  assert.equal(rows[1].cells[1].className, 'negative ticket-extreme-min');
});

test('ignora datos ausentes, conserva ceros y marca todos los empates extremos', () => {
  const rows = highlightNumericColumns([0, null, 5, 5, NaN, Infinity].map((value, i) => ({ label: `${i}`, cells: [{ value }] })));
  assert.equal(rows[0].cells[0].className, 'ticket-extreme-min');
  for (const i of [2, 3]) assert.equal(rows[i].cells[0].className, 'ticket-extreme-max');
  for (const i of [1, 4, 5]) assert.equal(rows[i].cells[0].className, undefined);
});

test('no asigna colores contradictorios a una columna sin variación', () => {
  assert.deepEqual(highlightNumericColumns([]), []);
  const rows = [{ label: 'A', cells: [{ value: 2 }] }, { label: 'B', cells: [{ value: 2 }] }];
  assert.deepEqual(highlightNumericColumns(rows), rows);
});
