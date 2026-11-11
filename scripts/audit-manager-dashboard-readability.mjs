import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { mkdir } from 'node:fs/promises';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 await mkdir('artifacts',{recursive:true});
 const styles={};
 for(const role of ['jefe_tienda','gerente_comercial']) {
  const {data,error}=await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol',role).eq('estado','activo').eq('cambio_credenciales_pendiente',false).order('id').limit(1);
  assert.ifError(error);assert.ok(data?.[0]);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Lima'});
  await context.addCookies([{name:'asiste_session',value:jwt.sign(data[0],process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
  assert.equal((await context.request.get('http://127.0.0.1:5180/api/auth/me')).status(),200);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
  await page.locator('.page-tabs button').nth(2).waitFor({timeout:60000});
  await page.locator('.primary-kpis .metric-card').first().waitFor();
  styles[role]=await page.locator('[data-react-commercial-shell]').evaluate(el=>({label:parseFloat(getComputedStyle(el.querySelector('.metric-card>span')).fontSize),value:parseFloat(getComputedStyle(el.querySelector('.metric-card>strong')).fontSize),title:parseFloat(getComputedStyle(el.querySelector('.chart-card h2')).fontSize),height:el.querySelector('.chart-card').getBoundingClientRect().height}));
  console.log(role,JSON.stringify(styles[role]));
  if(role==='gerente_comercial') {
   for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    for(let i=0;i<3;i++) {
     await page.locator('.page-tabs button').nth(i).click();
     const module=page.locator(`[data-react-commercial-module="${['commercial-page','inventory-page','talent-page'][i]}"]`);
     await module.waitFor();
     const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
     assert.ok(dimensions.width<=dimensions.viewport+1,JSON.stringify({i,...dimensions}));
     console.log('page',i+1,'viewport',width,'no horizontal overflow');
     if(width===1440) {await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`artifacts/manager-readable-page-${i+1}.png`});}
    }
   }
  }
  assert.deepEqual(errors,[]);
  await context.close();
 }
 for(const key of ['label','value','title','height']) assert.ok(styles.gerente_comercial[key]>styles.jefe_tienda[key],key);
 console.log('PASS: manager dashboard is larger than the store dashboard and all three pages fit desktop and mobile.');
} finally {await browser.close();}
