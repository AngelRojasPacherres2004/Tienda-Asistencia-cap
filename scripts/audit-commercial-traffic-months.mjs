import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createClient} from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const navigation={};
 for(const role of ['gerente_comercial','jefe_tienda']) {
  const {data,error}=await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol',role).eq('estado','activo').eq('cambio_credenciales_pendiente',false).order('id').limit(10);
  assert.ifError(error);assert.ok(data?.[0]);
  let context,traffic;
  for(const account of data) {
   const candidate=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Lima'});
   await candidate.addCookies([{name:'asiste_session',value:jwt.sign(account,process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
   const auth=await candidate.request.get('http://127.0.0.1:5180/api/auth/me');
   const resolved=await auth.json();
   const response=await candidate.request.get('http://127.0.0.1:5180/api/commercial/traffic-summary',{headers:role==='jefe_tienda'?{'x-store-context':String(resolved.user?.tienda_id || '')}:{}});
   if(auth.status()===200 && response.status()===200) {context=candidate;traffic=await response.json();break;}
   await candidate.close();
  }
  assert.ok(context,`An active ${role} with valid commercial scope is required`);
  const hasNovember=traffic.daily.some(row=>row.date.startsWith('2026-11'));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
  await page.locator('.page-tabs button').nth(0).waitFor({timeout:60000});
  const defaultValues=await page.locator('.primary-kpis .metric-card>strong').allTextContents();
  await page.getByRole('button',{name:'Abrir filtros y listas',exact:true}).click();
  const month=page.locator('.filter-field details').first();
  await month.locator('summary').click();
  assert.equal(await month.getByRole('button',{name:'OCT',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await month.getByRole('button',{name:'NOV',exact:true}).count(),hasNovember?1:0);
  if(hasNovember) {
   await month.getByRole('button',{name:'NOV',exact:true}).click();
   await month.getByRole('button',{name:'OCT',exact:true}).click();
   await month.locator('summary').click();
   await page.locator('.day-picker-trigger').click();
   const enabled=await page.locator('.calendar-day:not([disabled])').allTextContents();
   assert.ok(enabled.length>0);
   await page.locator('.calendar-day').filter({hasText:/^1$/}).click();
   await page.waitForFunction(()=>document.querySelector('app-root')?.shadowRoot?.querySelector('.day-picker-trigger')?.textContent?.includes('01/11'),null,{timeout:30000});
   assert.equal(await page.locator('.calendar-error').count(),0);
   const trafficValues=await page.locator('.traffic-kpi>strong').allTextContents();
   assert.ok(trafficValues.some(value=>/[1-9]/.test(value)));
   await page.locator('.calendar-close').click();
   await page.getByRole('button',{name:'Restablecer todos los filtros',exact:true}).click();
   assert.deepEqual(await page.locator('.primary-kpis .metric-card>strong').allTextContents(),defaultValues);
   console.log(role,'November available; date selector works; reset preserves original commercial values');
  }
  await page.setViewportSize({width:390,height:844});
  navigation[role]=await page.evaluate(()=>({menu:getComputedStyle(document.querySelector('.mobile-topbar strong')).fontSize,sidebar:getComputedStyle(document.querySelector('.sidebar nav button')).fontSize}));
  assert.deepEqual(errors,[]);
  await context.close();
 }
 assert.deepEqual(navigation.gerente_comercial,navigation.jefe_tienda);
 assert.deepEqual(navigation.gerente_comercial,{menu:'19px',sidebar:'18px'});
 console.log('PASS: management navigation sizes match',JSON.stringify(navigation));
}finally{await browser.close();}
