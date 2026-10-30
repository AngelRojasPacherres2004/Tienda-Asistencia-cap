import { createContext } from 'react';

export const CommercialChartTypography = createContext(false);

export function readableChartTypography(value, key = '') {
  if (Array.isArray(value)) return value.map(item => readableChartTypography(item, key));
  if (!value || typeof value !== 'object') return value;
  const copy = Object.fromEntries(Object.entries(value).map(([field, child]) => [field, readableChartTypography(child, field)]));
  if ('fontSize' in copy || ['axisLabel', 'label', 'textStyle', 'nameTextStyle'].includes(key)) copy.fontSize = 12;
  if (key === 'title') copy.textStyle = { ...copy.textStyle, fontSize: 16 };
  return copy;
}
