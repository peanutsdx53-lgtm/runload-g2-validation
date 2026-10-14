import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch(), tests=[],errors=[];
await fs.mkdir('audit/v046_record',{recursive:true});
for(const [device,width,height] of [['pc1440',1440,900],['pc1280',1280,800],['pc1100',1100,800],['mobile390',390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'}),page=await ctx.newPage(),runtimeErrors=[];
 page.on('pageerror',e=>runtimeErrors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  const nav=width>=1100?'.sidebar [data-id="S02"]':'.footer-nav [data-id="S02"]';
  await page.locator(nav).click();await page.locator('#field-recordDate').waitFor();
  if(width>=1100){
   assert.equal(await page.locator('.pc-record-original-source.screen-layout--record').count(),1);
   assert.equal(await page.locator('.pc-record-original-source .desktop-save-area').count(),1);
   assert.equal(await page.locator('.pc-record-original-source [data-record-stage]').count(),4);
   assert.equal(await page.locator('.pc-record-original-source .measure-grid .measure-field').count(),2);
   assert.equal(await page.locator('.pc-record-original-source .stage-card').count(),3);
   assert.equal(await page.locator('.pc-record-original-source [data-action="open-course-library"]').count(),0);
   assert.equal(await page.locator('.pc-record-original-source [data-action="open-fatigue"]').count(),1);
  }else assert.equal(await page.locator('.pc-record-original-source').count(),0);
  await page.screenshot({path:'audit/v046_record/'+device+'_S02_input.png',fullPage:true,animations:'disabled'});
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  assert.equal(await page.locator('[data-action="confirm-save"]').count(),1);
  await page.locator('[data-action="confirm-save"]').click();
  await page.locator('.modal-S04').waitFor();
  await page.locator('[data-action="commit-record"]').click();
  await page.locator('.modal-S04').waitFor({state:'detached'});
  await page.locator('.screen-S05').waitFor();
  const metrics=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,form:(()=>{const e=document.querySelector('.pc-record-original-source .record-form');if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()}));
  assert(metrics.doc<=width+1);assert.equal(runtimeErrors.length,0,'browser errors '+runtimeErrors.join(';'));
  tests.push({device,status:'PASS',metrics});
 }catch(e){errors.push({device,error:String(e.stack||e)});console.error(device,e);}
 await ctx.close();
}
await browser.close();await fs.writeFile('audit/v046_record_browser.json',JSON.stringify({tests,errors},null,2));
console.log('V046 original record checks:',tests.length,'PASS',errors.length,'FAIL');
if(errors.length)process.exitCode=1;