import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch();const results=[],errors=[];
await fs.mkdir('audit/v048_result',{recursive:true});
for(const [device,width,height] of [['pc1440',1440,900],['pc1280',1280,800],['pc1100',1100,800],['phone390',390,844]]){
 const context=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'}),page=await context.newPage(),runtime=[];
 page.on('pageerror',error=>runtime.push(String(error)));
 const nav=async id=>page.locator((width>=1100?'.sidebar':'.footer-nav')+' [data-id="'+id+'"]').click();
 try {
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await nav('S02');
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action=confirm-save]').click();
  await page.locator('[data-action=commit-record]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  await page.locator('.screen-S05').waitFor();
  if(width>=1100){
   const root=page.locator('.pc-result-original-source');
   assert.equal(await root.count(),1,'original source renderer did not produce PC result');
   assert.equal(await root.locator('.pc-result-body-map .body-view').count(),3);
   assert.equal(await root.locator('.pc-region-tile[data-action=select-region]').count(),12);
   assert.equal(await root.locator('.pc-detail-stack .pc-detail-panel').count(),12);
   assert.equal(await root.locator('.body-region-selector').count(),12);
   const marker=await root.locator('.pc-result-summary').innerText();
   assert(marker.includes('2026-10-10')||marker.includes('2026年10月10日'),'date missing');
   const summaryMode=root.locator('[data-pc-summary-mode="change"]');
   await summaryMode.click();assert.equal(await summaryMode.getAttribute('aria-pressed'),'true');
   await root.locator('[data-pc-summary-mode="overview"]').click();
   const a=await root.locator('.pc-region-tile').nth(1).getAttribute('data-id');
   await root.locator('.pc-region-tile').nth(1).click();
   await page.locator('.pc-region-tile[data-id="'+a+'"][aria-pressed=true]').waitFor();
   const panel=page.locator('.pc-detail-panel.is-active');
   assert.equal(await panel.count(),1);
   await page.screenshot({path:`audit/v048_result/${device}_S05_saved.png`,fullPage:true,animations:'disabled'});
   // Correct scientific values and source data remain the G2 reference100 output.
   assert((await root.innerText()).includes('基準100'));
  }else await page.screenshot({path:`audit/v048_result/${device}_S05_saved.png`,fullPage:true,animations:'disabled'});
  const metrics=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth}));
  assert(metrics.doc<=width+1,JSON.stringify(metrics));
  if(runtime.length)throw Error('JS runtime exception: '+runtime.join(' / '));
  results.push({device,result:'PASS',metrics});
 }catch(error){errors.push({device,error:String(error.stack||error)});console.error(device,error);}await context.close();
}
await browser.close();await fs.writeFile('audit/v048_result.json',JSON.stringify({results,errors},null,2));console.log('DIRECT OLD S05',results.length,'PASS',errors.length,'FAIL');if(errors.length)process.exitCode=1;