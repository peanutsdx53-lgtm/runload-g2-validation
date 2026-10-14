import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();
const all=[],errors=[];
const viewports=[['pc1440',1440,900],['pc1280',1280,800],['phone390',390,844],['phone320',320,700],['tablet800',800,900]];
const out='audit/v040_home';await fs.mkdir(out,{recursive:true});
for (const [name,width,height] of viewports) {
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',locale:'ja-JP',deviceScaleFactor:1});
 const page=await ctx.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#main-content .legacy-home-exact').waitFor();
  const stats=await page.evaluate(()=>{
   const rect=q=>{const el=document.querySelector(q);if(!el) return null;const b=el.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
   const links=[...document.querySelectorAll('.sidebar .navigation-item')].map(x=>x.innerText.trim());
   return {hero:rect('.home-hero'),rail:rect('.home-latest'),shortcuts:rect('.home-shortcuts'),nav:rect('.sidebar'),intro:rect('.home-page-intro'),footer:rect('.footer-nav'),width:document.documentElement.scrollWidth,viewport:innerWidth,links,
     text:document.querySelector('.screen-S01')?.innerText??'',font:getComputedStyle(document.querySelector('.home-hero')).fontFamily,canNavigate:!!document.querySelector('[data-action="new-record"]')};
  });
  if(stats.width>width+1)throw Error('horizontal overflow: '+JSON.stringify(stats));
  if(!stats.canNavigate||stats.text.includes('RunLoad')||stats.text.includes('チャレンジ')||stats.text.includes('実績'))throw Error('Home missing expected action or contains excluded feature');
  if(stats.links.length!==4)throw Error('Old desktop navigation count !=4');
  if(width>=1100){
    if(Math.abs(stats.hero.x-152)>9||Math.abs(stats.hero.y-225)>30||Math.abs(stats.hero.h-272)>18)throw Error('Desktop hero too far from old-app measured layout: '+JSON.stringify(stats.hero));
    if(Math.abs(stats.rail.x-1014)>95||Math.abs(stats.rail.y-stats.hero.y)>3)throw Error('Desktop rail misaligned: '+JSON.stringify(stats.rail));
    if(Math.abs(stats.shortcuts.y-613)>48)throw Error('Desktop shortcuts off old-app grid: '+JSON.stringify(stats.shortcuts));
  }
  await page.screenshot({path:`${out}/${name}_S01_empty.png`,fullPage:true,animations:'disabled'});
  const btn=page.locator('.home-shortcut[data-id="S07"]');
  await btn.click();
  await page.locator('.screen-S07').waitFor();
  await page.locator(width>=1100?'.sidebar [data-id="S01"]':'.footer-nav [data-id="S01"]').click();
  await page.locator('.legacy-home-exact').waitFor();
  await page.locator('.home-main-action').click();
  await page.locator('.screen-S02').waitFor();
  if(pageErrors.length)throw Error('JS page error '+pageErrors.join(';'));
  all.push({name,width,height,status:'PASS',layout:stats,checks:['nav4','old-home-boxes','excluded-feature-clean','history-and-new-record-navigation','no-horizontal-overflow','no-page-exceptions']});
  console.log('PASS',name,JSON.stringify({hero:stats.hero,rail:stats.rail,shortcuts:stats.shortcuts}));
 }catch(e){errors.push({name,error:String(e.stack||e)});console.error('FAIL',name,e);}
 await ctx.close();
}
await browser.close();
await fs.writeFile('audit/v040_home_layout_metrics.json',JSON.stringify({source:'V0.40 UI-only S01',tests:all,errors},null,2)+'\n');
if(errors.length)process.exitCode=1;