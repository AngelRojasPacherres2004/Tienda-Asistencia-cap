import { createContext } from 'react';

export const SingleBarPresentation = createContext(false);

export function singleBarMetric(option, chartId = '') {
  const series = Array.isArray(option?.series) ? option.series : option?.series ? [option.series] : [];
  if (series.length !== 1 || series[0].type !== 'bar' || series[0].data?.length !== 1) return null;
  const axes = [...(Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]), ...(Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis])].filter(Boolean);
  const category = axes.find(axis => axis.type === 'category');
  const axis = axes.find(item => item.type === 'value');
  if (!category || category.data?.length !== 1 || !axis) return null;
  const source = series[0].data[0];
  const raw = source && typeof source === 'object' ? source.value : source;
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean' || Array.isArray(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const format = axis.axisLabel?.formatter;
  let formatted = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value);
  if (typeof format === 'function') formatted = String(format(value, 0));
  else if (typeof format === 'string') formatted = format.replace('{value}', formatted);
  const rotation = chartId === 'inventory-rotation' && value >= 0 && formatted.includes('%');
  const percent = rotation || (axis.max === 1 && value >= 0 && value <= 1 && formatted.includes('%'));
  const categoryValue = category.data[0];
  return { kind: percent ? 'gauge' : 'indicator', rotation, inventory: chartId === 'inventory-store-value', value, formatted, category: String(categoryValue?.value ?? categoryValue), source, series: series[0], axis };
}

export function singleBarGauge(metric, originalTooltip) {
  const safe = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const units = value => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value);
  const money = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(value);
  const tooltipRows = (className, rows, note) => `<div class="${className}" style="width:280px;max-width:100%;font:12px/1.5 Arial,sans-serif;color:#10243c"><strong style="display:block;margin-bottom:8px;font-size:14px">${safe(metric.category)}</strong>${rows.map(([label, value]) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:8px 0;border-bottom:1px solid #dbe4ef"><span>${safe(label)}</span><b style="text-align:right">${safe(value)}</b></div>`).join('')}<p style="margin:10px 0 0;color:#475569">${safe(note)}</p></div>`;
  const option = {
    animation: false,
    tooltip: { trigger: 'item', triggerOn: metric.rotation || metric.inventory ? 'none' : 'mousemove|click', confine: true, backgroundColor: '#fff', borderColor: '#123a6a', textStyle: { color: '#10243c', fontSize: 12 }, formatter: params => {
      if (metric.rotation && metric.source?.rotationDetails) {
        const details = metric.source.rotationDetails;
        const rows = [['Rotación 90D', metric.formatted], ['Stock físico actual', `${units(details.stockUnits)} unidades`], ['Vendidas 90D', `${units(details.soldUnits90)} unidades`], ['Valor del stock', money(details.stockValue)], ['Venta 30D', money(details.sales30)]];
        return tooltipRows('rotation-tooltip', rows, 'Rotación = vendidas en 90 días ÷ stock actual × 100');
      }
      if (metric.inventory && metric.source?.inventoryDetails) {
        const details = metric.source.inventoryDetails;
        return tooltipRows('inventory-value-tooltip', [['Valor del inventario', money(metric.value)], ['Stock físico', `${units(details.stockUnits)} unidades`], ['Vendidas en 30 días', `${units(details.soldUnits30)} unidades`], ['Cobertura estimada', details.coverageDays == null ? 'Sin ventas para calcular' : `${units(details.coverageDays)} días`], ['Estado de cobertura', details.status]], 'Cobertura: días estimados de stock según el ritmo de venta.');
      }
      if (typeof originalTooltip?.formatter === 'function') {
        const sourceParams = { ...params, dataIndex: 0, name: metric.category, value: metric.value, data: metric.source };
        return originalTooltip.formatter(originalTooltip.trigger === 'axis' ? [sourceParams] : sourceParams);
      }
      return `${safe(metric.category)}: ${safe(metric.formatted)}`;
    } },
    series: [{ type: 'gauge', min: 0, max: 100, startAngle: 200, endAngle: -20, radius: '88%', center: ['50%', '60%'],
      axisLine: { lineStyle: { width: 14, color: [[1, '#e2e8f0']] } }, progress: { show: true, width: 14, itemStyle: { color: '#123a8c' } },
      axisLabel: { show: !metric.rotation, color: '#334155', fontSize: 12, distance: 18, formatter: '{value}%' }, axisTick: { show: false }, splitLine: { show: false },
      pointer: { itemStyle: { color: '#123a8c' }, length: '50%' }, anchor: { show: true, itemStyle: { color: '#123a8c' } },
      title: { show: true, fontSize: 13, color: '#334155', offsetCenter: [0, '45%'] }, detail: { fontSize: 28, color: '#10243c', offsetCenter: [0, '15%'], formatter: () => metric.formatted },
      data: [{ value: metric.value * 100, name: metric.value > 1 ? `${metric.category} · supera el 100 %` : metric.category, sourceData: metric.source }],
    }],
  };
  if (metric.rotation) {
    const series = option.series[0];
    series.startAngle = 180; series.endAngle = 0; series.radius = '88%'; series.center = ['50%', '66%'];
    series.pointer = { show: false }; series.anchor = { show: false };
    series.progress = { ...series.progress, roundCap: true };
    series.detail = { ...series.detail, fontSize: 32, offsetCenter: [0, '-20%'] };
    series.title = { ...series.title, fontSize: 14, offsetCenter: [0, '10%'] };
    if (metric.source?.rotationDetails) option.graphic = [
      { type: 'text', left: '8%', top: '88%', style: { text: `Stock: ${units(metric.source.rotationDetails.stockUnits)} und`, fill: '#334155', fontSize: 12 } },
      { type: 'text', right: '8%', top: '88%', style: { text: `Vendidas 90D: ${units(metric.source.rotationDetails.soldUnits90)} und`, fill: '#334155', fontSize: 12 } },
    ];
  }
  return option;
}

export function singleBarRadial(metric, originalTooltip) {
  const magnitude = Math.max(Math.abs(metric.value), 1);
  const step = 10 ** Math.floor(Math.log10(magnitude));
  const automaticMaximum = Math.ceil(magnitude / step) * step;
  const configuredMaximum = Number(metric.axis.max);
  const maximum = Number.isFinite(configuredMaximum) && configuredMaximum >= metric.value && configuredMaximum > 0 ? configuredMaximum : automaticMaximum;
  const minimum = metric.value < 0 ? -automaticMaximum : 0;
  const format = value => typeof metric.axis.axisLabel?.formatter === 'function'
    ? String(metric.axis.axisLabel.formatter(value, 0))
    : new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const gauge = singleBarGauge(metric, originalTooltip);
  const series = gauge.series[0];
  series.min = minimum;
  series.max = maximum;
  series.splitNumber = 4;
  series.startAngle = 225;
  series.endAngle = -45;
  series.center = ['50%', '48%'];
  series.radius = '76%';
  series.pointer = { show: false };
  series.anchor = { show: false };
  series.axisLabel = { color: '#334155', fontSize: 12, distance: 12, formatter: format };
  series.axisTick = { show: true, distance: -14, length: 5, lineStyle: { color: '#fff', width: 1 } };
  series.title = { show: true, fontSize: 14, color: '#334155', offsetCenter: [0, '65%'] };
  series.detail = { fontSize: 28, color: '#10243c', offsetCenter: [0, '10%'], formatter: () => metric.formatted };
  series.data = [{ value: metric.value, name: metric.category, sourceData: metric.source }];
  if (metric.inventory) { series.radius = '65%'; series.detail.fontSize = 26; }
  return gauge;
}
