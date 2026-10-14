import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.RUNLOAD_TEST_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch();
const checks=[],errors=[];
for(const [label,width,height] of [['PC',1440,900],['mobile',390,844],['narrow',320,700],['tablet',800,900]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await ctx.newPage(),runtimeErrors=[];
 page.on('pageerror',e=>runtimeErrors.push(String(e)));
 const check=async(state)=>{
  const data=await page.evaluate(()=>{
   const el=document.documentElement,body=document.body;
   return {width:innerWidth,docWidth:el.scrollWidth,bodyWidth:body.scrollWidth,title:document.querySelector('#main-content h1')?.textContent??'',brandWords:(document.querySelector('#main-content')?.innerText||'').includes('RunLoad'),required:document.querySelectorAll('#field-recordDate,#field-distanceKm,#field-durationMinutes').length,nav:!!document.querySelector('.footer-nav'),dialog:!!document.querySelector('[role=dialog]')};
  });
  if(data.docWidth>width+1||data.bodyWidth>width+1)throw Error('horizontal overflow '+label+' '+state+' '+JSON.stringify(data));
  if(data.brandWords)throw Error('unnecessary branding visible '+label+' '+state);
  if(!data.title)throw Error('missing screen heading '+label+' '+state);
  checks.push({label,state,kind:'PASS',...data});
 };
 try{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#main-content h1').waitFor();
  await check('S01');
  const nav=async id=>{
   if(width>=1100){if(['S10','S14'].includes(id)){await page.locator('.header-actions [data-action="open-more"]').click();return page.locator('#desktop-more-navigation [data-id="'+id+'"]').click();}return page.locator('.sidebar [data-id="'+id+'"]').click();}
   if(['S10','S14'].includes(id)){await page.locator('.footer-nav [data-action="open-more"]').click();return page.locator('.footer-nav #more-navigation [data-id="'+id+'"]').click();}
   return page.locator('.footer-nav [data-id="'+id+'"]').click();
  };
  await nav('S02');await check('S02');
  assert.equal(await page.locator('#field-distanceKm').count(),1);
  assert.equal(await page.locator('[data-action="confirm-save"]').count(),1);
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action="confirm-save"]').click();
  await page.locator('[role=dialog]').waitFor();
  await check('S04');
  await page.locator('[data-action="commit-record"]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  await check('S05');
  assert.equal(await page.locator(width>=1100?'.pc-region-matrix .pc-region-tile':'.region-list [data-action="select-region"]').count(),12);
  await page.locator('[data-action="open-region"]:visible').first().click();
  await page.locator('[role=dialog]').waitFor();
  await check('S06');
  await page.keyboard.press('Escape');
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  await nav('S07');await check('S07');
  await nav('S10');await check('S10');
  await nav('S14');await check('S14');
  await page.locator('[data-action="open-data-modal"]').click();
  await page.locator('[role=dialog]').waitFor();
  await check('S15');
  await page.keyboard.press('Escape');
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  await page.locator('[data-action="open-help"]').click();
  await page.locator('[role=dialog]').waitFor();
  await check('S16');
  if(runtimeErrors.length)throw Error('browser exceptions '+runtimeErrors.join(';'));
 }catch(e){errors.push({label,error:String(e.stack||e)});console.error(label,e);}
 await ctx.close();
}
await browser.close();
await fs.mkdir('audit',{recursive:true});
await fs.writeFile('audit/uiux_v038_skin_browser_checks.json',JSON.stringify({checks,errors,count:checks.length},null,2));
console.log('UI skin checks '+checks.length+' checks; errors '+errors.length);
if(errors.length)process.exitCode=1;