// Touch keeps the browser's native scrolling; mouse dragging uses pointer capture.
export function createMouseDragScroll() {
  let drag = null;
  const stop = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { element, id } = drag;
    drag = null;
    element.classList.remove('is-dragging');
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  return {
    onPointerDown(event) {
      if (drag || event.pointerType !== 'mouse' || event.button !== 0 || !event.isPrimary) return;
      if (event.target.closest('button,a,input,select,textarea')) return;
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      // Preserve native scrollbar interaction.
      if (event.clientX - rect.left >= element.clientWidth || event.clientY - rect.top >= element.clientHeight) return;
      const vertical = [element];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) vertical.push(parent);
      }
      drag = { element, id: event.pointerId, x: event.clientX, y: event.clientY, vertical };
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
      element.focus({ preventScroll: true });
      event.preventDefault();
    },
    onPointerMove(event) {
      if (!drag || event.pointerId !== drag.id) return;
      if (!(event.buttons & 1)) { stop(event); return; }
      const dx = drag.x - event.clientX;
      let dy = drag.y - event.clientY;
      drag.x = event.clientX; drag.y = event.clientY;
      drag.element.scrollLeft += dx;
      // In expanded mobile view, vertical scrolling belongs to the outer card.
      for (const element of drag.vertical) {
        const before = element.scrollTop;
        element.scrollTop = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, before + dy));
        dy -= element.scrollTop - before;
        if (!dy) break;
      }
      event.preventDefault();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
  };
}
