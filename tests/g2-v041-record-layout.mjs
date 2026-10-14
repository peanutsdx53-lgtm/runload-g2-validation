import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();
const rows=[];const errors=[];
for(const [device,width,height] of [['pc1440',1440,900],['pc1280',1280,800],['mobile390',390,844],['mobile320',320,700],['tablet800',800,900]]){
 const ctx=await browser.newContext({viewport:{width,height},locale:'ja-JP',reducedMotion:'reduce'});
 const page=await ctx.newPage();
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  const nav=width>=1100?'.sidebar [data-id="S02"]':'.footer-nav [data-id="S02"]';
  await page.locator(nav).click();
  const names=['.old-record-required','.old-record-status','.old-record-step:nth-of-type(2)','.old-record-step:nth-of-type(3)','.old-record-step:nth-of-type(4)','.old-record-steps','.old-mobile-record-actions'];
  const shapes=await page.evaluate(names=>Object.fromEntries(names.map(n=>{const el=document.querySelector(n);if(!el)return[n,null];const r=el.getBoundingClientRect(),style=getComputedStyle(el);return [n,{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),display:style.display}]})),names);
  const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,topText:document.querySelector('.old-record-required')?.innerText.slice(0,140),buttons:[...document.querySelectorAll('.old-record-workspace [data-action]')].map(x=>x.dataset.action)}));
  await fs.mkdir('audit/v041_record',{recursive:true});
  await page.screenshot({path:`audit/v041_record/${device}_S02.png`,fullPage:true,animations:'disabled'});
  if(metrics.scrollWidth>width+1)throw Error('horizontal page overflow '+JSON.stringify(metrics));
  if(!await page.locator('#field-recordDate').count())throw Error('required date missing');
  if(!await page.locator('#field-distanceKm').count())throw Error('required distance missing');
  if(!await page.locator('#field-durationMinutes').count())throw Error('required duration missing');
  await page.locator('.old-record-step').first().locator('summary').click();
  if(!await page.locator('#field-environment').isVisible())throw Error('optional course cannot open');
  await page.locator('.old-record-step').nth(1).locator('summary').click();
  if(!await page.locator('#field-runningMix').isVisible())throw Error('comparable optional section cannot open');
  await page.locator('.old-record-step').nth(2).locator('summary').click();
  if(!await page.locator('#field-recordBodyRegion').isVisible())throw Error('body observation cannot open');
  rows.push({device,shapes,metrics,status:'PASS'});
  console.log(device,JSON.stringify(shapes));
 }catch(e){errors.push({device,error:String(e)});console.error(device,String(e));}
 await ctx.close();
}
await browser.close();
await fs.mkdir('audit',{recursive:true});
await fs.writeFile('audit/v041_record_metrics.json',JSON.stringify({rows,errors},null,2));
if(errors.length)process.exitCode=1;
