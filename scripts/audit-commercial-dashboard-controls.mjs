import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({channel:'msedge',headless:true});
const themeByRole={};
try {
 for(const role of ['jefe_tienda','gerente_comercial','asistente_tienda','jefe_zonal','coach']) {
  const {data,error}=await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol',role).eq('estado','activo').eq('cambio_credenciales_pendiente',false).limit(10);
  assert.ifError(error);
  let context;
  for(const user of data || []) {
   const candidate=await browser.newContext({viewport:{width:1440,height:1000}});
   await candidate.addCookies([{name:'asiste_session',value:jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
   const access=await candidate.request.get('http://127.0.0.1:5180/api/commercial/access');
   if(access.status()===200){context=candidate;break;}
   await candidate.close();
  }
  assert.ok(context,`An active ${role} with commercial access is required`);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
  await page.locator('.page-tabs button').nth(2).waitFor({timeout:60000});
  for(let i=0;i<3;i++) {
   await page.locator('.page-tabs button').nth(i).click();
   assert.equal(await page.locator('.assistant-launcher').count(),0);
   assert.equal(await page.getByRole('button',{name:'Abrir asistente comercial',exact:true}).count(),0);
  }
  console.log(role,'AI chat button absent on all three commercial dashboard pages');
  if(['jefe_tienda','gerente_comercial'].includes(role)) {
   themeByRole[role]={};
   for(const name of ['Resumen comercial','Transferencia','Personal','Capacitaciones','Reportes','Historial']) {
    await page.locator('.sidebar').getByText(name,{exact:true}).click();
    await page.locator('.sidebar button.active').filter({hasText:name}).waitFor();
    const count=await page.locator('.marketing-theme-toggle').count();
    themeByRole[role][name]=count;
   }
   assert.equal(themeByRole[role]['Transferencia'],0);
   console.log(role,'theme buttons',JSON.stringify(themeByRole[role]));
  }
  assert.deepEqual(errors,[]);
  await context.close();
 }
 assert.deepEqual(themeByRole.gerente_comercial,themeByRole.jefe_tienda);
 console.log('PASS: manager theme controls match store administration; AI chat launchers absent for all commercial roles.');
}finally{await browser.close();}
