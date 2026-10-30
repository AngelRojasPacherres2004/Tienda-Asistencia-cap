import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseDragScroll } from '../src/lib/mouseDragScroll.js';

globalThis.getComputedStyle = element => ({ overflowY: element.overflowY || 'visible' });

function fixture({ parent = null, height = 1000 } = {}) {
  const capture = new Set(); const classes = new Set();
  const element = {
    scrollLeft: 100, scrollTop: 100, scrollHeight: height, clientHeight: 300, clientWidth: 400,
    parentElement: parent, classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: id => capture.add(id), hasPointerCapture: id => capture.has(id),
    releasePointerCapture: id => capture.delete(id), focus() {},
  };
  const handlers = createMouseDragScroll();
  const event = overrides => ({
    currentTarget: element, target: { closest: () => null }, pointerType: 'mouse',
    button: 0, buttons: 1, isPrimary: true, pointerId: 1, clientX: 200, clientY: 200,
    preventDefault() { this.prevented = true; }, ...overrides,
  });
  return { element, handlers, event, capture, classes };
}

test('mouse drag scrolls both axes and releases capture when the button is released', () => {
  const f = fixture();
  f.handlers.onPointerDown(f.event());
  f.handlers.onPointerMove(f.event({ clientX: 150, clientY: 140 }));
  assert.equal(f.element.scrollLeft, 150);
  assert.equal(f.element.scrollTop, 160);
  assert.ok(f.classes.has('is-dragging'));
  f.handlers.onPointerUp(f.event());
  assert.equal(f.capture.size, 0);
  assert.equal(f.classes.size, 0);
  f.handlers.onPointerMove(f.event({ clientX: 50 }));
  assert.equal(f.element.scrollLeft, 150);
});

test('expanded mobile view forwards vertical movement to the scrollable card', () => {
  const parent = { overflowY: 'auto', parentElement: null, scrollTop: 200, scrollHeight: 2000, clientHeight: 800 };
  const f = fixture({ parent, height: 300 }); f.element.scrollTop = 0;
  f.handlers.onPointerDown(f.event());
  f.handlers.onPointerMove(f.event({ clientY: 100 }));
  assert.equal(f.element.scrollTop, 0);
  assert.equal(parent.scrollTop, 300);
});

test('touch, right click, controls and scrollbars retain native behavior', () => {
  for (const overrides of [
    { pointerType: 'touch' }, { button: 2 }, { isPrimary: false },
    { target: { closest: () => ({}) } }, { clientX: 405 }, { clientY: 305 },
  ]) {
    const f = fixture(); const event = f.event(overrides);
    f.handlers.onPointerDown(event);
    assert.equal(f.capture.size, 0);
    assert.equal(event.prevented, undefined);
  }
});

test('cancellation, lost capture and missed mouse release end dragging safely', () => {
  for (const action of ['onPointerCancel', 'onLostPointerCapture', 'onPointerMove']) {
    const f = fixture(); f.handlers.onPointerDown(f.event());
    f.handlers[action](f.event({ buttons: 0 }));
    assert.equal(f.classes.size, 0);
    assert.equal(f.capture.size, 0);
  }
});
