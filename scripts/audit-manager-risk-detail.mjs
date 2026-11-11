import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { mkdir } from 'node:fs/promises';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const {data,error}=await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol','gerente_comercial').eq('estado','activo').eq('cambio_credenciales_pendiente',false).limit(1);
assert.ifError(error);assert.ok(data?.[0]);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Lima'});
 await context.addCookies([{name:'asiste_session',value:jwt.sign(data[0],process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
 assert.equal((await context.request.get('http://127.0.0.1:5180/api/auth/me')).status(),200);
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
 await page.locator('.page-tabs button').nth(1).waitFor({timeout:60000});
 await page.locator('.page-tabs button').nth(1).click();
 const trigger=page.locator('.stock-product-detail-trigger');
 if(await trigger.count()) await trigger.scrollIntoViewIfNeeded();
 const projection=page.locator('[data-react-commercial-module="projection-card"]');
 await projection.locator('.risk-explainer').waitFor({timeout:60000});
 assert.equal(await projection.locator('[data-react-commercial-chart="predictive-projection"]').count(),0);
 assert.equal(await projection.locator('.risk-status-table').count(),1);
 assert.equal(await projection.locator('.risk-priority-list').count(),1);
 assert.equal(await projection.locator('.risk-value-grid').count(),3);
 const selector=projection.getByRole('combobox',{name:'Tienda del valor en riesgo'});
 const options=await selector.locator('option').evaluateAll(els=>els.map(el=>({value:el.value,label:el.textContent})));
 const visibleStores=await projection.locator('.risk-store-detail h3').allTextContents();
 const other=options.find(option=>option.value!=='TODAS'&&!visibleStores.includes(option.label));
 assert.ok(other,'The filter must include stores outside the top three');
 const healthBefore=await page.locator('.health-table').textContent();
 await selector.selectOption(other.value);
 await projection.locator('.risk-store-detail h3').filter({hasText:other.label}).waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('app-root')?.shadowRoot?.querySelector('[data-react-commercial-module="projection-card"]')?.getAttribute('aria-busy')!=='true',null,{timeout:60000});
 assert.equal(await projection.locator('.risk-store-detail').count(),1);
 assert.equal(await page.locator('.health-table').textContent(),healthBefore);
 console.log('specific-store filter works outside the top three without changing inventory health');

 const header=page.locator('.health-table-head');
 const sizes=await header.locator('span').evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));
 assert.ok(sizes.every(size=>size>=12));
 console.log('health headers',JSON.stringify(sizes));
 for(const horizon of ['+30D','+60D','+90D','ACTUAL']) {
  await projection.getByRole('button',{name:horizon,exact:true}).click();
  await page.waitForFunction(()=>{ const root=document.querySelector('app-root')?.shadowRoot; return root?.querySelector('[data-react-commercial-module="projection-card"]')?.getAttribute('aria-busy')!=='true'; },null,{timeout:60000});
  assert.ok(await projection.locator('.risk-status-table tbody tr').count()>0);
  console.log('risk detail horizon',horizon,'works');
 }
 await selector.selectOption('TODAS');
 await page.waitForFunction(()=>document.querySelector('app-root')?.shadowRoot?.querySelectorAll('.risk-store-detail').length===3,null,{timeout:60000});
 console.log('reset restores the three highest-risk stores');
 await mkdir('artifacts',{recursive:true});
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  const dimensions=await projection.evaluate(el=>({height:el.getBoundingClientRect().height,content:el.scrollHeight,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth}));
  assert.ok(dimensions.content<=dimensions.height+2,JSON.stringify(dimensions));
  assert.ok(dimensions.pageWidth<=dimensions.viewport+1,JSON.stringify(dimensions));
  console.log('viewport',width,JSON.stringify(dimensions));
  await projection.scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/manager-risk-detail-${width}.png`});
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
