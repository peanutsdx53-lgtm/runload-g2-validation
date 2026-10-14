import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.RUNLOAD_TEST_URL??'http://127.0.0.1:4173';
const cases=[], errors=[];
const browser=await chromium.launch();
for(const [device,width,height] of [['pc1440',1440,900],['phone390',390,844],['phone320',320,700],['tablet800',800,900]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await ctx.newPage();
 const log=(caseName,data={})=>cases.push({device,caseName,passed:true,...data});
 async function nav(id){
  if(width>=1100){await page.locator('.sidebar [data-id="'+id+'"]').click();return;}
  await page.locator('.footer-nav [data-id="'+id+'"]').click();
 }
 try{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#main-content h1:visible').waitFor();
  if(width<1100)await page.locator('.footer-nav [data-id="S02"]').click();
  await page.locator('[data-action="open-fatigue"]:visible').first().click();
  await page.locator('.modal-S03').waitFor();
  assert.equal(await page.locator('.rof-j-original-anchor').count(),5);
  assert.equal(await page.locator('.rof-choice').count(),11);
  const assetState=await page.locator('.rof-j-original-anchor img').evaluateAll(nodes=>nodes.map(x=>({
   source:x.getAttribute('src'),loaded:x.complete&&x.naturalWidth>0&&x.naturalHeight>0,
   width:x.naturalWidth,height:x.naturalHeight
  })));
  assert(assetState.every(v=>v.loaded),'Unloaded author-approved ROF art');
  await page.getByRole('button',{name:'疲労感 0',exact:true}).click();
  assert.equal(await page.locator('#field-fatigueValue').inputValue(),'0','zero must remain valid');
  assert.equal(await page.locator('.rof-choice[aria-pressed="true"]').count(),1);
  log('ROF-J five unaltered assets, anchored illustrations and selectable 0');
  await page.keyboard.press('Escape');
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  if(width>=1100)await nav('S02');
  await page.locator('#field-recordDate').fill('2026-10-10');
  await page.locator('#field-distanceKm').fill('5');
  await page.locator('#field-durationMinutes').fill('30');
  await page.locator('[data-action="confirm-save"]').click();
  await page.locator('[data-action="commit-record"]').click();
  await page.locator('[role=dialog]').waitFor({state:'detached'});
  for(const [v,count] of [['front',5],['back',4],['sole',3]]){
   await page.locator('[data-action="figure-view"][data-id="'+v+'"]').click();
   const ids=await page.locator('.body-region-selector').evaluateAll(nodes=>nodes.map(x=>x.getAttribute('data-id')));
   assert.equal(ids.length,count,'Mismatched selectable old-app silhouettes for '+v);
   assert.equal(new Set(ids).size,count);
   const expected={front:['R01','R03','R05','R06','R08'],back:['R02','R04','R07','R09'],sole:['R12','R11','R10']}[v];
   assert.deepEqual(ids,expected,'Map label to old silhouette must preserve anatomical location');
   assert.equal(await page.locator('.legacy-body-silhouette .body-silhouette-base path').count(),1);
   log('Old silhouette '+v,{visibleRegions:ids});
  }
  await page.locator('[data-action="figure-view"][data-id="front"]').click();
  const points=page.locator('.body-region-selector');
  await points.nth(0).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.body-region-selector[aria-pressed=true]').count(),1);
  log('Silhouette has actual keyboard-operable region selector');
  assert.equal(await page.locator('.region-list [data-action="select-region"]').count(),12);
  const widths=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,mainScrollWidth:document.querySelector('#main-content')?.scrollWidth}));
  assert(widths.documentWidth<=width+1,'horizontal overflow '+JSON.stringify(widths));
  log('All twelve results and no horizontal overflow',widths);
  await page.locator('[data-action="open-region"]').click();
  await page.locator('[role=dialog]').waitFor();
  const original=await page.locator('.modal-body').innerText();
  assert(original.includes('参考比'));
  assert(original.includes('出典'));
  log('Unmodified scientific metadata visible in body detail');
 }catch(e){errors.push({device,error:String(e.stack??e)});console.error(device,e);}
 await ctx.close();
}
await browser.close();
await fs.mkdir('audit',{recursive:true});
await fs.writeFile('audit/uiux_v039_original_visuals_browser_checks.json',JSON.stringify({
 app:'G2 V0.39 UI-only',note:'Never AI-generated artwork',cases,errors
},null,2)+'\n');
console.log('V039 visual checks',cases.length,'errors',errors.length);
if(errors.length)process.exitCode=1;
