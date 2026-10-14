import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch(),passed=[],failed=[];
await fs.mkdir('audit/v047_history',{recursive:true});
for(const [name,width,height] of [['pc1440',1440,900],['pc1280',1280,800],['phone390',390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const nav=id=>page.locator(width>=1100?'.sidebar [data-id="'+id+'"]':'.footer-nav [data-id="'+id+'"]').click();
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await nav('S07');
  if(width>=1100) {assert.equal(await page.locator('.pc-history-original-source.screen-layout--history').count(),1);assert.equal(await page.locator('.empty-records--initial').count(),1);}
  await nav('S02');
  await page.locator('#field-recordDate').fill('2026-10-10');await page.locator('#field-distanceKm').fill('5');await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action="confirm-save"]').click();await page.locator('[data-action="commit-record"]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  await nav('S07');
  if(width>=1100) {
   assert.equal(await page.locator('.pc-history-original-source .record-item').count(),1);
   assert.equal(await page.locator('.pc-history-original-source [data-action="delete-history-record"]').count(),0);
   assert.equal(await page.locator('.pc-history-original-source [data-action="open-record"]').count(),1);
   assert.equal(await page.locator('.pc-history-original-source .g2-history-science').count(),1);
   await page.locator('.pc-history-original-source .g2-history-science > summary').click();
   await page.locator('.pc-history-original-source [data-field="historyRegion"]').waitFor();
   assert.equal(await page.locator('.pc-history-original-source [data-field="historyMode"]').count(),1);
   const input=page.locator('.pc-history-original-source #history-record-filter-form input[name="query"]');
   await input.fill('987654');assert.equal(await page.locator('.pc-history-original-source .record-item:visible').count(),0);
   await input.fill('2026');assert.equal(await page.locator('.pc-history-original-source .record-item:visible').count(),1);
   await page.screenshot({path:'audit/v047_history/'+name+'_S07_saved.png',fullPage:true,animations:'disabled'});
   await page.locator('.pc-history-original-source [data-action="open-record"]').click();
   await page.locator('.screen-S05').waitFor();
  } else await page.screenshot({path:'audit/v047_history/'+name+'_S07_saved.png',fullPage:true,animations:'disabled'});
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert(metrics.scrollWidth<=width+1);assert.equal(errors.length,0,'PageErrors '+errors.join(';'));
  passed.push({name,metrics});
 }catch(e){failed.push({name,error:String(e.stack??e)});console.error(name,e);}
 await ctx.close();
}
await browser.close();await fs.writeFile('audit/v047_history_browser.json',JSON.stringify({passed,failed},null,2));console.log('Old PC History V047:',passed.length,'PASS',failed.length,'FAIL');
if(failed.length)process.exitCode=1;