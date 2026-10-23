import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportTooltipPosition } from '../commercial-dashboard/src/app/tooltip-position.ts';

test('keeps the full card visible near the bottom and right edges', () => {
  const chart = { left: 70, top: 490 };
  const [x, y] = viewportTooltipPosition([1500, 280], [390, 360], chart, [1867, 890]);
  assert.ok(x + chart.left >= 12);
  assert.ok(x + chart.left + 390 <= 1855);
  assert.ok(y + chart.top >= 12);
  assert.ok(y + chart.top + 360 <= 878);
});

test('uses the visible viewport after vertical and horizontal scrolling', () => {
  const chart = { left: -300, top: -550 };
  const [x, y] = viewportTooltipPosition([650, 1100], [340, 400], chart, [800, 600]);
  assert.ok(x + chart.left >= 12);
  assert.ok(x + chart.left + 340 <= 788);
  assert.ok(y + chart.top >= 12);
  assert.ok(y + chart.top + 400 <= 588);
});
