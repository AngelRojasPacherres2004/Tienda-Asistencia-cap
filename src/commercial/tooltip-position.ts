/** ECharts expects chart coordinates, even when the tooltip is attached to body. */
export function viewportTooltipPosition(
  point: number[], contentSize: number[], chart: { left: number; top: number }, viewport: number[],
): [number, number] {
  const margin = 12, gap = 16;
  const [width, height] = contentSize;
  const pointerX = chart.left + point[0], pointerY = chart.top + point[1];
  const preferredX = pointerX + gap + width <= viewport[0] - margin
    ? pointerX + gap : pointerX - width - gap;
  const x = Math.max(margin, Math.min(preferredX, viewport[0] - width - margin));
  const y = Math.max(margin, Math.min(pointerY - height / 2, viewport[1] - height - margin));
  return [x - chart.left, y - chart.top];
}
