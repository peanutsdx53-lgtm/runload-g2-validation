import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const rows=[],errors=[];await fs.mkdir('audit/v044_pc_result',{recursive:true});
for(const [key,width,height] of [['pc1440',1440,900],['pc1280',1280,850],['pc1100',1100,850],['phone390',390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await ctx.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  const go=async id=>width>=1100?page.locator(`.sidebar [data-id="${id}"]`).click():page.locator(`.footer-nav [data-id="${id}"]`).click();
  await go('S02');
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action="confirm-save"]:visible').click();
  await page.locator('[data-action="commit-record"]').click();
  await page.locator('[role="dialog"]').waitFor({state:'detached'});
  assert.equal(await page.locator('.region-list [data-action=select-region]').count(),width>=1100?0:12);
  if(width>=1100){
   await page.locator('.pc-result-console').waitFor();
   assert.equal(await page.locator('.pc-result-body-map .body-view').count(),3);
   assert.equal(await page.locator('.pc-region-matrix .pc-region-tile').count(),12);
   assert.equal(await page.locator('.pc-result-summary .pc-result-run-facts').count(),1);
   assert.equal(await page.locator('.pc-result-fatigue').count(),1);
   const styles=await page.locator('.pc-result-console').evaluate(e=>({display:getComputedStyle(e).display,rect:e.getBoundingClientRect().toJSON()}));
   assert.notEqual(styles.display,'none','old desktop result hidden');
   const selected=page.locator('.pc-region-matrix .pc-region-tile').nth(6);
   const id=await selected.getAttribute('data-id');
   await selected.click();
   assert.equal(await page.locator(`.pc-region-matrix [data-id="${id}"]`).getAttribute('aria-pressed'),'true');
   await page.locator('.pc-result-next [data-action="open-region"]').click();
   await page.locator('.modal-S06').waitFor();
   await page.keyboard.press('Escape');
   await page.locator('[role=dialog]').waitFor({state:'detached'});
  }
  const metrics=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,layout:document.querySelector('.pc-result-console')?getComputedStyle(document.querySelector('.pc-result-console')).display:null,scoreCount:document.querySelectorAll('.pc-region-tile').length}));
  assert(metrics.scrollWidth<=width+1,'horizontal scroll '+JSON.stringify(metrics));
  assert.equal(pageErrors.length,0,pageErrors.join(';'));
  await page.screenshot({path:`audit/v044_pc_result/${key}_S05_result.png`,fullPage:true,animations:'disabled'});
  rows.push({key,status:'PASS',metrics});
 }catch(e){errors.push({key,error:String(e.stack??e)});console.error(key,e);}
 await ctx.close();
}
await browser.close();
await fs.writeFile('audit/v044_pc_result.json',JSON.stringify({rows,errors},null,2));
console.log('V044 result checks',rows.length,'pass',errors.length,'fail');
if(errors.length)process.exitCode=1;
