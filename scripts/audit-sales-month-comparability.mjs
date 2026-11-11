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
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
 await page.locator('.page-tabs button').nth(2).waitFor({timeout:60000});
 await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').map(row=>row.name).find(name=>name.includes('/echarts_core.js'));
  window.auditCharts=await import(url);
 });
 async function snapshot() {
  return page.locator('[data-react-commercial-shell]').evaluate(root=>{
   const charts={};
   for(const el of root.querySelectorAll('[data-react-commercial-chart]')) {
    const option=window.auditCharts.getInstanceByDom(el)?.getOption();
    if(option) charts[el.dataset.reactCommercialChart]=(option.series||[]).map(series=>(series.data||[]).map(row=>typeof row==='object'&&row!==null?{name:row.name,value:row.value}:row));
   }
   const cards=Object.fromEntries([...root.querySelectorAll('.primary-kpis .metric-card,.kpi-strip article')].map(el=>[el.querySelector('span')?.textContent,el.querySelector('strong')?.textContent]));
   return {charts,cards};
  });
 }
 async function setMonths(mode) {
  await page.getByRole('button',{name:'Abrir filtros y listas',exact:true}).click();
  const month=page.locator('.filter-field details').first();
  if(await month.getAttribute('open')===null) await month.locator('summary').click();
  for(const [name,selected] of [['OCT',mode!=='november'],['NOV',mode!=='october']]) {
   const button=month.getByRole('button',{name,exact:true});
   if((await button.getAttribute('aria-pressed')==='true')!==selected) await button.click();
  }
  await page.getByRole('button',{name:'Abrir filtros y listas',exact:true}).click();
 }
 await page.waitForFunction(()=>{
  const root=document.querySelector('app-root')?.shadowRoot;
  const card=[...(root?.querySelectorAll('.kpi-strip article')||[])].find(el=>el.querySelector('span')?.textContent==='VENTA × M²');
  return card?.querySelector('strong')?.textContent!=='N/A';
 },null,{timeout:60000});
 await page.waitForTimeout(300);
 const before=await snapshot();
 await setMonths('both');
 await page.waitForTimeout(500);
 const both=await snapshot();
 const equalCards=['PROYECCIÓN CIERRE','VENTA PROMEDIO DIARIA','VENTA × M²','CONVERSIÓN','TICKET PROMEDIO','MARKUP'];
 for(const key of equalCards) if(key in before.cards) assert.equal(both.cards[key],before.cards[key],key);
 for(const key of Object.keys(before.charts)) if(key in both.charts) assert.deepEqual(both.charts[key],before.charts[key],key);
 console.log('page 1 sales charts and comparable KPIs unchanged when November has only traffic');
 await setMonths('november');
 await page.waitForTimeout(300);
 const nov=await snapshot();
 assert.equal(nov.cards['VENTA PROMEDIO DIARIA'],'N/A');
 assert.equal(nov.cards['PROYECCIÓN CIERRE'],'N/A');
 assert.equal(nov.cards['CONVERSIÓN'],'N/A');
 console.log('November-only daily sales average, forecast and conversion correctly have no sales data');
 await setMonths('october');
 await page.locator('.page-tabs button').nth(2).click();
 await page.waitForFunction(()=>{
  const el=document.querySelector('app-root')?.shadowRoot?.querySelector('[data-react-commercial-chart="talent-team-productivity"]');
  return el && window.auditCharts.getInstanceByDom(el)?.getOption()?.series?.[0]?.data?.length>0;
 },null,{timeout:60000});
 const talent=await snapshot();
 await setMonths('both');
 await page.waitForTimeout(300);
 const talentBoth=await snapshot();
 for(const key of ['talent-team-productivity','talent-seller','talent-history']) if(key in talent.charts&&key in talentBoth.charts) assert.deepEqual(talentBoth.charts[key],talent.charts[key],key);
 console.log('team productivity, seller performance and historical charts remain consistent');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
