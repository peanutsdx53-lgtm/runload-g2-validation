import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const browser=await chromium.launch(),passed=[],errors=[];await fs.mkdir('audit/v049_detail',{recursive:true});
for(const [label,width,height] of [['pc1440',1440,900],['pc1280',1280,800],['phone390',390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'}),page=await ctx.newPage(),jsErrors=[];page.on('pageerror',e=>jsErrors.push(String(e)));
 try{
 await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
 await page.locator((width>=1100?'.sidebar':'.footer-nav')+' [data-id="S02"]').click();
 await page.locator('#field-recordDate').fill('2026-10-10');await page.locator('#field-distanceKm').fill('5');await page.locator('#field-durationMinutes').fill('30');
 await page.locator('[data-action=confirm-save]').click();await page.locator('[data-action=commit-record]').click();await page.locator('[role=dialog]').waitFor({state:'detached'});
 await page.locator('[data-action="open-region"]:visible').first().click();await page.locator('.modal-S06').waitFor();
 if(width>=1100){
  const detail=page.locator('.g2-detail-original-source');assert.equal(await detail.count(),1);
  assert.equal(await detail.locator('.detail-hero .detail-locator svg').count(),1);
  assert.equal(await detail.locator('.trend-card svg.trend-svg--pc').count(),1);
  assert((await detail.innerText()).includes('股関節')|| (await detail.innerText()).includes('臀部'));
  assert.equal(await detail.locator('.g2-detail-reference-boundary').count(),1);
  await detail.locator('.g2-detail-reference-boundary summary').click();
  assert((await detail.innerText()).includes('正常値・安全値'));
 }
 await page.screenshot({path:'audit/v049_detail/'+label+'_S06_detail.png',fullPage:true,animations:'disabled'});
 const metrics=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert(metrics.scrollWidth<=width+1);assert.equal(jsErrors.length,0);
 passed.push({label,metrics});
 }catch(e){errors.push({label,error:String(e.stack||e)});console.error(label,e);}await ctx.close();
}
await browser.close();await fs.writeFile('audit/v049_detail.json',JSON.stringify({passed,errors},null,2));console.log('V049 copied original S06:',passed.length,'PASS',errors.length,'FAIL');if(errors.length)process.exitCode=1;
