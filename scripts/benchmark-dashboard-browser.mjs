import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { sum, grouped, previousStores, previousExtremes, previousSellers } from './benchmark-dashboard-computation.mjs';

const legacy = `const sum = ${sum}; ${grouped} ${previousStores} ${previousExtremes} ${previousSellers}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5180/');
  const result = await page.evaluate(async legacyCode => {
    const optimized = await import('/src/commercial/inventory-performance.ts');
    const old = new Function(`${legacyCode}; return { previousStores, previousExtremes, previousSellers };`)();
    const rows = Array.from({ length: 142055 }, (_, i) => ({
      productId: `P${i % 50000}`, product: `Producto ${i % 50000}`, storeId: `T${i % 18}`,
      stockUnits: i % 39 - 2, stockValue: (i % 503) * 1.17, units30: i % 17, sales30: (i % 73) * 2.31,
      goodUnits: i % 5 ? i % 29 : undefined,
      seller: i % 11 ? `V${i % 1200}` : '', net: i % 31 ? (i % 83) * 3.19 : -24, units: i % 13, transactions: i % 7,
    }));
    const cases = [
      ['Cobertura y rotacion', () => [old.previousStores(rows), old.previousStores(rows)], () => {
        const result = optimized.aggregateStoreMetrics(rows); return [result, result];
      }],
      ['Mayor/menor stock', () => old.previousExtremes(rows), () => optimized.stockExtremes(rows)],
      ['Ranking vendedores', () => old.previousSellers(rows), () => optimized.aggregateSellerRanking(rows)],
      ['1000 formatos numericos', () => Array.from({ length: 1000 }, (_, i) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(i * 1.1)),
        () => Array.from({ length: 1000 }, (_, i) => optimized.dashboardNumberFormat.format(i * 1.1))],
    ];
    const serialize = value => JSON.stringify(value, (_, item) => item instanceof Map ? [...item] : item);
    const measure = fn => {
      fn(); fn();
      const times = [];
      for (let i = 0; i < 9; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
      return +times.sort((a, b) => a - b)[4].toFixed(2);
    };
    const results = [];
    for (const [name, before, after] of cases) {
      if (serialize(before()) !== serialize(after())) throw new Error(`Resultados diferentes: ${name}`);
      const beforeMs = measure(before), afterMs = measure(after);
      results.push({ name, beforeMs, afterMs, reductionPct: +(100 * (1 - afterMs / beforeMs)).toFixed(1) });
    }
    return { browser: navigator.userAgent, dataset: 'synthetic', rows: rows.length, statistic: 'median of 9', parity: 'exact', results };
  }, legacy);
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/dashboard-performance.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
