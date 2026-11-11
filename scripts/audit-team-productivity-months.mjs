import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createClient} from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const {data,error}=await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol','gerente_comercial').eq('estado','activo').eq('cambio_credenciales_pendiente',false).limit(1);
assert.ifError(error);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'asiste_session',value:jwt.sign(data[0],process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
 await page.locator('.page-tabs button').nth(2).waitFor({timeout:60000});
 await page.locator('.page-tabs button').nth(2).click();
 const chart=page.locator('[data-react-commercial-chart="talent-team-productivity"]');
 await chart.waitFor();
 await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').map(row=>row.name).find(name=>name.includes('/echarts_core.js'));
  if(!url) throw new Error('ECharts module was not loaded');
  window.auditCharts=await import(url);
 });
 await page.waitForFunction(()=>{
  const el=document.querySelector('app-root')?.shadowRoot?.querySelector('[data-react-commercial-chart="talent-team-productivity"]');
  return window.auditCharts.getInstanceByDom(el)?.getOption()?.series?.[0]?.data?.length>0;
 },null,{timeout:60000});
 const snapshot=()=>chart.evaluate(el=>{
  const option=window.auditCharts.getInstanceByDom(el).getOption();
  return {teams:option.yAxis[0].data,values:option.series[0].data};
 });
 const october=await snapshot();
 await page.getByRole('button',{name:'Abrir filtros y listas',exact:true}).click();
 const month=page.locator('.filter-field details').first();
 await month.locator('summary').click();
 await month.getByRole('button',{name:'NOV',exact:true}).click();
 await page.waitForTimeout(300);
 assert.deepEqual(await snapshot(),october);
 await month.getByRole('button',{name:'OCT',exact:true}).click();
 await page.waitForTimeout(300);
 assert.equal((await snapshot()).values.length,0);
 console.log('PASS: October + November equals October; November alone has no sales productivity data.');
}finally{await browser.close();}
