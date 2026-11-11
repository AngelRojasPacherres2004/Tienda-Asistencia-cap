import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { mkdir } from 'node:fs/promises';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: users, error } = await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol','gerente_comercial').eq('estado','activo').eq('cambio_credenciales_pendiente', false).limit(1);
assert.ifError(error);
assert.ok(users?.[0]);
const origin = 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel:'msedge', headless:true });
try {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 }, timezoneId:'America/Lima' });
  await context.addCookies([{ name:'asiste_session', value:jwt.sign(users[0],process.env.JWT_SECRET,{ expiresIn:'10m' }), url:origin, httpOnly:true, sameSite:'Lax' }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil:'domcontentloaded' });
  await page.locator('.page-tabs button').nth(2).waitFor({ timeout:60000 });
  await page.locator('.page-tabs button').nth(2).click();
  const panel = page.locator('.manager-summary-panels .training-development');
  await panel.waitFor({ timeout:60000 });
  await panel.scrollIntoViewIfNeeded();
  await mkdir('artifacts', { recursive:true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height:1000 });
    const dimensions = await panel.evaluate(el => {
      const cards = [...el.querySelectorAll('.training-development-grid>article')].map(x => x.getBoundingClientRect());
      return { width:el.getBoundingClientRect().width, parentWidth:el.parentElement.getBoundingClientRect().width, stacked:cards[1].top >= cards[0].bottom, columns:getComputedStyle(el.querySelector('.training-history>div:not(.training-history-head)')).gridTemplateColumns.trim().split(/\s+/).length, headerDisplay:getComputedStyle(el.querySelector('.training-history-head')).display, pageWidth:document.documentElement.scrollWidth, viewport:window.innerWidth };
    });
    assert.ok(Math.abs(dimensions.width-dimensions.parentWidth)<2);
    assert.equal(dimensions.stacked,true);
    assert.equal(dimensions.columns,4);
    assert.equal(dimensions.headerDisplay,'grid');
    assert.ok(dimensions.pageWidth<=dimensions.viewport+1);
    console.log(width, JSON.stringify(dimensions));
    await panel.screenshot({ path:`artifacts/manager-training-${width}.png` });
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
