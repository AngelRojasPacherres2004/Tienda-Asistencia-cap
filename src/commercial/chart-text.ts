export function blackChartText<T>(value: T): T {
  const visit = (node: unknown, key = ''): unknown => {
    if (Array.isArray(node)) return node.map(item => visit(item));
    if (!node || typeof node !== 'object') return node;
    const source = node as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const [field, child] of Object.entries(source)) copy[field] = visit(child, field);
    if (['axisLabel', 'axisName', 'nameTextStyle', 'textStyle', 'label', 'title'].includes(key) && copy['show'] !== false) copy['color'] = '#111111';
    if (key === 'axisLabel' && copy['show'] !== false) copy['fontSize'] = Math.max(11, Number(copy['fontSize']) || 0);
    if (key === 'tooltip' && copy['show'] !== false) {
      const textStyle = copy['textStyle'] && typeof copy['textStyle'] === 'object' ? copy['textStyle'] as Record<string, unknown> : {};
      copy['padding'] = [5, 7];
      copy['backgroundColor'] = '#ffffff';
      copy['borderColor'] = '#123a6a';
      copy['textStyle'] = { ...textStyle, color: '#111827', fontSize: 9 };
      copy['extraCssText'] = 'box-sizing:border-box;max-width:219px;white-space:normal;';
    }
    return copy;
  };
  return visit(value) as T;
}
