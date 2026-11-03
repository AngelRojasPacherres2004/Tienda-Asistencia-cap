export const GOAL_MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export function parseGoalMatrix(rows, stores) {
  if (!rows.length || rows.length > 1001) throw new Error('Usa una hoja con encabezados y hasta 1,000 filas.');
  const quotaYear = /^20\d{2}$/.test(String(rows[0][0])) ? Number(rows[0][0]) : null;
  const fullMonths = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const headers = rows[0].map(value => { const text = norm(value); const month = fullMonths.indexOf(text); return month < 0 ? text : GOAL_MONTHS[month]; });
  if (quotaYear) headers[0] = 'TIENDA';
  const storeCol = headers.indexOf('TIENDA');
  const columns = GOAL_MONTHS.map(month => headers.indexOf(month));
  if (storeCol < 0 || columns.some(c => c < 0) || new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('Usa los encabezados de la plantilla: TIENDA y ENE a DIC, sin repetir columnas.');
  const patch = {}, seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (row.every(v => v == null || v === '')) continue;
    const key = norm(row[storeCol]);
    const alias = {'MARINA':'MAR','JR UNION':'JRU','PZA UNION':'PZU'}[key];
    const matches = stores.filter(s => [s.nombre,s.codigo,s.id].some(v => key && norm(v) === key) || (alias && norm(s.codigo) === alias));
    if (matches.length !== 1) throw new Error(`Fila ${r + 1}: tienda desconocida o ambigua (${key || 'vacía'}).`);
    const id = matches[0].id;
    if (seen.has(id)) throw new Error(`Fila ${r + 1}: tienda repetida.`);
    seen.add(id);
    columns.forEach((col, index) => {
      const raw = row[col]; if (raw == null || raw === '') return;
      let value = String(quotaYear && typeof raw === 'number' ? Math.round((raw + Number.EPSILON) * 100) / 100 : raw).trim().replace(/^S\/\s*/i, '').replace(/\s/g, '');
      if (value.includes(',') && value.includes('.')) value = value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
      else if (value.includes(',')) value = /^\d{1,3}(,\d{3})+$/.test(value) ? value.replace(/,/g, '') : value.replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 999999999999.99) throw new Error(`Fila ${r + 1}, ${GOAL_MONTHS[index]}: monto inválido. Usa un número positivo o cero con hasta 2 decimales, sin fórmulas.`);
      patch[`${id}|${index + 1}`] = String(Number(value));
    });
  }
  if (!Object.keys(patch).length) throw new Error('No se encontraron metas para importar.');
  return { patch, year:quotaYear, totalScope:Boolean(quotaYear), storeCount: seen.size, count: Object.keys(patch).length, total: Object.values(patch).reduce((sum,v) => sum + Number(v), 0) };
}
