import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
const db = createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
 const styles = {};
 for (const role of ['jefe_tienda','gerente_comercial']) {
  const {data,error} = await db.from('usuarios').select('id,rol,tienda_id,estado,cambio_credenciales_pendiente').eq('rol',role).eq('estado','activo').eq('cambio_credenciales_pendiente',false).order('id').limit(1);
  assert.ifError(error); assert.ok(data?.[0]);
  const context = await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addCookies([{name:'asiste_session',value:jwt.sign(data[0],process.env.JWT_SECRET,{expiresIn:'10m'}),url:'http://127.0.0.1:5180',httpOnly:true,sameSite:'Lax'}]);
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const auth = await context.request.get('http://127.0.0.1:5180/api/auth/me');
  console.log('session', role, auth.status());
  assert.equal(auth.status(),200);
  await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
  await page.locator('.sidebar').getByText('Personal',{exact:true}).click();
  const table=page.locator('.data-table--usuarios-tienda');
  await table.locator('.data-table__row').first().waitFor({timeout:60000});
  const columns=await table.locator('.data-table__head>span').allTextContents();
  assert.deepEqual(columns,role==='gerente_comercial'?['Nombre','DNI','Distrito','Teléfono','Rol','Tienda','Estado','Detalle']:['Nombre','DNI','Distrito','Teléfono','Rol','Estado','']);
  styles[role]=await table.evaluate(el=>Object.fromEntries(['.person-link','.data-table__head','.data-table__row','.mono','.personnel-role'].map(selector=>{
   const s=getComputedStyle(el.querySelector(selector));return [selector,{font:s.fontSize,family:s.fontFamily,color:s.color,background:s.backgroundColor,minHeight:s.minHeight}];
  })));
  if(role==='gerente_comercial') {
    assert.equal(await table.locator('.data-table__row').count(),10);
    await table.locator('.person-link').first().click();
    await page.getByRole('dialog').waitFor();
  }
  assert.deepEqual(errors,[]);
  console.log(role,JSON.stringify({columns,styles:styles[role]}));
  await context.close();
 }
 assert.deepEqual(styles.gerente_comercial,styles.jefe_tienda);
 console.log('PASS: manager personnel matches store administrator typography, colors and row sizing; store column and detail work.');
} finally {await browser.close();}
