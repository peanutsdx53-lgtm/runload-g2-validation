import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const base=process.env.RUNLOAD_TEST_URL||'http://127.0.0.1:4173';
const dir='audit/uiux_v037_baseline';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch();const records=[],errors=[];
for(const [name,width,height] of [['pc1440',1440,900],['phone390',390,844],['phone320',320,700],['tablet800',800,900]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});
 const page=await ctx.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 async function shot(state){
  await page.locator('#main-content h1:visible').waitFor();await page.waitForTimeout(70);
  const file=name+'_'+state+'.png',p=dir+'/'+file;await page.screenshot({path:p,fullPage:true,animations:'disabled'});
  const metrics=await page.evaluate(()=>({title:(document.querySelector('#main-content .screen h1')??document.querySelector('#main-content h1'))?.textContent,dialog:document.querySelector('[role=dialog] h2')?.textContent??null,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,mainScrollWidth:document.querySelector('#main-content')?.scrollWidth}));
  records.push({name,width,height,state,file,sha256:crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex'),metrics});
  console.log(name,state,JSON.stringify(metrics));
 }
 async function nav(id){
  if(width>=1100){if(['S10','S14'].includes(id)){await page.locator('.header-actions [data-action="open-more"]').click();return page.locator('#desktop-more-navigation [data-id="'+id+'"]').click();}return page.locator('.sidebar [data-id="'+id+'"]').click();}
  if(id==='S10'||id==='S14'){await page.locator('.footer-nav [data-action="open-more"]').click();return page.locator('#more-navigation [data-id="'+id+'"]').click();}
  return page.locator('.footer-nav [data-id="'+id+'"]').click();
 }
 try{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await shot('S01_empty');
  await nav('S02');await shot('S02_input');
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action="confirm-save"]').click();await page.locator('[role=dialog]').waitFor();await shot('S04_confirm');
  await page.locator('[data-action="commit-record"]').click();await page.locator('[role=dialog]').waitFor({state:'detached'});await shot('S05_result');
  await page.locator('[data-action="open-region"]').click();await page.locator('[role=dialog]').waitFor();await shot('S06_detail');
  await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});
  await nav('S07');await shot('S07_history');
  await nav('S05');await page.locator('[data-action="new-record"]').click();await page.locator('#field-recordDate').fill('2026-10-08');
  await page.locator('#field-distanceKm').fill('4');
  await page.locator('#field-durationMinutes').fill('28');
  await page.locator('[data-action="confirm-save"]').click();await page.locator('[data-action="commit-record"]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  await nav('S07');await shot('S07_history_2');
  await nav('S10');await shot('S10_reflect');await nav('S14');await shot('S14_data');
  await page.locator('[data-action="open-data-modal"]').click();await page.locator('[role=dialog]').waitFor();await shot('S15_data_modal');
  await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});
  await nav('S01');await shot('S01_saved');await page.locator('[data-action="open-fatigue"]').click();await page.locator('[role=dialog]').waitFor();await shot('S03_fatigue');
  await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await page.locator('[data-action="open-help"]').click();await page.locator('[role=dialog]').waitFor();await shot('S16_help');
 }catch(e){errors.push({name,error:String(e.stack||e)});}
 records.push({name,pageErrors});await ctx.close();
}
await browser.close();await fs.writeFile('audit/uiux_v037_baseline.json',JSON.stringify({source:'G2 V0.37; synthetic data only; product unchanged',records,errors},null,2));if(errors.length)process.exitCode=1;