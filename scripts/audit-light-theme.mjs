import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const files = ['src/styles.css', 'src/role-typography.css', 'src/role-themes.css', 'src/marketing-light.css', 'src/dashboard-light.css'];
const css = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '');
const correction = await readFile('src/theme-consistency.css', 'utf8');
let fixture = `<div class="app-shell app-theme app-light marketing-theme marketing-light">
  <aside class="sidebar sidebar--readable"><nav><button class="active">Mi tienda</button><button>Personal</button><button>Asistencias</button></nav><div class="sidebar__footer"><div class="user-chip"><span>A</span><div><strong>Administrador de tienda</strong><small>Tienda de prueba</small></div></div></div></aside>
  <main class="workspace commercial-role"><div class="workspace__content"><h1>Revisión de modo claro</h1>
    <section class="store-management-page"><div class="panel" style="padding:20px"><h2>Mi tienda · Auditorías</h2>
      <div class="audit-center__tabs"><button class="active">Observaciones y levantamientos</button><button>Historial de auditorías</button></div>
      <div class="audit-score"><button><b>1</b><span>Pendiente</span></button><button class="selected"><b>2</b><span>Seleccionado</span></button></div>
      <div class="audit-summary__sections"><article><span>Resumen</span><strong>80%</strong></article></div>
      <div class="audit-section-results"><div><span>Resultado</span><strong>Conforme</strong></div></div>
      <div class="audit-observation-list"><article><h3>Observación</h3><p>Detalle de la revisión</p><aside>Comentario de seguimiento</aside></article></div>
    </div></section>
    <h2>Supervisiones · Vista zonal</h2><div class="supervision-metrics"><article><span>✓</span><div><small>Revisiones</small><strong>4</strong></div></article></div>
    <div class="supervision-toolbar"><label><input placeholder="Buscar supervisión"/></label><select><option>Todas las tiendas</option></select></div>
    <section class="supervision-panel"><header><div><span>SUPERVISIÓN</span><h2>Revisiones de tienda</h2></div></header><div style="padding:16px">Contenido de la supervisión</div></section>
    <div class="store-main-data"><dl><div><dt>Tienda</dt><dd>Datos de tienda</dd></div></dl></div>
    <div class="store-user-row"><div><strong>Personal de tienda</strong><small>Administrador</small></div></div>
  </div></main></div>`;
fixture = fixture.replace('</div></main></div>', `<h2>Horarios PDF</h2>
  <div class="schedule-tabs"><button class="active">Manual</button><button>Importar PDF</button></div>
  <div class="period-filter-tabs"><button class="active">Mes</button><button>Año</button></div>
  <div class="pdf-importer__hero"><span>PDF</span><div><small>HORARIOS</small><h2>Importar horario</h2><p>Configuración de importación</p></div></div>
  <div class="month-picker"><button>Enero</button><button class="selected">Febrero</button></div>
  <div class="pdf-dropzone"><span>+</span><div><strong>Horario PDF</strong><small>Selecciona un archivo</small></div><button>×</button></div>
  <div class="pdf-help">Información de importación</div><div class="pdf-preview__head">Vista previa</div>
  <div class="traffic-matrix-card"><div class="traffic-matrix-grid" style="display:flex"><div class="traffic-matrix-corner">Día / hora</div><div class="traffic-matrix-hour">09:00</div><div class="traffic-matrix-date"><strong>Lunes</strong><small>Fecha</small></div><div class="traffic-matrix-cell has-value" style="--heat:1">10</div><div class="traffic-matrix-total">10</div></div></div>
  <div class="recharts-default-tooltip"><p class="recharts-tooltip-label">Valor del gráfico</p></div>
  <div class="attendance-report-settings"><div class="panel">Reportes programados</div></div>
  <div class="dashboard-card--expanded" style="position:static;box-shadow:none">Gráfico ampliado</div>
  <div class="attendance-matrix-panel--expanded" style="position:static;box-shadow:none">Asistencia ampliada</div>
  <div class="personnel-chart-panel--expanded" style="position:static;box-shadow:none">Personal ampliado</div>
  </div></main></div>`);
const selectors = ['.sidebar', '.audit-score button:not(.selected)', '.audit-summary__sections article', '.audit-section-results > div', '.audit-observation-list aside', '.supervision-metrics article', '.supervision-toolbar', '.supervision-toolbar select', '.supervision-panel', '.store-main-data dl > div', '.store-user-row',
  '.schedule-tabs', '.period-filter-tabs', '.pdf-importer__hero', '.month-picker button:not(.selected)', '.pdf-dropzone', '.pdf-dropzone > button', '.pdf-help', '.pdf-preview__head', '.traffic-matrix-card', '.traffic-matrix-grid', '.traffic-matrix-date', '.traffic-matrix-hour', '.recharts-default-tooltip', '.attendance-report-settings .panel', '.dashboard-card--expanded', '.attendance-matrix-panel--expanded', '.personnel-chart-panel--expanded'];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.setContent(fixture);
  await page.addStyleTag({ content: css });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const collect = () => page.evaluate(selectors => selectors.map(selector => {
    const style = getComputedStyle(document.querySelector(selector));
    return { selector, background: style.backgroundColor, image: style.backgroundImage, color: style.color };
  }), selectors);
  const before = await collect();
  await page.addStyleTag({ content: correction });
  const after = await collect();
  for (const row of after) {
    const channels = row.background.match(/[\d.]+/g).map(Number);
    assert.ok(channels[0] > 200 && channels[1] > 200 && channels[2] > 200, `${row.selector} remains dark: ${JSON.stringify(row)}`);
    assert.equal(row.image, 'none', `${row.selector} retains a dark gradient`);
  }
  for (const selector of ['.schedule-tabs button.active', '.period-filter-tabs button.active', '.month-picker button.selected']) {
    assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)');
  }
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/light-theme-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/light-theme-mobile.png', fullPage: true });
  await page.evaluate(() => {
    const root = document.querySelector('.app-shell');
    root.classList.replace('app-light', 'app-dark'); root.classList.replace('marketing-light', 'marketing-dark');
  });
  const dark = await collect();
  assert.equal(dark.find(row => row.selector === '.audit-score button:not(.selected)').background, 'rgb(16, 16, 18)');
  assert.equal(dark.find(row => row.selector === '.sidebar').background, 'rgb(17, 25, 35)');
  await writeFile('artifacts/light-theme-audit.json', JSON.stringify({ source: 'rendered component style fixtures, no account data', before, after, dark }, null, 2) + '\n');
  console.log(JSON.stringify({ checked: selectors.length, light: 'pass', dark: 'pass', desktop: '1440px', mobile: '390px' }));
} finally { await browser.close(); }
